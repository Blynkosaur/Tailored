"""
LangChain orchestration for cover letter generation and edit.
Composes: retriever (pgvector) → prompt templates → LLM (Gemini) → output parser.
"""
import json
import os
from typing import Any

from dotenv import load_dotenv
from langchain_core.documents import Document
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.retrievers import BaseRetriever
from langchain_core.runnables.base import RunnableSequence
from langchain_google_genai import ChatGoogleGenerativeAI  # type: ignore[import-untyped]

from embeddings import (
    build_template_injection,
    retrieve_similar_templates,
    TEMPLATE_INJECTION_PROMPT,
)

load_dotenv()

# --- Config ---
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")
MODEL_NAME = os.environ.get("GEMINI_MODEL", "gemini-2.0-flash")


# --- Template retriever (LangChain Retriever over pgvector) ---


class TemplateRetriever(BaseRetriever):
    """LangChain retriever that uses RDS pgvector for similar cover letter templates."""

    top_k: int = 3
    max_chars_total: int = 4000

    def _get_relevant_documents(self, query: str) -> list[Document]:
        if not (query or "").strip():
            return []
        templates = retrieve_similar_templates(query.strip()[:8000], top_k=self.top_k)
        return [
            Document(
                page_content=(t.get("content") or "").strip(),
                metadata={"id": t.get("id"), "role_type": t.get("role_type"), "score": t.get("score")},
            )
            for t in templates
            if (t.get("content") or "").strip()
        ]

    async def _aget_relevant_documents(self, query: str) -> list[Document]:
        return self._get_relevant_documents(query)


def _templates_to_injection_block(docs: list[Document], max_chars: int = 4000) -> str:
    """Turn LangChain documents into the template injection block string."""
    templates = [{"content": d.page_content} for d in docs]
    return build_template_injection(templates, max_chars_total=max_chars)


# --- LLM ---

def _get_llm(temperature: float = 0.7) -> ChatGoogleGenerativeAI:
    return ChatGoogleGenerativeAI(
        model=MODEL_NAME,
        temperature=temperature,
        google_api_key=GEMINI_API_KEY,
    )


# --- Generation chain ---

GENERATION_SYSTEM = """You are an expert cover letter writer. Output ONLY a single JSON object (no markdown, no code fences, no explanation).

Given the candidate contact info, company research, resume, and job description below, produce a cover letter as a JSON object with these exact keys:

- "addressee": string with 4 lines separated by newline (\\n): line1 = hiring manager name or "Hiring Manager", line2 = job title or "Recruitment Team", line3 = company name, line4 = company address (or empty line if unknown)
- "greeting": string, e.g. "Dear Hiring Manager," or "Dear Ms. Smith,"
- "intro": string, first paragraph (opening: state position, enthusiasm, and 1–2 specific points about the company or role; write 3–4 substantive sentences)
- "body": array of exactly 2 strings (two body paragraphs: first = match qualifications to job with specific examples from the resume—name technologies, projects, and outcomes where relevant; second = add another concrete example or two, then reiterate interest and thank reader; aim for 4–5 sentences per paragraph)
- "closing": string, optional short closing sentence before sign-off (can be empty string)
- "signature": string, candidate full name only

Detail level: Write slightly more detailed paragraphs. Name specific technologies, projects, and results from the resume when they fit the job.

CRITICAL - Resume-only rule: Do NOT say anything that is not on the candidate's resume. Every company name, job title, project name, metric, technology, and experience you mention MUST appear explicitly in the RESUME section below.

Other rules: Use ONLY the contact info from CANDIDATE CONTACT INFO. Never add URLs, LinkedIn, GitHub. No placeholder text. Write complete professional sentences."""

GENERATION_USER_TEMPLATE = """{template_block}{company_context}

Output the cover letter as JSON with keys: addressee, greeting, intro, body (array of exactly 2 paragraph strings), closing, signature. Write slightly more detailed intro and body paragraphs—name specific technologies and projects from the resume where relevant. Remember: do not say anything that is not explicitly in the RESUME section above."""


def get_generation_chain(
    system_instruction: str | None = None,
    top_k_templates: int = 3,
) -> RunnableSequence:
    """
    Returns a LangChain chain: input dict -> LLM -> parsed JSON dict.
    Input keys: company_context (str), job_description (str for retrieval).
    Optional: template_block (str); if missing, retrieval is run from job_description.
    """
    retriever = TemplateRetriever(top_k=top_k_templates)
    llm = _get_llm(temperature=0.7)
    parser = JsonOutputParser()

    def prepare_inputs(inputs: dict) -> dict:
        company_context = inputs.get("company_context") or ""
        job_description = (inputs.get("job_description") or "")[:3000]
        template_block = inputs.get("template_block")
        if template_block is None and job_description:
            docs = retriever.invoke(job_description)
            if docs:
                block = TEMPLATE_INJECTION_PROMPT.strip() + "\n\n" + _templates_to_injection_block(docs)
                template_block = block + "\n\n"
            else:
                template_block = ""
        elif template_block is None:
            template_block = ""
        return {
            "company_context": company_context,
            "template_block": template_block,
        }

    prompt = ChatPromptTemplate.from_messages([
        ("system", system_instruction or GENERATION_SYSTEM),
        ("human", GENERATION_USER_TEMPLATE),
    ])

    def _strip_content(msg: Any) -> str:
        return getattr(msg, "content", str(msg)).strip()

    chain = (
        (lambda x: prepare_inputs(x))
        | prompt
        | llm
        | _strip_content
        | _parse_json_cover_letter
    )
    return chain


def _parse_json_cover_letter(text: str) -> dict:
    """Strip markdown code fences if present and parse JSON."""
    t = text.strip()
    if t.startswith("```"):
        lines = t.split("\n")
        if lines[-1].strip() == "```":
            lines = lines[1:-1]
        else:
            lines = lines[1:]
        t = "\n".join(lines)
    return json.loads(t)


# --- Edit chain ---

EDIT_SYSTEM = """You are an expert editor. Given the current cover letter sections (as JSON) and a user edit instruction, output ONLY a single JSON object with the revised sections. Always output valid JSON.

Output the same keys as the input: addressee, greeting, intro, body (array of paragraph strings), closing, signature.
- Apply the user's edit instruction when you can. When the request is vague, make a reasonable improvement. When you cannot fulfill the request, return the same sections unchanged—the UI will show a friendly message asking the user to be more specific.
- Preserve structure when appropriate.
- Do not hallucinate: Any company name, project name, metric, technology, or experience you add must appear in the CANDIDATE RESUME section.
- No markdown, no code fences, no explanation. Output only the JSON object."""

EDIT_USER_TEMPLATE = """{template_block}Current cover letter sections (JSON):
{current_json}
{resume_block}{history_block}User edit instruction: {instruction}

Apply the instruction and output the revised sections as a JSON object with keys: addressee, greeting, intro, body (array of strings), closing, signature. Only use facts from the resume above; do not invent any details. If you cannot help with this request, return the same sections unchanged."""


def get_edit_chain(
    system_instruction: str | None = None,
    top_k_templates: int = 2,
) -> RunnableSequence:
    """
    Returns a LangChain chain for edit-by-instruction.
    Input keys: current_json (str), resume_block (str), history_block (str), instruction (str), edit_query (str for retrieval).
    """
    retriever = TemplateRetriever(top_k=top_k_templates)
    llm = _get_llm(temperature=0.3)
    prompt = ChatPromptTemplate.from_messages([
        ("system", system_instruction or EDIT_SYSTEM),
        ("human", EDIT_USER_TEMPLATE),
    ])

    def prepare_edit_inputs(inputs: dict) -> dict:
        edit_query = (inputs.get("edit_query") or "")[:2000]
        template_block = inputs.get("template_block")
        if template_block is None and edit_query:
            docs = retriever.invoke(edit_query)
            if docs:
                template_block = TEMPLATE_INJECTION_PROMPT.strip() + "\n\n" + _templates_to_injection_block(docs, max_chars=3000) + "\n\n"
            else:
                template_block = ""
        elif template_block is None:
            template_block = ""
        return {
            "current_json": inputs.get("current_json") or "{}",
            "resume_block": inputs.get("resume_block") or "",
            "history_block": inputs.get("history_block") or "",
            "instruction": inputs.get("instruction") or "",
            "template_block": template_block,
        }

    def _strip_content(msg: Any) -> str:
        return getattr(msg, "content", str(msg)).strip()

    chain = (
        (lambda x: prepare_edit_inputs(x))
        | prompt
        | llm
        | _strip_content
        | _parse_json_cover_letter
    )
    return chain


def invoke_generation(company_context: str, job_description: str) -> dict:
    """One-shot: run generation chain and return parsed JSON (addressee, greeting, intro, body, closing, signature)."""
    chain = get_generation_chain(top_k_templates=3)
    return chain.invoke({
        "company_context": company_context,
        "job_description": job_description,
    })


def invoke_edit(
    current_json: str,
    resume_block: str,
    history_block: str,
    instruction: str,
    edit_query: str,
) -> dict:
    """One-shot: run edit chain and return parsed JSON."""
    chain = get_edit_chain(top_k_templates=2)
    return chain.invoke({
        "current_json": current_json,
        "resume_block": resume_block,
        "history_block": history_block,
        "instruction": instruction,
        "edit_query": edit_query,
    })
