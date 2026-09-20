"""MemoryRagStore: mismo contrato que RagStore pero en memoria.

Para desarrollo local y demos sin Postgres/pgvector. El scoring hibrido
es identico (0.7 vector + 0.3 keywords, mismo umbral) para que lo que
ves aqui rankee igual que en produccion.
"""
from __future__ import annotations

import uuid

from app.rag.store import SearchHit, StoredDocument, tokens


class MemoryRagStore:
    def __init__(self, embedder):
        self.embedder = embedder
        self._docs: dict[str, dict] = {}

    async def upsert_document(self, **kw) -> StoredDocument:
        if kw.get('external_id'):
            for did, d in list(self._docs.items()):
                if d.get('external_id') == kw['external_id']:
                    del self._docs[did]
        doc_id = str(uuid.uuid4())
        vecs = self.embedder.embed([t for t, _, _ in kw['chunks']])
        self._docs[doc_id] = {**kw, 'id': doc_id, 'vecs': vecs}
        return StoredDocument(
            id=doc_id, title=kw['title'], source=kw['source'],
            kind=kw['kind'], chunks=len(kw['chunks']),
        )

    async def list_documents(self) -> list[StoredDocument]:
        return [
            StoredDocument(
                id=d['id'], title=d['title'], source=d['source'],
                kind=d['kind'], chunks=len(d['chunks']),
            )
            for d in self._docs.values()
        ]

    async def delete_document(self, doc_id: str) -> bool:
        if doc_id in self._docs:
            del self._docs[doc_id]
            return True
        return False

    async def search(
        self,
        query: str,
        top_k: int = 8,
        min_score: float = 0.25,
        sources: list[str] | None = None,
    ) -> list[SearchHit]:
        qv = self.embedder.embed([query])[0]
        qtok = tokens(query)
        hits: list[SearchHit] = []
        for d in self._docs.values():
            if sources and d['source'] not in sources:
                continue
            for i, ((t, sec, page), v) in enumerate(zip(d['chunks'], d['vecs'])):
                cos = sum(a * b for a, b in zip(qv, v))
                kw = len(qtok & tokens(t)) / max(1, len(qtok)) if qtok else 0.0
                score = 0.7 * cos + 0.3 * kw
                if score >= min_score:
                    hits.append(
                        SearchHit(
                            chunk_id=f"{d['id']}-{i}", document_id=d['id'],
                            title=d['title'], source=d['source'], kind=d['kind'],
                            uri=d.get('uri'), section=sec, page=page, text=t,
                            vector_score=round(cos, 4), keyword_score=round(kw, 4),
                            score=round(score, 4),
                        )
                    )
        hits.sort(key=lambda h: h.score, reverse=True)
        return hits[:top_k]