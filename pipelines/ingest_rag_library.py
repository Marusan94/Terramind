"""Ingesta de la biblioteca RAG al API vivo (lee MANIFEST.csv).

Uso:
    python pipelines/ingest_rag_library.py [--base-url http://127.0.0.1:8000]

Idempotente a nivel de reporte (el store reemplaza por external_id solo en
from-url; por upload cada corrida crea docs nuevos: verificar duplicados
con GET /api/v1/rag/documents antes de re-correr en prod).
Requiere: httpx (pip install httpx).
"""
from __future__ import annotations

import csv
import json
import os
import sys
from pathlib import Path

BASE = sys.argv[sys.argv.index('--base-url') + 1] if '--base-url' in sys.argv else 'http://127.0.0.1:8000'
LIB = Path(__file__).resolve().parent.parent / 'data' / 'rag_library'


def main() -> int:
    import httpx

    manifest = LIB / 'MANIFEST.csv'
    rows = [r for r in csv.DictReader(manifest.open(encoding='utf-8')) if r['estado'] == 'ingerido']
    ok, fail = 0, []
    with httpx.Client(base_url=BASE, timeout=180.0) as c:
        before = len(c.get('/api/v1/rag/documents').json())
        for r in rows:
            path = LIB / r['archivo']
            with path.open('rb') as f:
                resp = c.post(
                    '/api/v1/rag/documents/upload',
                    files={'file': (path.name, f, 'application/octet-stream')},
                    data={'title': r['titulo'], 'source': r['source'], 'kind': r['kind']},
                )
            if resp.status_code == 200:
                d = resp.json()
                print(f"OK {r['archivo']} -> chunks={d['chunks']}")
                ok += 1
            else:
                print(f"FAIL {r['archivo']} -> {resp.status_code} {resp.text[:150]}")
                fail.append(r['archivo'])
        after = c.get('/api/v1/rag/documents').json()
    print(f'docs: {before} -> {len(after)} | ok={ok} fail={len(fail)}')
    (LIB / 'ingest_result.json').write_text(
        json.dumps({'ok': ok, 'fail': fail, 'docs_total': len(after)}, ensure_ascii=False, indent=2),
        encoding='utf-8',
    )
    return 0 if not fail else 1


if __name__ == '__main__':
    sys.exit(main())
