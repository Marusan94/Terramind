"""Pipeline de ingesta: bytes/URL -> texto -> chunks -> embeddings -> pgvector."""
from __future__ import annotations

import logging
from datetime import date

import httpx

from app.rag.chunking import chunk_text
from app.rag.parsers import UnsupportedFormat, detect_kind, extract_text
from app.rag.sources import discover_siata_daily, fetch_bytes
from app.rag.store import RagStore

log = logging.getLogger('terramind.rag.ingest')

# Fuentes de documentos subidos por el usuario (gobierno, ODS, academia...).
USER_SOURCES = {'siata', 'gobierno', 'ods', 'oms', 'academia', 'proyecto', 'otro'}
USER_KINDS = {
    'informe_diario', 'protocolo', 'guia', 'tesis', 'paper', 'plan',
    'norma', 'presentacion', 'dataset_doc', 'otro',
}


def _pages_from_text(text: str) -> list[tuple[str, int | None]]:
    """Reparte el texto por marcador [pag N] conservando la pagina."""
    import re

    parts = re.split(r'\[pag (\d+)\]\n?', text)
    if len(parts) == 1:
        return [(text, None)]
    out: list[tuple[str, int | None]] = []
    if parts[0].strip():
        out.append((parts[0], None))
    for i in range(1, len(parts), 2):
        page = int(parts[i])
        body = parts[i + 1] if i + 1 < len(parts) else ''
        if body.strip():
            out.append((body, page))
    return out or [(text, None)]


async def ingest_bytes(
    store: RagStore,
    embedder,
    *,
    title: str,
    source: str,
    kind: str,
    filename: str,
    data: bytes,
    external_id: str | None = None,
    uri: str | None = None,
    metadata: dict | None = None,
) -> dict:
    """Ingiere un archivo en memoria. Devuelve resumen (doc_id, chunks...)."""
    if source not in USER_SOURCES:
        raise ValueError(f'source invalido: {source}')
    if kind not in USER_KINDS:
        raise ValueError(f'kind invalido: {kind}')
    if not data:
        raise ValueError('archivo vacio')
    try:
        text, meta = extract_text(filename, data)
    except UnsupportedFormat:
        raise
    if not text.strip():
        raise ValueError('no se extrajo texto (PDF escaneado sin OCR?)')
    packed: list[tuple[str, str, int | None]] = []
    for segment, page in _pages_from_text(text):
        for ch in chunk_text(segment):
            packed.append((ch.text, ch.section, page))
    if not packed:
        raise ValueError('sin chunks utiles')
    meta = {
        **(metadata or {}),
        'parser': meta,
        'format': detect_kind(filename),
        'bytes': len(data),
    }
    stored = await store.upsert_document(
        title=title,
        source=source,
        kind=kind,
        chunks=packed,
        external_id=external_id,
        uri=uri,
        metadata=meta,
        embedder_name=getattr(embedder, 'name', ''),
    )
    return {
        'doc_id': stored.id,
        'title': stored.title,
        'source': stored.source,
        'kind': stored.kind,
        'chunks': stored.chunks,
    }


async def ingest_siata_daily(
    store: RagStore, embedder, day: date | None = None
) -> dict:
    """Ingesta automatica del informe diario SIATA (idempotente por URL)."""
    day = day or date.today()
    async with httpx.AsyncClient(headers={'User-Agent': 'Terramind-RAG/1.0'}) as client:
        url = await discover_siata_daily(client, day)
        if not url:
            return {'status': 'not_found', 'day': day.isoformat()}
        try:
            data = await fetch_bytes(client, url)
        except Exception as exc:
            log.warning('SIATA download failed %s: %s', url, exc)
            return {'status': 'download_error', 'day': day.isoformat(), 'url': url}
    title = f"SIATA informe diario {day.isoformat()}"
    try:
        summary = await ingest_bytes(
            store,
            embedder,
            title=title,
            source='siata',
            kind='informe_diario',
            filename=url.rsplit('/', 1)[-1] or 'informe.pdf',
            data=data,
            external_id=f'siata:diario:{url}',
            uri=url,
            metadata={'day': day.isoformat()},
        )
    except ValueError as exc:
        return {'status': 'empty', 'day': day.isoformat(), 'url': url, 'reason': str(exc)}
    return {'status': 'ok', **summary, 'url': url}


def start_scheduler(store_factory, embedder_factory, on_result=None):
    """Scheduler APScheduler: ingesta SIATA diaria 06:00 America/Bogota.

    `on_result` (opcional) recibe el dict de cada corrida para el
    endpoint de estado.
    """
    from apscheduler.schedulers.asyncio import AsyncIOScheduler
    from apscheduler.triggers.cron import CronTrigger

    sched = AsyncIOScheduler(timezone='America/Bogota')

    async def job() -> None:
        try:
            result = await ingest_siata_daily(store_factory(), embedder_factory())
            log.info('SIATA daily ingest: %s', result.get('status'))
            if on_result is not None:
                try:
                    on_result(result)
                except Exception:
                    log.exception('SIATA ingest on_result crashed')
        except Exception as exc:
            log.exception('SIATA daily ingest crashed: %s', exc)

    sched.add_job(job, CronTrigger(hour=6, minute=0), id='siata-daily', replace_existing=True)
    sched.start()
    return sched