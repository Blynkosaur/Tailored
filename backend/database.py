"""
RDS Postgres + pgvector connection and template table setup.
Uses env: RDS_HOST, RDS_PORT, RDS_USER, RDS_PASSWORD, RDS_DB_NAME.
"""
import os
from contextlib import contextmanager
from dotenv import load_dotenv

load_dotenv()

RDS_HOST = (os.environ.get("RDS_HOST") or "").strip()
RDS_PORT = int(os.environ.get("RDS_PORT", "5432"))
RDS_USER = (os.environ.get("RDS_USER") or "").strip()
RDS_PASSWORD = (os.environ.get("RDS_PASSWORD") or "").strip()
RDS_DB_NAME = (os.environ.get("RDS_DB_NAME") or "tailored").strip()

EMBEDDING_DIM = int(os.environ.get("EMBEDDING_DIM", "768"))


def get_connection_params() -> dict[str, str | int]:
    """Return dict for psycopg2.connect()."""
    return {
        "host": RDS_HOST,
        "port": RDS_PORT,
        "user": RDS_USER,
        "password": RDS_PASSWORD,
        "dbname": RDS_DB_NAME,
    }


def get_database_url():
    return (
        f"postgresql://{RDS_USER}:{RDS_PASSWORD}@{RDS_HOST}:{RDS_PORT}/{RDS_DB_NAME}"
    )


@contextmanager
def get_connection():
    import psycopg2  # type: ignore[import-untyped]
    from pgvector.psycopg2 import register_vector  # type: ignore[import-untyped]

    params = get_connection_params()
    conn = psycopg2.connect(
        host=params["host"],
        port=params["port"],
        user=params["user"],
        password=params["password"],
        dbname=params["dbname"],
    )
    register_vector(conn)
    try:
        yield conn
    finally:
        conn.close()


def init_templates_table():
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("CREATE EXTENSION IF NOT EXISTS vector;")
            cur.execute(
                f"""
                CREATE TABLE IF NOT EXISTS templates (
                    id TEXT PRIMARY KEY,
                    content TEXT NOT NULL,
                    role_type TEXT,
                    tone TEXT,
                    embedding vector({EMBEDDING_DIM})
                );
                """
            )
            conn.commit()
            # Index for approximate nearest neighbor (optional). Run after you have rows.
            try:
                cur.execute(
                    """
                    CREATE INDEX IF NOT EXISTS templates_embedding_idx
                    ON templates
                    USING ivfflat (embedding vector_cosine_ops)
                    WITH (lists = 100);
                    """
                )
                conn.commit()
            except Exception:
                conn.rollback()


def is_rds_configured():
    return bool(RDS_HOST and RDS_USER and RDS_PASSWORD)
