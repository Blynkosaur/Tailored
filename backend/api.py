import asyncio
import base64
import io
import os
import tempfile
import shutil
import subprocess
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor

from fastapi import FastAPI, File, Form, UploadFile, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel
import pdfplumber  # type: ignore[import-untyped]
from dotenv import load_dotenv

from main import (
    get_company_info,
    generate_cover_letter_latex,
    generate_cover_letter_sections,
    format_job_for_prompt,
    COVER_LETTER_SYSTEM_PROMPT,
    JobInfoError,
)
from scraper import scrape_job_posting

# Thread pool for running sync functions
executor = ThreadPoolExecutor(max_workers=4)

load_dotenv()

# API Key from environment
API_KEY = os.environ.get("API_KEY", "")

app = FastAPI(title="Tailored API", description="Cover letter generator API")
security = HTTPBearer()


def verify_token(credentials: HTTPAuthorizationCredentials = Depends(security)):
    """Verify the bearer token."""
    if not API_KEY:
        return  # No API key set, skip auth
    if credentials.credentials != API_KEY:
        raise HTTPException(status_code=401, detail="Invalid token")
    return credentials


# CORS for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "https://bry4n.co",
        "https://bry4n.co",
        "https://www.bry4n.co",
        "https://tailored.bry4n.co",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class GenerateResponse(BaseModel):
    pdf: str  # base64 encoded PDF
    sections: dict  # tokenized sections for editable HTML view (sender_name, addressee, greeting, intro, body_1, body_2, closing, signature)
    # All template fields (same names as in cover_letter_template.tex)
    date: str = ""
    sender_block: str = ""
    addressee_tex: str = ""
    greeting: str = ""
    intro: str = ""
    body_1: str = ""
    body_2: str = ""
    closing: str = ""
    sincerely: str = ""
    signature: str = ""
    company_name: str | None = None


class CompileResponse(BaseModel):
    pdf: str  # base64 encoded PDF


class LatexResponse(BaseModel):
    latex: str  # built LaTeX source from sections (same as used for PDF)


# Template-to-token: load once
_TEMPLATE_PATH = Path(__file__).parent / "cover_letter_template.tex"
_COVER_LETTER_TEMPLATE = _TEMPLATE_PATH.read_text(encoding="utf-8") if _TEMPLATE_PATH.exists() else ""


def _escape_latex(s: str) -> str:
    if not s:
        return ""
    s = s.replace("\\", "\\textbackslash ")
    for char, repl in [("&", "\\&"), ("%", "\\%"), ("#", "\\#"), ("$", "\\$"), ("_", "\\_"), ("{", "\\{"), ("}", "\\}")]:
        s = s.replace(char, repl)
    return s


def _sections_to_template_fields(sections: dict) -> dict:
    """Build template-shaped fields from sections (plain text, no LaTeX escaping). For API response."""
    sender_name = (sections.get("sender_name") or "").strip()
    sender_email = (sections.get("sender_email") or "").strip()
    sender_block = sender_name
    if sender_email:
        sender_block = sender_name + "\n" + sender_email

    addressee = sections.get("addressee") or ""
    addressee_tex = "\n".join(line.strip() for line in addressee.split("\n") if line.strip())

    return {
        "date": sections.get("date") or "",
        "sender_block": sender_block,
        "addressee_tex": addressee_tex,
        "greeting": sections.get("greeting") or "",
        "intro": sections.get("intro") or "",
        "body_1": sections.get("body_1") or "",
        "body_2": sections.get("body_2") or "",
        "closing": sections.get("closing") or "",
        "sincerely": sections.get("sincerely") or "Sincerely yours,",
        "signature": sections.get("signature") or "",
    }


def build_tex_from_sections(sections: dict) -> str:
    """Inject section tokens into the cover letter template. Sections dict has sender_name, sender_email, addressee, greeting, intro, body_1, body_2, closing, signature."""
    sender_name = _escape_latex(sections.get("sender_name") or "")
    sender_email = _escape_latex(sections.get("sender_email") or "")
    sender_block = sender_name
    if sender_email:
        sender_block = sender_name + " \\\\\n  " + sender_email

    addressee = sections.get("addressee") or ""
    addressee_tex = " \\\\\n  ".join(_escape_latex(line) for line in addressee.split("\n") if line.strip())

    replacements = {
        "sender_block": sender_block,
        "addressee_tex": addressee_tex or " ",
        "date": _escape_latex(sections.get("date") or ""),
        "greeting": _escape_latex(sections.get("greeting") or ""),
        "intro": _escape_latex(sections.get("intro") or ""),
        "body_1": _escape_latex(sections.get("body_1") or ""),
        "body_2": _escape_latex(sections.get("body_2") or ""),
        "closing": _escape_latex(sections.get("closing") or ""),
        "sincerely": _escape_latex(sections.get("sincerely") or "Sincerely yours,"),
        "signature": _escape_latex(sections.get("signature") or ""),
    }
    tex = _COVER_LETTER_TEMPLATE
    for key, value in replacements.items():
        tex = tex.replace("{{" + key + "}}", value)
    return tex


def parse_resume_from_bytes(pdf_bytes: bytes) -> str:
    """Parse resume PDF from bytes and return text content."""
    text_content = []
    with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
        for page in pdf.pages:
            page_text = page.extract_text()
            if page_text:
                text_content.append(page_text)
    return "\n\n".join(text_content)


def compile_latex_with_logo(
    latex_content: str, logo_bytes: bytes | None = None
) -> bytes:
    """
    Compile LaTeX content to PDF with optional logo.

    Args:
        latex_content: The LaTeX source code to compile.
        logo_bytes: Optional logo image bytes.

    Returns:
        The compiled PDF as bytes.
    """
    with tempfile.TemporaryDirectory() as tmp_dir:
        tex_file = "document.tex"
        pdf_file = "document.pdf"
        tex_path = os.path.join(tmp_dir, tex_file)
        pdf_path = os.path.join(tmp_dir, pdf_file)

        if logo_bytes:
            logo_path = os.path.join(tmp_dir, "school.png")
            with open(logo_path, "wb") as f:
                f.write(logo_bytes)
        else:
            default_logo = Path(__file__).parent / "school.png"
            if default_logo.exists():
                shutil.copy(default_logo, os.path.join(tmp_dir, "school.png"))

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


@app.post("/generate", response_model=GenerateResponse)
async def generate_cover_letter(
    resume: UploadFile = File(..., description="Resume PDF file"),
    logo: UploadFile | None = File(None, description="School logo image (optional)"),
    job_url: str | None = Form(None, description="Job posting URL"),
    job_description: str | None = Form(None, description="Job description text"),
    job_pdf: UploadFile | None = File(None, description="Job description PDF file"),
    _: HTTPAuthorizationCredentials = Depends(verify_token),
):
    """
    Generate a cover letter from a resume and job posting.

    Provide either job_url, job_description, or job_pdf (only one).
    """
    job_inputs = sum([bool(job_url), bool(job_description), job_pdf is not None])
    
    if job_inputs == 0:
        raise HTTPException(
            status_code=400, detail="Provide job_url, job_description, or job_pdf"
        )

    if job_inputs > 1:
        raise HTTPException(
            status_code=400, detail="Provide only one of job_url, job_description, or job_pdf"
        )

    if not (resume.filename or "").lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Resume must be a PDF file")

    try:
        resume_bytes = await resume.read()
        logo_bytes = await logo.read() if logo else None

        print("Parsing resume...")
        resume_text = parse_resume_from_bytes(resume_bytes)

        if job_url:
            print(f"Scraping job posting: {job_url}")
            loop = asyncio.get_event_loop()
            job_data = await loop.run_in_executor(executor, scrape_job_posting, job_url)
            job_desc = format_job_for_prompt(job_data)
        elif job_pdf:
            print("Parsing job description PDF...")
            job_pdf_bytes = await job_pdf.read()
            job_desc = parse_resume_from_bytes(job_pdf_bytes)
        else:
            job_desc = job_description

        print("Generating cover letter sections...")
        loop = asyncio.get_event_loop()
        job_desc_str = job_desc if job_desc is not None else ""
        sections = await loop.run_in_executor(
            executor, generate_cover_letter_sections, resume_text, job_desc_str
        )

        print("Building LaTeX and compiling to PDF...")
        latex_content = build_tex_from_sections(sections)
        pdf_bytes = await loop.run_in_executor(
            executor, compile_latex_with_logo, latex_content, logo_bytes
        )

        pdf_base64 = base64.b64encode(pdf_bytes).decode("utf-8")
        fields = _sections_to_template_fields(sections)
        print("Cover letter generated successfully")
        print("Response includes sections keys:", list(sections.keys()))
        return GenerateResponse(
            pdf=pdf_base64,
            sections=sections,
            date=fields["date"],
            sender_block=fields["sender_block"],
            addressee_tex=fields["addressee_tex"],
            greeting=fields["greeting"],
            intro=fields["intro"],
            body_1=fields["body_1"],
            body_2=fields["body_2"],
            closing=fields["closing"],
            sincerely=fields["sincerely"],
            signature=fields["signature"],
        )

    except JobInfoError as e:
        print(f"Job info error: {e}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        print(f"Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/compile", response_model=CompileResponse)
async def compile_sections(
    sections: str = Form(..., description="JSON string of section tokens"),
    logo: UploadFile | None = File(None, description="School logo image (optional)"),
    _: HTTPAuthorizationCredentials = Depends(verify_token),
):
    """
    Inject section tokens into template and compile to PDF (no AI). Use after editing the letter in the HTML view.
    """
    try:
        import json as _json
        section_dict = _json.loads(sections)
        logo_bytes = await logo.read() if logo else None
        latex_content = build_tex_from_sections(section_dict)
        loop = asyncio.get_event_loop()
        pdf_bytes = await loop.run_in_executor(
            executor, compile_latex_with_logo, latex_content, logo_bytes
        )
        pdf_base64 = base64.b64encode(pdf_bytes).decode("utf-8")
        return CompileResponse(pdf=pdf_base64)
    except Exception as e:
        print(f"Compile error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


class LatexBody(BaseModel):
    sections: dict


@app.post("/latex", response_model=LatexResponse)
async def get_latex(
    body: LatexBody,
    _: HTTPAuthorizationCredentials = Depends(verify_token),
):
    """
    Return the LaTeX source built from the given sections (same template used for PDF).
    Useful to inspect or load the rendered PDF content.
    """
    try:
        latex_content = build_tex_from_sections(body.sections)
        return LatexResponse(latex=latex_content)
    except Exception as e:
        print(f"LaTeX build error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
