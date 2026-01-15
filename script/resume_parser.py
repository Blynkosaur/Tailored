import pdfplumber
from pathlib import Path


def parse_resume(pdf_path: str | Path) -> dict:
    """
    Parse a resume PDF and extract its text content.
    
    Args:
        pdf_path: Path to the PDF resume file.
        
    Returns:
        A dictionary containing the extracted resume data.
    """
    pdf_path = Path(pdf_path)
    
    if not pdf_path.exists():
        raise FileNotFoundError(f"Resume not found: {pdf_path}")
    
    if pdf_path.suffix.lower() != ".pdf":
        raise ValueError(f"Expected a PDF file, got: {pdf_path.suffix}")
    
    text_content = []
    
    with pdfplumber.open(pdf_path) as pdf:
        for page in pdf.pages:
            page_text = page.extract_text()
            if page_text:
                text_content.append(page_text)
    
    full_text = "\n\n".join(text_content)
    
    return {
        "filename": pdf_path.name,
        "num_pages": len(text_content),
        "text": full_text,
    }


def parse_resumes_in_folder(folder_path: str | Path) -> list[dict]:
    """
    Parse all PDF resumes in a given folder.
    
    Args:
        folder_path: Path to the folder containing resume PDFs.
        
    Returns:
        A list of dictionaries, each containing extracted resume data.
    """
    folder_path = Path(folder_path)
    
    if not folder_path.exists():
        raise FileNotFoundError(f"Folder not found: {folder_path}")
    
    pdf_files = list(folder_path.glob("*.pdf"))
    
    if not pdf_files:
        return []
    
    return [parse_resume(pdf_file) for pdf_file in pdf_files]


if __name__ == "__main__":
    # Parse resumes from the resume folder
    resume_folder = Path(__file__).parent.parent / "resume"
    
    resumes = parse_resumes_in_folder(resume_folder)
    
    for resume in resumes:
        print(f"=== {resume['filename']} ({resume['num_pages']} page(s)) ===")
        print(resume["text"])
        print()
