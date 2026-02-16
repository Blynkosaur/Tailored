# Tailored Cover Letter Generator

Generate personalized cover letters from your resume and job postings using AI.

## Features

- Parse PDF resumes; scrape job URLs (Playwright) or paste/upload job text
- Gemini generates structured letter sections; LaTeX → PDF (optional logo)
- Edit via chat (natural language); guardrail blocks off-topic requests

## How It Works

Job input (URL/text/PDF) + resume PDF → scrape/parse → Gemini (sections) → inject into LaTeX template → pdflatex → PDF. User can edit in UI or ask for changes in chat; edits go through a guardrail, then Gemini returns revised sections; diff and recompile without another scrape.

## Architecture

- **Frontend**: Next.js, TypeScript, Tailwind. `frontend/`. API routes proxy to backend.
- **Backend**: FastAPI, `backend/`. LangChain for orchestration (generate, edit, guardrail). Optional AWS RDS (Postgres + pgvector) for template storage. Bearer `API_KEY`; CORS via `CORS_ORIGINS`.

**Backend modules**: `api.py` — routes, LaTeX build, PDF compile. `main.py` — generate, edit, guardrail (Gemini). `scraper.py` — Playwright. `resume_parser.py` — PDF text. `database.py` — AWS RDS + pgvector (optional).

**Routes**: `POST /generate` (resume + job → PDF + sections), `POST /compile` (sections → PDF), `POST /edit` (instruction + sections → proposed sections or guardrail message), `POST /latex` (sections → LaTeX), `GET /health`.

## Project Structure

```
tailored/
├── frontend/     # Next.js, app/api, components, lib
├── backend/      # api.py, main.py, scraper.py, resume_parser.py, database.py,
│                 # cover_letter_template.tex, Dockerfile, requirements.txt
└── README.md
```

## Local Development

**Prereqs**: Node 18+, Python 3.10+, pdflatex, [Gemini API key](https://aistudio.google.com/apikey).

**Backend**: `cd backend && python3 -m venv venv && source venv/bin/activate && pip install -r requirements.txt && playwright install chromium`. Add `.env` with `GEMINI_API_KEY=...`. Run: `uvicorn api:app --reload --port 8000`.

**Frontend**: `cd frontend && npm install && npm run dev`. App at http://localhost:3000.

## Environment Variables (Backend)

| Variable | Description |
|---------|-------------|
| `GEMINI_API_KEY` | Required for generate/edit. |
| `API_KEY` | Optional; Bearer auth on protected routes. |
| `CORS_ORIGINS` | Optional; comma-separated origins. |
| `RDS_*` | Optional; AWS RDS Postgres + pgvector (database.py). |

## Deployment

Backend: Docker + AWS ECS/Fargate (see Dockerfile).

## Troubleshooting

- **pdflatex missing**: `brew install --cask basictex` then `eval "$(/usr/libexec/path_helper)"`.
- **Blank PDF / fonts**: `sudo tlmgr update --self && sudo tlmgr install lmodern`.
- **Scraper**: Slow or missing content → raw page text still sent to AI.
