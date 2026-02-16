import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import tempfile
from datetime import datetime

from dotenv import load_dotenv
from google import genai

from resume_parser import parse_resume
from scraper import scrape_job_posting, format_job_data
from chains import invoke_generation, invoke_edit


# Load environment variables from .env file
load_dotenv()

# Paths
BACKEND_DIR = Path(__file__).parent
RESUME_DIR = BACKEND_DIR.parent / "resume"
PROMPT_PATH = BACKEND_DIR / "prompt.txt"

# Load the system prompt for cover letter generation
COVER_LETTER_SYSTEM_PROMPT = PROMPT_PATH.read_text() if PROMPT_PATH.exists() else ""

# Initialize Gemini client (uses GEMINI_API_KEY from .env)
client = genai.Client(api_key=os.environ.get("GEMINI_API_KEY"))


class JobInfoError(Exception):
    """Raised when company or role cannot be detected from job description."""
    pass


def extract_contact_info(resume_text: str) -> dict:
    """
    Extract name, email, and phone from resume using regex.
    
    Args:
        resume_text: The resume text content.
        
    Returns:
        Dictionary with name, email, and phone.
    """
    import re
    
    # Extract email using regex
    email_pattern = r'[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}'
    email_matches = re.findall(email_pattern, resume_text)
    
    # Filter out emails that look like URLs or are LinkedIn/GitHub
    email = None
    for match in email_matches:
        if 'linkedin' not in match.lower() and 'github' not in match.lower():
            email = match
            break
    
    # Extract phone using regex
    phone_patterns = [
        r'\+?1?[-.\s]?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}',  # (123) 456-7890, 123-456-7890, +1 123 456 7890
        r'\d{3}[-.\s]\d{3}[-.\s]\d{4}',  # 123-456-7890
        r'\(\d{3}\)\s*\d{3}[-.\s]?\d{4}',  # (123) 456-7890
    ]
    phone = None
    for pattern in phone_patterns:
        phone_matches = re.findall(pattern, resume_text)
        if phone_matches:
            phone = phone_matches[0].strip()
            break
    
    # Extract name - assume it's the first line or first capitalized words
    lines = resume_text.strip().split('\n')
    name = "Candidate"
    for line in lines[:5]:  # Check first 5 lines
        line = line.strip()
        # Skip empty lines and lines that look like contact info
        if not line or '@' in line or 'http' in line.lower() or line.isdigit():
            continue
        # Take first non-empty line that looks like a name
        if len(line) < 50 and not any(c.isdigit() for c in line):
            name = line
            break
    
    # Capitalize name properly (First Letter Of Each Word)
    name = ' '.join(word.capitalize() for word in name.split())
    
    return {"name": name, "email": email, "phone": phone}


def get_company_info(job_description: str) -> dict:
    """
    Call Gemini API to extract company name, role, and research what the company does.
    
    Args:
        job_description: The job posting description containing company name.
        
    Returns:
        Dictionary with company name, role, and description.
        
    Raises:
        JobInfoError: If company or role cannot be detected.
    """
    system_prompt = """You are a company research assistant with knowledge of real companies. Given a job description, identify the company, the job role, and provide SPECIFIC, FACTUAL information about the company.

Your task:
1. Identify the company name from the job description
2. Identify the job role/title from the job description
3. Using your knowledge of this company, provide CONCRETE details about:
   - What specific products or services they offer (name actual products if possible)
   - What industry they operate in (e.g., fintech, e-commerce, SaaS, etc.)
   - Who their customers are (consumers, businesses, etc.)
   - What makes them notable or unique in their market

Respond in this exact JSON format (no markdown, no code fences):
{
    "company_name": "Company Name Here or null if not found",
    "role": "Job Title Here or null if not found",
    "description": "Specific description with actual products, services, and industry details..."
}

IMPORTANT: 
- If the company name is NOT EXPLICITLY WRITTEN in the job description text, you MUST set company_name to null
- If the job role/title is NOT EXPLICITLY WRITTEN in the job description text, you MUST set role to null
- Do NOT infer, guess, or assume a company name based on context, writing style, or job type
- Do NOT hallucinate or make up company names - ONLY extract what is explicitly stated
- The company name must appear as actual text in the job description, not be guessed from context
- Do NOT give vague descriptions like "a technology company" or "offers software solutions"
- Give SPECIFIC details like "Super.com is a fintech app that helps users save money through discounted hotel bookings, buy-now-pay-later services, and a cashback savings account"
- If you know the company, use your real knowledge about them
- Be factual and specific about their actual business model and offerings"""

    user_message = f"""Identify the company and job role in this job description, and tell me specifically what the company does (their actual products, services, industry, and customers):

{job_description}"""

    response = client.models.generate_content(
        model="gemini-2.0-flash",
        contents=user_message,
        config={
            "system_instruction": system_prompt,
            "temperature": 0.5,
        },
    )

    # Parse the JSON response
    response_text = response.text.strip()
    
    # Strip markdown code fences if present
    if response_text.startswith("```"):
        lines = response_text.split("\n")
        if lines[-1].strip() == "```":
            lines = lines[1:-1]
        else:
            lines = lines[1:]
        response_text = "\n".join(lines)
    
    try:
        company_info = json.loads(response_text)
    except json.JSONDecodeError:
        raise JobInfoError("Failed to parse job information")
    
    # Validate company name
    company_name = company_info.get("company_name")
    invalid_company_names = [
        "null", "none", "unknown", "not found", "not specified", 
        "n/a", "na", "the company", "company", "company name",
        "company name here", "[company]", "[company name]"
    ]
    if not company_name or company_name.lower().strip() in invalid_company_names:
        raise JobInfoError("Could not detect company name from the job description. Please include the company name.")
    
    # Validate role
    role = company_info.get("role")
    invalid_role_names = [
        "null", "none", "unknown", "not found", "not specified",
        "n/a", "na", "the role", "role", "job title",
        "job title here", "[role]", "[job title]"
    ]
    if not role or role.lower().strip() in invalid_role_names:
        raise JobInfoError("Could not detect job role/title from the job description. Please include the job title.")
    
    return company_info


def compile_latex(latex_content: str) -> bytes:
    """
    Compile LaTeX content to PDF.
    
    Args:
        latex_content: The LaTeX source code to compile.
        
    Returns:
        The compiled PDF as bytes.
        
    Raises:
        Exception: If LaTeX compilation fails.
    """
    with tempfile.TemporaryDirectory() as tmp_dir:
        tex_file = "document.tex"
        pdf_file = "document.pdf"
        tex_path = os.path.join(tmp_dir, tex_file)
        pdf_path = os.path.join(tmp_dir, pdf_file)

        # Copy school logo to temp directory if it exists
        logo_src = RESUME_DIR / "school.png"
        if logo_src.exists():
            shutil.copy(logo_src, os.path.join(tmp_dir, "school.png"))

        with open(tex_path, "w", encoding="utf-8") as f:
            f.write(latex_content)

        process = subprocess.run(
            ["pdflatex", "-interaction=nonstopmode", tex_file],
            cwd=tmp_dir,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
        )

        if not os.path.exists(pdf_path):
            log = process.stdout.decode("utf-8") + "\n" + process.stderr.decode("utf-8")
            raise Exception(f"LaTeX compilation failed:\n{log}")

        with open(pdf_path, "rb") as f:
            pdf_bytes = f.read()

        return pdf_bytes


def generate_cover_letter_latex(resume_text: str, job_description: str) -> str:
    """
    Call Gemini API to generate LaTeX cover letter code.
    
    First extracts contact info and company description, then generates the cover letter.
    
    Args:
        resume_text: The candidate's resume as plain text.
        job_description: The job posting description.
        
    Returns:
        LaTeX source code for the cover letter.
    """
    # Extract contact info from resume using regex (no AI)
    print("Extracting contact info...")
    contact_info = extract_contact_info(resume_text)
    print(f"   Name: {contact_info.get('name', 'Unknown')}")
    print(f"   Email: {contact_info.get('email', 'Not found')}")
    print(f"   Phone: {contact_info.get('phone', 'Not found')}")
    
    # First call: Get company description
    print("Researching company description...")
    company_info = get_company_info(job_description)
    print(f"   Company: {company_info.get('company_name', 'Unknown')}")
    print(f"   Description: {company_info.get('description', 'N/A')[:100]}...")
    
    # Build contact info section - name, email, and phone if available
    contact_lines = [f"Name: {contact_info.get('name', 'Candidate')}"]
    if contact_info.get('email'):
        contact_lines.append(f"Email: {contact_info['email']}")
    if contact_info.get('phone'):
        contact_lines.append(f"Phone: {contact_info['phone']}")
    contact_section = "\n".join(contact_lines)
    
    # Build company context section
    company_context = f"""=== CANDIDATE CONTACT INFO (use ONLY this for contact details) ===
{contact_section}

NOTE: Use ONLY the contact info listed above. Do NOT add any other contact info, links, or URLs.
=== END OF CONTACT INFO ===

=== COMPANY RESEARCH (use this to personalize the cover letter) ===
Company Name: {company_info.get('company_name', 'Unknown')}

Company Description: {company_info.get('description', 'Not available')}

=== END OF COMPANY RESEARCH ===

"""
    
    # Third call: Generate the cover letter with company context
    user_message = f"""{company_context}=== CANDIDATE'S RESUME (use this for work experience and skills ONLY, not contact info) ===
{resume_text}

=== END OF RESUME ===

=== JOB DESCRIPTION (use this for the target position) ===
{job_description}

=== END OF JOB DESCRIPTION ===

Generate a cover letter for the CANDIDATE applying to the JOB above. 
IMPORTANT: For contact info, use ONLY what is provided in the CANDIDATE CONTACT INFO section above. Do NOT extract contact info from the resume."""

    response = client.models.generate_content(
        model="gemini-2.0-flash",
        contents=user_message,
        config={
            "system_instruction": COVER_LETTER_SYSTEM_PROMPT,
            "temperature": 0.7,
        },
    )

    latex_content = response.text

    # Strip markdown code fences if the model included them
    if latex_content.startswith("```"):
        lines = latex_content.split("\n")
        if lines[-1].strip() == "```":
            lines = lines[1:-1]
        else:
            lines = lines[1:]
        latex_content = "\n".join(lines)

    # Fix common LaTeX escaping issues
    # Escape & that aren't already escaped (not preceded by \)
    latex_content = re.sub(r'(?<!\\)&', r'\\&', latex_content)
    # Escape % only when it appears after a digit (like "26%") - not at end of lines
    latex_content = re.sub(r'(\d)%', r'\1\\%', latex_content)
    # Fix double escapes that might have been created
    latex_content = latex_content.replace('\\\\&', '\\&')
    latex_content = latex_content.replace('\\\\%', '\\%')

    return latex_content


def generate_cover_letter_sections(resume_text: str, job_description: str) -> dict:
    """
    Generate cover letter content as a JSON-serializable dict of sections
    for template injection and editable HTML view.
    """
    print("Extracting contact info...")
    contact_info = extract_contact_info(resume_text)
    print("Researching company description...")
    company_info = get_company_info(job_description)

    contact_section = "\n".join([
        f"Name: {contact_info.get('name', 'Candidate')}",
        *([f"Email: {contact_info['email']}"] if contact_info.get("email") else []),
        *([f"Phone: {contact_info['phone']}"] if contact_info.get("phone") else []),
    ])
    company_context = f"""=== CANDIDATE CONTACT INFO (use ONLY this) ===
{contact_section}
=== END ===

=== COMPANY RESEARCH ===
Company: {company_info.get('company_name', 'Unknown')}
Description: {company_info.get('description', 'Not available')}
=== END ===

=== RESUME (ONLY use facts that appear here; do not mention any company, project, or metric not listed) ===
{resume_text[:6000]}
=== END ===

=== JOB DESCRIPTION ===
{job_description[:6000]}
=== END ===
"""

    # LangChain: retriever (job_description) → prompt + template block → LLM → parse
    parsed = invoke_generation(company_context=company_context, job_description=job_description)

    # Normalize body to list of paragraphs
    raw_body = parsed.get("body")
    if isinstance(raw_body, list):
        body_list = [str(p).strip() for p in raw_body if p]
    else:
        b1 = (parsed.get("body_1") or "").strip()
        b2 = (parsed.get("body_2") or "").strip()
        body_list = [b1, b2] if b2 else ([b1] if b1 else [])
    if not body_list:
        body_list = [""]  # at least one empty paragraph

    today = datetime.now().strftime("%B %d, %Y")
    sections = {
        "date": today,
        "sender_name": contact_info.get("name", "Candidate"),
        "sender_email": contact_info.get("email") or "",
        "addressee": (parsed.get("addressee") or "").replace("\\n", "\n"),
        "greeting": parsed.get("greeting") or "Dear Hiring Manager,",
        "intro": parsed.get("intro") or "",
        "body": body_list,
        "closing": parsed.get("closing") or "",
        "sincerely": "Sincerely yours,",
        "signature": parsed.get("signature") or contact_info.get("name", "Candidate"),
    }
    return sections


INAPPROPRIATE_GUARDRAIL_PROMPT = """You are a content guardrail. Reply with exactly one word: YES or NO.

Reply NO only if the user message is inappropriate (offensive, harmful, harassing, or completely unrelated to editing a cover letter in this app—e.g. asking for weather, recipes, or other unrelated tasks). Be relaxed: if the message could reasonably be interpreted as a request about the cover letter or the letter content, reply YES. Vague or creative edit requests are fine.

User message: """


def is_cover_letter_related(instruction: str) -> bool:
    """Return False only if the instruction is inappropriate; otherwise allow through."""
    if not (instruction or "").strip():
        return False
    instruction = instruction.strip()[:500]
    try:
        response = client.models.generate_content(
            model="gemini-2.0-flash",
            contents=INAPPROPRIATE_GUARDRAIL_PROMPT + instruction,
            config={"temperature": 0},
        )
        text = (response.text or "").strip().upper()
        # NO = inappropriate, reject. YES or anything else = allow.
        return not text.startswith("NO")
    except Exception:
        return True  # on error, allow the request through


def edit_letter_by_instruction(
    sections: dict, instruction: str, resume_text: str = "", chat_history: list[dict] | None = None
) -> dict:
    """
    Propose revised cover letter sections based on user instruction.
    Returns full sections dict (proposed); frontend may diff and accept/reject.
    chat_history: list of {"role": "user"|"assistant", "content": str} for context.
    """
    chat_history = chat_history or []
    # Build a compact representation of current sections for the prompt
    body = sections.get("body")
    if isinstance(body, list):
        body_str = json.dumps(body, ensure_ascii=False)
    else:
        body_str = json.dumps([sections.get("body_1") or "", sections.get("body_2") or ""], ensure_ascii=False)
    current = {
        "addressee": sections.get("addressee") or "",
        "greeting": sections.get("greeting") or "",
        "intro": sections.get("intro") or "",
        "body": body if isinstance(body, list) else [sections.get("body_1") or "", sections.get("body_2") or ""],
        "closing": sections.get("closing") or "",
        "signature": sections.get("signature") or "",
    }
    current_json = json.dumps(current, ensure_ascii=False, indent=2)

    resume_block = ""
    if resume_text and resume_text.strip():
        resume_block = f"""
=== CANDIDATE RESUME (only use facts from here; do not invent projects or details) ===
{resume_text[:8000]}
=== END ===

"""

    history_block = ""
    if chat_history:
        lines = []
        for m in chat_history[-6:]:  # last 3 exchanges
            role = (m.get("role") or "user").capitalize()
            content = (m.get("content") or "").strip()
            if content:
                lines.append(f"{role}: {content}")
        if lines:
            history_block = "\n=== RECENT CONVERSATION ===\n" + "\n".join(lines) + "\n=== END ===\n\n"

    # LangChain: retriever (edit_query) → prompt + template block → LLM → parse
    body_list_for_query = current.get("body") or []
    first_body = (body_list_for_query[0] if isinstance(body_list_for_query, list) and body_list_for_query else "") or ""
    edit_query = f"{current.get('intro') or ''} {first_body} {instruction}"
    parsed = invoke_edit(
        current_json=current_json,
        resume_block=resume_block,
        history_block=history_block,
        instruction=instruction,
        edit_query=edit_query,
    )

    # Merge with existing sections so we preserve date, sender_name, sender_email, sincerely
    body_list = parsed.get("body")
    if isinstance(body_list, list):
        body_list = [str(p).strip() for p in body_list]
    else:
        body_list = [""]
    proposed = {
        **sections,
        "addressee": (parsed.get("addressee") or sections.get("addressee") or "").replace("\\n", "\n"),
        "greeting": parsed.get("greeting") or sections.get("greeting") or "",
        "intro": parsed.get("intro") or sections.get("intro") or "",
        "body": body_list,
        "closing": parsed.get("closing") or sections.get("closing") or "",
        "signature": parsed.get("signature") or sections.get("signature") or "",
    }
    return proposed


def format_job_for_prompt(job_data: dict) -> str:
    """
    Format scraped job data into a string for the LLM prompt.
    
    Args:
        job_data: The scraped job posting data.
        
    Returns:
        Formatted job description string.
    """
    parts = []
    
    if job_data.get("title"):
        parts.append(f"Job Title: {job_data['title']}")
    if job_data.get("company"):
        parts.append(f"Company: {job_data['company']}")
    if job_data.get("location"):
        parts.append(f"Location: {job_data['location']}")
    if job_data.get("work_arrangement"):
        parts.append(f"Work Arrangement: {job_data['work_arrangement']}")
    
    if job_data.get("about_company"):
        parts.append(f"\nAbout the Company:\n" + "\n".join(job_data["about_company"][:3]))
    
    if job_data.get("responsibilities"):
        parts.append(f"\nResponsibilities:")
        for item in job_data["responsibilities"]:
            parts.append(f"• {item}")
    
    if job_data.get("requirements"):
        parts.append(f"\nRequirements:")
        for item in job_data["requirements"]:
            parts.append(f"• {item}")
    
    if job_data.get("preferred_qualifications"):
        parts.append(f"\nPreferred Qualifications:")
        for item in job_data["preferred_qualifications"]:
            parts.append(f"• {item}")
    
    if job_data.get("skills_mentioned"):
        parts.append(f"\nSkills Mentioned: {', '.join(job_data['skills_mentioned'])}")
    
    # If we didn't extract much structured data, fall back to raw text
    has_content = any([
        job_data.get("responsibilities"),
        job_data.get("requirements"),
        job_data.get("about_company"),
    ])
    if not has_content and job_data.get("raw_text"):
        # Use raw text if structured parsing failed
        parts.append(f"\nFull Job Posting Text:\n{job_data['raw_text'][:8000]}")
    
    return "\n".join(parts)


def generate_cover_letter(
    resume_path: str | Path,
    job_url: str,
    output_filename: str = "cover_letter.pdf",
) -> Path:
    """
    Generate a tailored cover letter from a resume and job posting URL.
    
    Args:
        resume_path: Path to the resume PDF.
        job_url: URL of the job posting to scrape.
        output_filename: Name for the output PDF file.
        
    Returns:
        Path to the saved cover letter PDF.
    """
    print(f"Parsing resume: {resume_path}")
    resume_data = parse_resume(resume_path)
    resume_text = resume_data["text"]
    
    print(f"Scraping job posting: {job_url}")
    job_data = scrape_job_posting(job_url)
    print(format_job_data(job_data))
    
    job_description = format_job_for_prompt(job_data)
    
    print(f"Generating cover letter with AI...")
    latex_content = generate_cover_letter_latex(resume_text, job_description)
    
    print("\n" + "=" * 60)
    print("GENERATED LATEX:")
    print("=" * 60)
    print(latex_content)
    print("=" * 60 + "\n")
    
    latex_debug_path = RESUME_DIR / "cover_letter_debug.tex"
    latex_debug_path.write_text(latex_content)
    print(f"LaTeX saved to: {latex_debug_path}")
    
    print(f"Compiling LaTeX to PDF...")
    pdf_bytes = compile_latex(latex_content)
    
    output_path = RESUME_DIR / output_filename
    output_path.write_bytes(pdf_bytes)
    
    print(f"Cover letter saved to: {output_path}")
    return output_path


def generate_cover_letter_from_text(
    resume_path: str | Path,
    job_description: str,
    output_filename: str = "cover_letter.pdf",
) -> Path:
    """
    Generate a tailored cover letter from a resume and job description text.
    
    Args:
        resume_path: Path to the resume PDF.
        job_description: The job posting as plain text.
        output_filename: Name for the output PDF file.
        
    Returns:
        Path to the saved cover letter PDF.
    """
    print(f"Parsing resume: {resume_path}")
    resume_data = parse_resume(resume_path)
    resume_text = resume_data["text"]
    
    print(f"Generating cover letter with AI...")
    latex_content = generate_cover_letter_latex(resume_text, job_description)
    
    print(f"Compiling LaTeX to PDF...")
    pdf_bytes = compile_latex(latex_content)
    
    output_path = RESUME_DIR / output_filename
    output_path.write_bytes(pdf_bytes)
    
    print(f"Cover letter saved to: {output_path}")
    return output_path


if __name__ == "__main__":
    import sys
    
    resume_files = list(RESUME_DIR.glob("*.pdf"))
    resume_files = [f for f in resume_files if "cover_letter" not in f.name.lower()]
    
    if not resume_files:
        print(f"No resume PDF found in {RESUME_DIR}")
        sys.exit(1)
    
    resume_path = resume_files[0]
    print(f"Using resume: {resume_path.name}")
    
    if len(sys.argv) > 1:
        job_url = sys.argv[1]
    else:
        job_url = input("Enter job posting URL: ").strip()
    
    if not job_url:
        print("No job URL provided")
        sys.exit(1)
    
    output_path = generate_cover_letter(resume_path, job_url)
    print(f"\nDone! Open {output_path} to view your cover letter.")
