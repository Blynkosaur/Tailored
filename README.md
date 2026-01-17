# Tailored Cover Letter Generator

Generate personalized cover letters from your resume and job postings using AI.

## Features

- Parses PDF resumes automatically
- Scrapes job postings from any URL (LinkedIn, Greenhouse, Lever, etc.)
- Uses Google Gemini AI to generate tailored cover letters
- Outputs professional LaTeX-formatted PDFs

## How It Works

1. **Job Scraping**: When a user provides a job URL, Playwright (a headless browser) navigates to the page and waits for JavaScript to render. This allows scraping of dynamic job boards like LinkedIn, Greenhouse, and Lever that load content client-side.

2. **Resume Parsing**: The uploaded PDF resume is parsed to extract text content.

3. **AI Generation**: The resume text and job description are sent to Google Gemini, which generates a tailored cover letter in LaTeX format based on a custom prompt template.

4. **PDF Compilation**: The LaTeX output is compiled to PDF using pdflatex, producing a professionally formatted cover letter ready for download.

## Architecture

This project consists of two main components:

### Frontend (Next.js)

A modern React-based web application built with Next.js. Handles the user interface for uploading resumes, entering job URLs or descriptions, and downloading generated cover letters.

- Located in `frontend/`
- Built with Next.js 14+ and TypeScript
- Uses Tailwind CSS for styling
- API routes proxy requests to the backend

### Backend (Python/FastAPI)

A Python API that handles resume parsing, job scraping, AI generation, and PDF compilation.

- Located in `backend/`
- Built with FastAPI
- Uses Playwright for web scraping
- Uses Google Gemini for AI generation
- Compiles LaTeX to PDF using pdflatex

## Deployment

The backend is containerized with Docker and deployed on AWS:

- **Docker**: The backend includes a `Dockerfile` for containerization
- **AWS ECS**: Container orchestration using Elastic Container Service
- **AWS Fargate**: Serverless compute for running containers without managing servers

## Project Structure

```
tailored/
├── frontend/                 # Next.js frontend application
│   ├── src/
│   │   ├── app/
│   │   │   ├── api/         # API route handlers (proxy to backend)
│   │   │   ├── page.tsx     # Main application page
│   │   │   └── layout.tsx   # Root layout
│   │   ├── components/      # Reusable UI components
│   │   └── lib/             # Utilities and constants
│   ├── package.json
│   └── next.config.ts
│
├── backend/                  # Python FastAPI backend
│   ├── api.py               # FastAPI endpoints
│   ├── main.py              # Cover letter generation logic
│   ├── resume_parser.py     # PDF resume text extraction
│   ├── scraper.py           # Job posting web scraper
│   ├── prompt.txt           # System prompt for AI
│   ├── Dockerfile           # Container configuration
│   └── requirements.txt     # Python dependencies
│
└── README.md
```

## Local Development

### Prerequisites

- Node.js 18+
- Python 3.10+
- pdflatex (for compiling LaTeX to PDF)
- Google Gemini API key

### Backend Setup

```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
playwright install chromium
```

Create a `.env` file in the backend directory:

```
GEMINI_API_KEY=your-api-key-here
```

Get your API key from [Google AI Studio](https://aistudio.google.com/apikey).

Run the backend:

```bash
uvicorn api:app --reload --port 8000
```

### Frontend Setup

```bash
cd frontend
npm install
npm run dev
```

The frontend runs on `http://localhost:3000` and proxies API requests to the backend.

## Environment Variables

### Backend

| Variable | Description |
|----------|-------------|
| `GEMINI_API_KEY` | Google Gemini API key for AI generation |

## Troubleshooting

### "pdflatex not found"

Install BasicTeX (macOS):

```bash
brew install --cask basictex
eval "$(/usr/libexec/path_helper)"
```

### Blank PDF / missing fonts

```bash
sudo tlmgr update --self
sudo tlmgr install lmodern
```

### Job page not parsing correctly

Some pages load slowly. The scraper waits for JavaScript to render. If content is still missing, the raw page text is passed to the AI as a fallback.
