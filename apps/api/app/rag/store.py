"""RagStore: persistencia y retrieval hibrido (vector + keywords) sobre pgvector."""
from __future__ import annotations

import re
import unicodedata
import uuid
from dataclasses import dataclass
from typing import Any
from collections.abc import Callable

from sqlalchemy import delete, select, text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.rag.models import Document, RagChunk

_TOKEN = re.compile(r'[a-z0-9]{3,}')


def _fold(s: str) -> str:
    """Minusculas sin tildes para que 'Itagüí' coincida con 'Itagui'."""
    nfkd = unicodedata.normalize('NFKD', s.lower())
    return ''.join(c for c in nfkd if not unicodedata.combining(c))


def tokens(s: str) -> set[str]:
    return set(_TOKEN.findall(_fold(s)))


@dataclass
class SearchHit:
    chunk_id: str
    document_id: str
    title: str
    source: str
    kind: str
    uri: str | None
    section: str
    page: int | None
    text: str
    vector_score: float
    keyword_score: float
    score: float


@dataclass
class StoredDocument:
    id: str
    title: str
    source: str
    kind: str
    chunks: int


class RagStore:
    """Store asyncrono. `session_factory` inyectable para tests."""

    def __init__(
        self,
        session_factory: async_sessionmaker[AsyncSession],
        embedder: Any,
    ):
        self.sessions = session_factory
        self.embedder = embedder

    # -- escritura ------------------------------------------------------
    async def upsert_document(
        self,
        *,
        title: str,
        source: str,
        kind: str,
        chunks: list[tuple[str, str, int | None]],
        external_id: str | None = None,
        uri: str | None = None,
        lang: str = 'es',
        metadata: dict | None = None,
        embedder_name: str = '',
    ) -> StoredDocument:
        """Inserta o reemplaza (por external_id) un documento con sus chunks."""
        vectors = self.embedder.embed([t for t, _, _ in chunks])
        async with self.sessions() as s:
            if external_id:
                old = (
                    await s.execute(
                        select(Document).where(Document.external_id == external_id)
                    )
                ).scalar_one_or_none()
                if old is not None:
                    await s.execute(delete(RagChunk).where(RagChunk.document_id == old.id))
                    await s.delete(old)
                    await s.flush()
            doc = Document(
                title=title,
                source=source,
                kind=kind,
                external_id=external_id,
                uri=uri,
                lang=lang,
                embedder=embedder_name or getattr(self.embedder, 'name', ''),
                doc_metadata=metadata or {},
            )
            s.add(doc)
            await s.flush()
            for i, ((ctext, section, page), vec) in enumerate(zip(chunks, vectors)):
                s.add(
                    RagChunk(
                        document_id=doc.id,
                        idx=i,
                        section=section,
                        page=page,
                        text=ctext,
                        embedding=list(vec),
                    )
                )
            await s.commit()
            return StoredDocument(
                id=str(doc.id), title=title, source=source, kind=kind, chunks=len(chunks)
            )

    # -- lectura --------------------------------------------------------
    async def list_documents(self) -> list[StoredDocument]:
        async with self.sessions() as s:
            rows = (await s.execute(select(Document))).scalars().all()
            out = []
            for d in rows:
                n = len(d.chunks)
                out.append(
                    StoredDocument(id=str(d.id), title=d.title, source=d.source, kind=d.kind, chunks=n)
                )
            return out

    async def delete_document(self, doc_id: str) -> bool:
        async with self.sessions() as s:
            try:
                uid = uuid.UUID(doc_id)
            except ValueError:
                return False
            doc = await s.get(Document, uid)
            if doc is None:
                return False
            await s.delete(doc)
            await s.commit()
            return True

    # -- retrieval ------------------------------------------------------
    async def search(
        self,
        query: str,
        top_k: int = 8,
        min_score: float = 0.25,
        sources: list[str] | None = None,
    ) -> list[SearchHit]:
        """Hibrido: coseno pgvector (candidatos x3) + boost keywords en Python."""
        qvec = self.embedder.embed([query])[0]
        qtok = tokens(query)
        async with self.sessions() as s:
            where = ''
            params: dict[str, Any] = {'q': str(list(qvec)), 'n': max(top_k * 3, top_k)}
            if sources:
                where = 'AND d.source = ANY(:sources)'
                params['sources'] = sources
            rows = (
                await s.execute(
                    text(
                        'SELECT c.id, c.document_id, c.idx, c.section, c.page, c.text, '
                        'd.title, d.source, d.kind, d.uri, '
                        '1 - (c.embedding <=> CAST(:q AS vector)) AS vsim '
                        'FROM rag_chunks c JOIN rag_documents d ON d.id = c.document_id '
                        f'WHERE c.embedding IS NOT NULL {where} '
                        'ORDER BY c.embedding <=> CAST(:q AS vector) '
                        'LIMIT :n'
                    ),
                    params,
                )
            ).all()
        hits: list[SearchHit] = []
        for r in rows:
            ctok = tokens(r.text)
            inter = len(qtok & ctok)
            kw = (inter / max(1, len(qtok))) if qtok else 0.0
            vsim = float(r.vsim)
            score = 0.7 * vsim + 0.3 * kw
            if score >= min_score:
                hits.append(
                    SearchHit(
                        chunk_id=str(r.id),
                        document_id=str(r.document_id),
                        title=r.title,
                        source=r.source,
                        kind=r.kind,
                        uri=r.uri,
                        section=r.section,
                        page=r.page,
                        text=r.text,
                        vector_score=round(vsim, 4),
                        keyword_score=round(kw, 4),
                        score=round(score, 4),
                    )
                )
        hits.sort(key=lambda h: h.score, reverse=True)
        return hits[:top_k]


SessionFactory = Callable[[], Any]