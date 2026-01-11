# Tailored Cover Letter Generator

Generate personalized cover letters from your resume and job postings using AI.

## Features

- 📄 Parses PDF resumes automatically
- 🔍 Scrapes job postings from any URL (LinkedIn, Greenhouse, Lever, etc.)
- 🤖 Uses Google Gemini AI to generate tailored cover letters
- 📝 Outputs professional LaTeX-formatted PDFs

## Prerequisites

- Python 3.10+
- pdflatex (for compiling LaTeX to PDF)
- Google Gemini API key

### Install pdflatex (macOS)

```bash
brew install --cask basictex
eval "$(/usr/libexec/path_helper)"
```

## Setup

1. **Create and activate virtual environment:**

```bash
cd backend
python3 -m venv venv
source venv/bin/activate
```

2. **Install dependencies:**

```bash
pip install -r requirements.txt
playwright install chromium
```

3. **Set up your API key:**

Create a `.env` file in the project root:

```
GEMINI_API_KEY=your-api-key-here
```

Get your API key from [Google AI Studio](https://aistudio.google.com/apikey).

4. **Add your resume:**

Place your resume PDF in the `resume/` folder.

## Usage

### Generate a cover letter from a job URL

```bash
source venv/bin/activate
python main.py "https://boards.greenhouse.io/company/jobs/123456"
```

Or run interactively:

```bash
python main.py
# Then paste the job URL when prompted
```

The cover letter will be saved to `resume/cover_letter.pdf`.

### Use as a module

```python
from main import generate_cover_letter, generate_cover_letter_from_text

# From a job URL (scrapes the page)
generate_cover_letter(
    resume_path="../resume/YourResume.pdf",
    job_url="https://example.com/jobs/123",
    output_filename="cover_letter.pdf"
)

# From plain text job description
generate_cover_letter_from_text(
    resume_path="../resume/YourResume.pdf",
    job_description="Software Engineer at Acme Corp...",
    output_filename="cover_letter.pdf"
)
```

## Project Structure

```
backend/
├── main.py           # Main entry point and cover letter generation
├── resume_parser.py  # PDF resume text extraction
├── scraper.py        # Job posting web scraper
├── prompt.txt        # System prompt for the AI
├── requirements.txt  # Python dependencies
└── README.md         # This file

resume/
├── YourResume.pdf    # Your resume (add your own)
├── school.png        # Logo for cover letter header
└── cover_letter.pdf  # Generated output
```

## Customization

### Change the cover letter template

Edit `prompt.txt` to modify the LaTeX template or adjust the AI instructions.

### Add your school/company logo

Replace `resume/school.png` with your own logo (keep the filename).

## Troubleshooting

### "No module named 'google'"

Make sure you're in the virtual environment:
```bash
source venv/bin/activate
```

### "pdflatex not found"

Install BasicTeX and restart your terminal:
```bash
brew install --cask basictex
eval "$(/usr/libexec/path_helper)"
```

### Blank PDF / missing fonts

The template uses standard fonts. If you see issues, try:
```bash
sudo tlmgr update --self
sudo tlmgr install lmodern
```

### Job page not parsing correctly

Some pages load slowly. The scraper waits 3 seconds for JavaScript to render. If content is still missing, the raw page text is passed to the AI as a fallback.
