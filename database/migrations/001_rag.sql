-- 001_rag.sql — RAG documental con pgvector (idempotente).
-- Aplica con: psql $DATABASE_URL -f database/migrations/001_rag.sql

DO $$
BEGIN
    CREATE EXTENSION IF NOT EXISTS vector;
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'pgvector no disponible en esta imagen; usa database/Dockerfile.';
END $$;

CREATE TABLE IF NOT EXISTS rag_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(300) NOT NULL,
    source VARCHAR(30) NOT NULL DEFAULT 'otro',
    kind VARCHAR(30) NOT NULL DEFAULT 'otro',
    external_id VARCHAR(500) UNIQUE,
    uri VARCHAR(1000),
    lang VARCHAR(8) NOT NULL DEFAULT 'es',
    embedder VARCHAR(120) NOT NULL DEFAULT '',
    doc_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_rag_documents_source_kind ON rag_documents (source, kind);

CREATE TABLE IF NOT EXISTS rag_chunks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL REFERENCES rag_documents(id) ON DELETE CASCADE,
    idx INTEGER NOT NULL DEFAULT 0,
    section VARCHAR(300) NOT NULL DEFAULT 'General',
    page INTEGER,
    text TEXT NOT NULL,
    embedding vector(384),
    CONSTRAINT uq_rag_chunk_doc_idx UNIQUE (document_id, idx)
);
CREATE INDEX IF NOT EXISTS ix_rag_chunks_document ON rag_chunks (document_id);
CREATE INDEX IF NOT EXISTS ix_rag_chunks_embedding
    ON rag_chunks USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);