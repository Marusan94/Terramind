"""Modelos SQLAlchemy del RAG: documentos + chunks con embedding pgvector."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from pgvector.sqlalchemy import Vector
from sqlalchemy import DateTime, ForeignKey, Index, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Document(Base):
    __tablename__ = 'rag_documents'

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    title: Mapped[str] = mapped_column(String(300))
    # siata | gobierno | ods | oms | academia | proyecto | otro
    source: Mapped[str] = mapped_column(String(30), default='otro', index=True)
    # informe_diario | protocolo | guia | tesis | plan | norma | otro
    kind: Mapped[str] = mapped_column(String(30), default='otro', index=True)
    # Dedupe de ingesta automatica (ej. URL SIATA). Uploads manuales: null.
    external_id: Mapped[str | None] = mapped_column(String(500), unique=True)
    uri: Mapped[str | None] = mapped_column(String(1000))
    lang: Mapped[str] = mapped_column(String(8), default='es')
    embedder: Mapped[str] = mapped_column(String(120), default='')
    doc_metadata: Mapped[dict] = mapped_column(JSONB, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow
    )

    chunks: Mapped[list['RagChunk']] = relationship(
        back_populates='document', cascade='all, delete-orphan', lazy='selectin'
    )

    __table_args__ = (
        Index('ix_rag_documents_source_kind', 'source', 'kind'),
    )


class RagChunk(Base):
    __tablename__ = 'rag_chunks'

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    document_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey('rag_documents.id', ondelete='CASCADE'), index=True
    )
    idx: Mapped[int] = mapped_column(default=0)
    section: Mapped[str] = mapped_column(String(300), default='General')
    page: Mapped[int | None] = mapped_column()
    text: Mapped[str] = mapped_column(Text)
    embedding: Mapped[list[float] | None] = mapped_column(Vector(384))

    document: Mapped[Document] = relationship(back_populates='chunks')

    __table_args__ = (
        UniqueConstraint('document_id', 'idx', name='uq_rag_chunk_doc_idx'),
    )


async def init_rag_db(engine) -> None:
    """Crea extension vector + tablas (idempotente)."""
    from sqlalchemy import text

    async with engine.begin() as conn:
        await conn.execute(text('CREATE EXTENSION IF NOT EXISTS vector'))
        await conn.run_sync(Base.metadata.create_all)
        # IVFFlat para busqueda aproximada cuando haya volumen.
        await conn.execute(
            text(
                'CREATE INDEX IF NOT EXISTS ix_rag_chunks_embedding '
                'ON rag_chunks USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100)'
            )
        )
        await conn.execute(text('ANALYZE rag_chunks'))