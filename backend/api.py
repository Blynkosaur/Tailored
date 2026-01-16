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
import pdfplumber
from dotenv import load_dotenv

from main import (
    get_company_info,
    generate_cover_letter_latex,
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
        "https://www.bry4n.co",
        "https://tailored.bry4n.co",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class GenerateResponse(BaseModel):
    pdf: str  # base64 encoded PDF
    company_name: str | None = None


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

        # Save logo if provided
        if logo_bytes:
            logo_path = os.path.join(tmp_dir, "school.png")
            with open(logo_path, "wb") as f:
                f.write(logo_bytes)
        else:
            # Use default UWaterloo logo if exists
            default_logo = Path(__file__).parent.parent / "resume" / "school.png"
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
    _: HTTPAuthorizationCredentials = Depends(verify_token),
):
    """
    Generate a cover letter from a resume and job posting.

    Provide either job_url OR job_description (not both).
    """
    # Validate input
    if not job_url and not job_description:
        raise HTTPException(
            status_code=400, detail="Provide either job_url or job_description"
        )

    if job_url and job_description:
        raise HTTPException(
            status_code=400, detail="Provide only one of job_url or job_description"
        )

    # Validate resume file
    if not resume.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Resume must be a PDF file")

    try:
        # Read uploaded files
        resume_bytes = await resume.read()
        logo_bytes = await logo.read() if logo else None

        # Parse resume
        print("📄 Parsing resume...")
        resume_text = parse_resume_from_bytes(resume_bytes)

        # Get job description
        if job_url:
            print(f"🔍 Scraping job posting: {job_url}")
            loop = asyncio.get_event_loop()
            job_data = await loop.run_in_executor(executor, scrape_job_posting, job_url)
            job_desc = format_job_for_prompt(job_data)
        else:
            job_desc = job_description

        # Generate LaTeX (run in thread pool since it makes sync API calls)
        print("🤖 Generating cover letter...")
        loop = asyncio.get_event_loop()
        latex_content = await loop.run_in_executor(
            executor, generate_cover_letter_latex, resume_text, job_desc
        )

        # Compile to PDF
        print("📝 Compiling LaTeX to PDF...")
        pdf_bytes = await loop.run_in_executor(
            executor, compile_latex_with_logo, latex_content, logo_bytes
        )

        # Encode as base64
        pdf_base64 = base64.b64encode(pdf_bytes).decode("utf-8")

        print("✅ Cover letter generated successfully")
        return GenerateResponse(pdf=pdf_base64)

    except JobInfoError as e:
        print(f"❌ Job info error: {e}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        print(f"❌ Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
