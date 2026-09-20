"""Autotest del RAG (eval dorada): hit@3 + abstencion contra un API vivo.

Uso:
    python apps/api/eval_rag.py [--base-url http://127.0.0.1:8000]

El API debe tener corpus (seed demo + docs ingeridos). Sale codigo 1
si hit@3 < 0.8. Salida ASCII a proposito (consolas sin UTF-8).
"""
from __future__ import annotations

import json
import sys
import urllib.request
from pathlib import Path

BASE = sys.argv[sys.argv.index('--base-url') + 1] if '--base-url' in sys.argv else 'http://127.0.0.1:8000'
GOLDEN = Path(__file__).parent / 'tests' / 'fixtures' / 'golden_qa.json'
ABSTAIN_Q = 'zzzqqq frobnicar blarg'


def post(path: str, payload: dict) -> dict:
    req = urllib.request.Request(
        BASE + path,
        data=json.dumps(payload).encode(),
        headers={'Content-Type': 'application/json'},
    )
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read().decode('utf-8'))


def main() -> int:
    cases = json.loads(GOLDEN.read_text(encoding='utf-8'))
    hits = 0
    for i, c in enumerate(cases, 1):
        data = post('/api/v1/rag/search', {'query': c['q'], 'top_k': 3})
        titles = [h['title'].lower() for h in data.get('hits', [])]
        ok = any(c['expect'].lower() in t for t in titles)
        hits += 1 if ok else 0
        top = titles[0][:45] if titles else '(sin hits)'
        print(f'Q{i:02d} {"PASS" if ok else "FAIL"} :: {c["q"][:45]} -> {top}')
    q = post('/api/v1/rag/query', {'query': ABSTAIN_Q})
    abstain_ok = q.get('has_source') is False
    print(f'ABSTAIN {"PASS" if abstain_ok else "FAIL"} :: pregunta imposible -> has_source={q.get("has_source")}')
    rate = hits / len(cases)
    print(f'hit@3 = {hits}/{len(cases)} = {rate:.2f} (umbral 0.80)')
    good = rate >= 0.80 and abstain_ok
    print('EVAL ' + ('PASS' if good else 'FAIL'))
    return 0 if good else 1


if __name__ == '__main__':
    raise SystemExit(main())