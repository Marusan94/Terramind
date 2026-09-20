"""Ingesta de `data/rag_library` al arrancar el API (lee MANIFEST.csv).

Se activa cuando `RAG_LIBRARY_DIR` apunta a una carpeta existente.
Idempotente en stores con `external_id` (memoria lo usa para reemplazar).
"""
from __future__ import annotations

import csv
from pathlib import Path


async def ingest_library_dir(store, embedder, library_dir: str) -> dict:
    """Ingiere las filas con estado=ingerido. Devuelve resumen."""
    from app.rag.ingest import ingest_bytes

    base = Path(library_dir)
    rows = [
        r
        for r in csv.DictReader((base / 'MANIFEST.csv').open(encoding='utf-8'))
        if r.get('estado') == 'ingerido'
    ]
    ok, fail = 0, []
    for r in rows:
        rel = r['archivo']
        try:
            await ingest_bytes(
                store,
                embedder,
                title=r['titulo'],
                source=r['source'],
                kind=r['kind'],
                filename=Path(rel).name,
                data=(base / rel).read_bytes(),
                external_id=f'lib:{rel}',
                uri=r.get('url_origen') or None,
                metadata={'origin': 'library-dir'},
            )
            ok += 1
        except Exception as exc:
            fail.append(f'{rel}: {exc}')
    docs = await store.list_documents()
    return {'ok': ok, 'fail': fail, 'docs': len(docs)}
