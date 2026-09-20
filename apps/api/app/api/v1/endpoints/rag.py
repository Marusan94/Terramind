"""Endpoints RAG: subida de documentos, busqueda y consulta con citas."""
from __future__ import annotations

import re

from datetime import date, datetime, timezone
from typing import Any, Literal

import httpx
from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from pydantic import BaseModel, Field

from app.core.config import settings
from app.core.llm import omniroute
from app.rag.ingest import USER_KINDS, USER_SOURCES, ingest_bytes, ingest_siata_daily
from app.rag.sources import OFFICIAL_SEEDS
from app.rag.sources import fetch_bytes

router = APIRouter()

_store = None
_embedder = None


def configure_rag(store, embedder) -> None:
    """Inyecta store/embedder (produccion o fakes de test)."""
    global _store, _embedder
    _store = store
    _embedder = embedder


def _store_or_503():
    if _store is None or _embedder is None:
        raise HTTPException(
            status_code=503,
            detail='RAG no configurado (falta DATABASE_URL o init en startup).',
        )
    return _store, _embedder


class DocumentOut(BaseModel):
    id: str
    title: str
    source: str
    kind: str
    chunks: int


class Citation(BaseModel):
    n: int
    title: str
    source: str
    kind: str
    uri: str | None = None
    section: str
    page: int | None = None
    excerpt: str
    score: float


class SearchRequest(BaseModel):
    query: str = Field(min_length=2, max_length=500)
    top_k: int = Field(default=8, ge=1, le=20)
    min_score: float = Field(default=settings.RAG_MIN_SCORE, ge=0.0, le=1.0)
    sources: list[str] | None = None


class SearchResponse(BaseModel):
    query: str
    hits: list[Citation]
    has_source: bool


class QueryRequest(BaseModel):
    query: str = Field(min_length=2, max_length=1000)
    top_k: int = Field(default=6, ge=1, le=12)
    min_score: float = Field(default=settings.RAG_MIN_SCORE, ge=0.0, le=1.0)


class QueryResponse(BaseModel):
    answer: str
    citations: list[Citation]
    has_source: bool
    provider: str


def _to_citations(hits) -> list[Citation]:
    return [
        Citation(
            n=i + 1,
            title=h.title,
            source=h.source,
            kind=h.kind,
            uri=h.uri,
            section=h.section,
            page=h.page,
            excerpt=h.text[:600],
            score=h.score,
        )
        for i, h in enumerate(hits)
    ]


@router.post('/documents/upload', response_model=DocumentOut, tags=['rag'])
async def upload_document(
    file: UploadFile = File(...),
    title: str | None = Form(default=None),
    source: Literal['siata', 'gobierno', 'ods', 'oms', 'academia', 'proyecto', 'otro'] = Form(default='otro'),
    kind: str = Form(default='otro'),
):
    store, embedder = _store_or_503()
    data = await file.read()
    if len(data) > 50 * 1024 * 1024:
        raise HTTPException(status_code=413, detail='Archivo excede 50 MB.')
    try:
        summary = await ingest_bytes(
            store,
            embedder,
            title=title or file.filename or 'sin-titulo',
            source=source,
            kind=kind if kind in USER_KINDS else 'otro',
            filename=file.filename or 'doc.txt',
            data=data,
            metadata={'origin': 'upload'},
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return DocumentOut(id=summary['doc_id'], title=summary['title'], source=summary['source'], kind=summary['kind'], chunks=summary['chunks'])


class FromUrlRequest(BaseModel):
    url: str = Field(min_length=10, max_length=2000)
    title: str | None = None
    source: Literal['siata', 'gobierno', 'ods', 'oms', 'academia', 'proyecto', 'otro'] = 'otro'
    kind: str = 'otro'


@router.post('/documents/from-url', response_model=DocumentOut, tags=['rag'])
async def document_from_url(req: FromUrlRequest):
    store, embedder = _store_or_503()
    if not req.url.startswith(('http://', 'https://')):
        raise HTTPException(status_code=422, detail='URL debe ser http(s).')
    try:
        async with httpx.AsyncClient(headers={'User-Agent': 'Terramind-RAG/1.0'}) as client:
            data = await fetch_bytes(client, req.url)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f'No se pudo descargar: {exc}') from exc
    filename = req.url.rsplit('/', 1)[-1].split('?')[0] or 'doc.pdf'
    try:
        summary = await ingest_bytes(
            store,
            embedder,
            title=req.title or filename,
            source=req.source,
            kind=req.kind if req.kind in USER_KINDS else 'otro',
            filename=filename,
            data=data,
            external_id=f'url:{req.url}',
            uri=req.url,
            metadata={'origin': 'from-url'},
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return DocumentOut(id=summary['doc_id'], title=summary['title'], source=summary['source'], kind=summary['kind'], chunks=summary['chunks'])


@router.get('/sources', tags=['rag'])
async def official_sources():
    """Catalogo de fuentes oficiales (municipal / nacional / internacional)."""
    return {'sources': OFFICIAL_SEEDS}


_INGEST_STATE: dict[str, Any] = {
    'last_run': None,
    'last_status': None,
    'last_day': None,
    'runs': 0,
}


def record_ingest(result: dict) -> None:
    """Registra la ultima ingesta SIATA (startup, scheduler o trigger manual)."""
    _INGEST_STATE.update(
        last_run=datetime.now(timezone.utc).isoformat(timespec='seconds'),
        last_status=result.get('status'),
        last_day=result.get('day'),
        runs=_INGEST_STATE['runs'] + 1,
    )


class IngestTriggerRequest(BaseModel):
    day: str | None = Field(default=None, description='YYYY-MM-DD, vacio = hoy')


@router.post('/ingest/trigger', tags=['rag'])
async def trigger_ingest(req: IngestTriggerRequest):
    """Dispara la ingesta del informe diario SIATA (hoy o fecha YYYY-MM-DD)."""
    store, embedder = _store_or_503()
    target = None
    if req.day:
        try:
            target = date.fromisoformat(req.day)
        except ValueError:
            raise HTTPException(status_code=422, detail='day debe ser YYYY-MM-DD')
    result = await ingest_siata_daily(store, embedder, target)
    record_ingest(result)
    return result


@router.get('/ingest/status', tags=['rag'])
async def ingest_status():
    """Estado de la ingesta automatica del informe SIATA."""
    return {
        'auto_ingest': settings.RAG_AUTO_INGEST,
        'store': settings.RAG_STORE,
        'scheduler': '06:00 America/Bogota' if settings.RAG_AUTO_INGEST else 'off',
        **_INGEST_STATE,
    }


@router.get('/documents', response_model=list[DocumentOut], tags=['rag'])
async def list_documents():
    store, _ = _store_or_503()
    return [DocumentOut(**d.__dict__) for d in await store.list_documents()]


@router.delete('/documents/{doc_id}', tags=['rag'])
async def delete_document(doc_id: str):
    store, _ = _store_or_503()
    if not await store.delete_document(doc_id):
        raise HTTPException(status_code=404, detail='Documento no existe.')
    return {'deleted': doc_id}


@router.post('/search', response_model=SearchResponse, tags=['rag'])
async def search(req: SearchRequest):
    store, _ = _store_or_503()
    if req.sources and any(s not in USER_SOURCES for s in req.sources):
        raise HTTPException(status_code=422, detail='Fuente invalida.')
    hits = await store.search(req.query, top_k=req.top_k, min_score=req.min_score, sources=req.sources)
    cites = _to_citations(hits)
    return SearchResponse(query=req.query, hits=cites, has_source=bool(cites))


NO_SOURCE_ANSWER = (
    'No encontre fuentes en la base documental para responder con respaldo. '
    'Sube informes SIATA o documentos oficiales (gobierno, ODS, OMS) y vuelve a preguntar.'
)


@router.post('/query', response_model=QueryResponse, tags=['rag'])
async def query(req: QueryRequest):
    """Pregunta con citas. Con fuentes: respuesta redactada y citada.
    Sin fuentes: charla honesta que encauza (saludos, guia, ejemplos)."""
    store, _ = _store_or_503()
    hits = await store.search(req.query, top_k=req.top_k, min_score=req.min_score)
    cites = _to_citations(hits)
    if not cites:
        return await _query_without_sources(store, req.query)
    context = '\n\n'.join(
        f'[{c.n}] {c.title} ({c.source}/{c.kind}' + (f', pag {c.page}' if c.page else '') + f', seccion: {c.section}):\n{c.excerpt}'
        for c in cites
    )
    messages: list[dict[str, str]] = [
        {
            'role': 'system',
            'content': (
                'Eres Terramind, copiloto ambiental del Valle de Aburra. '
                'Responde SOLO con el contexto numerado [1..N]; cita cada afirmacion '
                'como [n]. Si el contexto no alcanza, dilo y no inventes. Espanol claro.'
            ),
        },
        {'role': 'user', 'content': f'Pregunta: {req.query}\n\nContexto:\n{context}'},
    ]
    try:
        completion = await omniroute.complete(messages)
        provider = str(completion.get('provider', 'llm'))
        answer: Any = completion.get('content', '')
    except Exception:
        parts = []
        for c in cites[:3]:
            sents = [p.strip() for p in re.split(r'(?<=[.!?])\s+', c.excerpt) if p.strip()]
            parts.append(' '.join(sents[:2]) + f' [{c.n}]')
        answer = (
            'Respuesta extractiva (LLM no disponible). Segun los documentos: ' + ' '.join(parts)
        )
        provider = 'extractive-fallback'
    return QueryResponse(
        answer=str(answer), citations=cites, has_source=True, provider=provider
    )


async def _query_without_sources(store, question: str) -> QueryResponse:
    """Sin fuentes sobre el umbral: el LLM conversa y encauza sin inventar.

    Saludos y charla simple se responden natural; preguntas que necesitarian
    documentos se responden con honestidad + guia (temas del catalogo y un
    ejemplo). Jamas inventa contenido, cifras ni citas [n].
    """
    try:
        docs = await store.list_documents()
    except Exception:
        docs = []
    catalog = '\n'.join(f'- {d.title} ({d.source}/{d.kind})' for d in docs[:20])
    messages: list[dict[str, str]] = [
        {
            'role': 'system',
            'content': (
                'Eres Terramind, copiloto ambiental del Valle de Aburra (chat RAG documental). '
                'Responde en espanol claro y breve.\n'
                '1) Saludos, despedidas y charla simple: responde natural.\n'
                '2) Si preguntan por documentos o datos y NO hay fuentes, dilo con honestidad '
                'en una frase y encauza: menciona 2-3 temas del catalogo y un ejemplo de pregunta.\n'
                '3) JAMAS inventes contenido de documentos, cifras ni citas [n]. '
                'Sin fuentes no uses formato de citas.'
            ),
        },
        {'role': 'user', 'content': f'Pregunta: {question}\n\nCatalogo disponible:\n{catalog or "(biblioteca vacia)"}'},
    ]
    try:
        completion = await omniroute.complete(messages)
        if str(completion.get('provider', '')) == 'mock':
            raise RuntimeError('sin LLM externo')
        return QueryResponse(
            answer=str(completion.get('content', '')),
            citations=[],
            has_source=False,
            provider=str(completion.get('provider', 'llm')),
        )
    except Exception:
        return QueryResponse(
            answer=NO_SOURCE_ANSWER, citations=[], has_source=False, provider='abstain'
        )

# Fin del modulo: query() responde con citas; _query_without_sources conversa sin inventar.