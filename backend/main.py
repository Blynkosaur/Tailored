import os
from pathlib import Path
import re
import shutil
import subprocess
import tempfile

from dotenv import load_dotenv
from google import genai

from resume_parser import parse_resume
from scraper import scrape_job_posting, format_job_data


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
    
    Args:
        resume_text: The candidate's resume as plain text.
        job_description: The job posting description.
        
    Returns:
        LaTeX source code for the cover letter.
    """
    user_message = f"""Resume:
{resume_text}

Job Description:
{job_description}"""

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
    if len(parts) < 3 and job_data.get("raw_text"):
        parts.append(f"\nFull Job Posting Text:\n{job_data['raw_text'][:5000]}")
    
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
    print(f"📄 Parsing resume: {resume_path}")
    resume_data = parse_resume(resume_path)
    resume_text = resume_data["text"]
    
    print(f"🔍 Scraping job posting: {job_url}")
    job_data = scrape_job_posting(job_url)
    print(format_job_data(job_data))
    
    job_description = format_job_for_prompt(job_data)
    
    print(f"🤖 Generating cover letter with AI...")
    latex_content = generate_cover_letter_latex(resume_text, job_description)
    
    # Debug: Print the generated LaTeX
    print("\n" + "=" * 60)
    print("GENERATED LATEX:")
    print("=" * 60)
    print(latex_content)
    print("=" * 60 + "\n")
    
    # Also save the LaTeX to a file for inspection
    latex_debug_path = RESUME_DIR / "cover_letter_debug.tex"
    latex_debug_path.write_text(latex_content)
    print(f"📄 LaTeX saved to: {latex_debug_path}")
    
    print(f"📝 Compiling LaTeX to PDF...")
    pdf_bytes = compile_latex(latex_content)
    
    # Save to resume folder
    output_path = RESUME_DIR / output_filename
    output_path.write_bytes(pdf_bytes)
    
    print(f"✅ Cover letter saved to: {output_path}")
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
    print(f"📄 Parsing resume: {resume_path}")
    resume_data = parse_resume(resume_path)
    resume_text = resume_data["text"]
    
    print(f"🤖 Generating cover letter with AI...")
    latex_content = generate_cover_letter_latex(resume_text, job_description)
    
    print(f"📝 Compiling LaTeX to PDF...")
    pdf_bytes = compile_latex(latex_content)
    
    # Save to resume folder
    output_path = RESUME_DIR / output_filename
    output_path.write_bytes(pdf_bytes)
    
    print(f"✅ Cover letter saved to: {output_path}")
    return output_path


if __name__ == "__main__":
    import sys
    
    # Find resume in the resume folder
    resume_files = list(RESUME_DIR.glob("*.pdf"))
    resume_files = [f for f in resume_files if "cover_letter" not in f.name.lower()]
    
    if not resume_files:
        print(f"❌ No resume PDF found in {RESUME_DIR}")
        sys.exit(1)
    
    resume_path = resume_files[0]
    print(f"📄 Using resume: {resume_path.name}")
    
    # Get job URL from command line or prompt
    if len(sys.argv) > 1:
        job_url = sys.argv[1]
    else:
        job_url = input("Enter job posting URL: ").strip()
    
    if not job_url:
        print("❌ No job URL provided")
        sys.exit(1)
    
    # Generate the cover letter
    output_path = generate_cover_letter(resume_path, job_url)
    print(f"\n🎉 Done! Open {output_path} to view your cover letter.")
