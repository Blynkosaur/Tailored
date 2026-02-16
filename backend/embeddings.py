"""
Anonymize cover letter sections and embed for RDS pgvector storage.
Uses LangChain HuggingFaceEmbeddings (sentence-transformers/all-mpnet-base-v2, 768-dim).
"""
import re
import uuid
from langchain_huggingface import HuggingFaceEmbeddings  # type: ignore[import-untyped]

from pgvector.utils import Vector  # type: ignore[import-untyped]

from database import (
    EMBEDDING_DIM,
    get_connection,
    init_templates_table,
    is_rds_configured,
)

# Lazy-init embedding model (can be slow to load)
_embeddings: HuggingFaceEmbeddings | None = None


def _get_embeddings() -> HuggingFaceEmbeddings:
    global _embeddings
    if _embeddings is None:
        _embeddings = HuggingFaceEmbeddings(
            model_name="sentence-transformers/all-mpnet-base-v2",
            model_kwargs={"device": "cpu"},
        )
    return _embeddings


def anonymize_letter_sections(sections: dict) -> str:
    """
    Build a single text from letter sections with PII replaced by placeholders.
    Used before embedding so we don't store names, emails, companies, etc.
    """
    parts = []

    # Date: keep format but not specific date
    date = (sections.get("date") or "").strip()
    if date:
        parts.append("[DATE]")

    # Sender block: name, email (redact)
    name = (sections.get("sender_name") or "").strip()
    email = (sections.get("sender_email") or "").strip()
    if name or email:
        parts.append("[SENDER]")

    # Addressee: full block redacted (company, hiring manager, etc.)
    addressee = (sections.get("addressee") or "").strip()
    if addressee:
        parts.append("[ADDRESSEE]")

    # Greeting: keep structure, redact name if "Dear X,"
    greeting = (sections.get("greeting") or "").strip()
    if greeting:
        greeting_anon = re.sub(r"Dear\s+[^,]+", "Dear [NAME]", greeting, flags=re.I)
        parts.append(greeting_anon)

    # Intro and body: keep content but redact obvious emails/phones
    intro = (sections.get("intro") or "").strip()
    if intro:
        parts.append(_redact_pii(intro))
    body = sections.get("body")
    if isinstance(body, list):
        for p in body:
            if (p or "").strip():
                parts.append(_redact_pii((p or "").strip()))
    else:
        b1 = (sections.get("body_1") or "").strip()
        b2 = (sections.get("body_2") or "").strip()
        if b1:
            parts.append(_redact_pii(b1))
        if b2:
            parts.append(_redact_pii(b2))

    # Closing, sincerely, signature
    closing = (sections.get("closing") or "").strip()
    if closing:
        parts.append(_redact_pii(closing))
    sincerely = (sections.get("sincerely") or "Sincerely yours,").strip()
    parts.append(sincerely)
    signature = (sections.get("signature") or "").strip()
    if signature:
        parts.append("[SIGNATURE]")

    return "\n\n".join(parts)


def _redact_pii(text: str) -> str:
    """Replace emails and phone-like sequences with placeholders."""
    text = re.sub(
        r"[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}",
        "[EMAIL]",
        text,
    )
    text = re.sub(
        r"\+?1?[-.\s]?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}",
        "[PHONE]",
        text,
    )
    return text


def embed_text(text: str) -> list[float]:
    """Return embedding vector for text (length EMBEDDING_DIM)."""
    if not text or not text.strip():
        return [0.0] * EMBEDDING_DIM
    model = _get_embeddings()
    vec = model.embed_query(text.strip()[:8000])  # limit length
    if len(vec) != EMBEDDING_DIM:
        raise ValueError(f"Expected embedding dim {EMBEDDING_DIM}, got {len(vec)}")
    return vec


def store_letter_template(content_anonymized: str, embedding: list[float]) -> str:
    """
    Insert into templates table. Ensures table exists. Returns the new row id.
    """
    init_templates_table()
    row_id = str(uuid.uuid4())
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO templates (id, content, role_type, tone, embedding)
                VALUES (%s, %s, %s, %s, %s)
                """,
                (
                    row_id,
                    content_anonymized[:100_000],
                    "cover_letter",
                    None,
                    Vector(embedding),
                ),
            )
        conn.commit()
    return row_id


def embed_and_store_letter(sections: dict) -> str | None:
    """
    Anonymize sections, embed, and store in RDS. Returns template id or None if RDS not configured.
    """
    if not is_rds_configured():
        return None
    text = anonymize_letter_sections(sections)
    embedding = embed_text(text)
    return store_letter_template(text, embedding)
