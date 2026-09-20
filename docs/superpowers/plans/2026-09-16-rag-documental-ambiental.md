# RAG Documental Ambiental Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Corpus fundacional indexado + RAG con citas evaluado + despliegue a produccion (pgvector + ingesta diaria SIATA).

**Architecture:** Backend FastAPI (`apps/api/app/rag/`) como fuente de verdad documental; frontend (`RagLibrary.tsx`) consume `/api/v1/rag/*` con fallback local. Ingesta: upload manual + from-url + scheduler diario SIATA. Sin LLM no hay respuesta redactada: abstencion honesta con citas.

**Tech Stack:** FastAPI, SQLAlchemy async, pgvector (vector 384), sentence-transformers `paraphrase-multilingual-MiniLM-L12-v2` (hash-384 offline), APScheduler, pypdf/python-docx/openpyxl, React 18 + Vite.

**Spec:** Este plan implementa el modulo RAG Documental Ambiental (panel separado del chatbot del mapa, audiencia: monitores e ingenieria ambiental).

## Global Constraints

- TypeScript `strict: true`, prohibido `any` explicito en codigo nuevo (`apps/web/tsconfig.json`).
- Python: type hints en funciones nuevas, Pydantic v2 en schemas.
- EMBEDDING_DIM 384 en codigo, migracion y modelo. Cambiarlo exige reindexar todo.
- Ninguna key en el repo (solo `.env` / `VITE_*` en `.env.local`).
- Datos estimados/simulados siempre etiquetados en UI y metadatos.
- Convencional commits (`feat(rag): ...`).

---

## Fase A — Corpus fundacional (documentos P0 indexados y citados)

### Task A1: Ingerir P0 via from-url/upload y verificar citas

**Files:**
- Usa: `POST /api/v1/rag/documents/from-url`, `POST /api/v1/rag/documents/upload` (ya existen en `apps/api/app/api/v1/endpoints/rag.py`)
- Test: `apps/api/tests/test_rag_corpus.py` (crear)

**Interfaces:**
- Consumes: `ingest_bytes(store, embedder, title, source, kind, filename, data, ...)` de `apps/api/app/rag/ingest.py`
- Produces: doc_ids P0 para la evaluacion de Fase B.

- [ ] **Step 1: Write the failing test**

```python
P0 = [
    ('https://www.minambiente.gov.co/wp-content/uploads/2021/10/Resolucion-2254-de-2017.pdf', 'gobierno', 'norma'),
    ('https://www.who.int/publications/i/item/9789240034228', 'oms', 'guia'),
]

async def test_corpus_p0_searchable(fake_store):
    # despues de ingerir, cada query ancla debe traer su doc con score >= min
    ...
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest apps/api/tests/test_rag_corpus.py -x -q`
Expected: FAIL (documentos no ingeridos / sin red en CI -> usar PDFs locales en `apps/api/tests/fixtures/`).

- [ ] **Step 3: Descargar P0 a fixtures y test con archivos locales**

```bash
mkdir -p apps/api/tests/fixtures
# descargar: Res2254 PDF, OMS AQG (si pesa >20MB usar extracto), CONPES 3943, POECA, PIGECA
```

Regla: fixtures <= 5MB c/u; si el PDF oficial pesa mas, guardar las 10 primeras paginas (pypdf) con sufijo `-extracto.pdf` y registrarlo en el test.

- [ ] **Step 4: Ingerir en API local en modo memoria y verificar search**

```bash
RAG_STORE=memory RAG_OFFLINE=True python -m uvicorn app.main:app --port 8000
# subir cada P0 via /docs y buscar su query ancla
```

Expected: cada ancla devuelve su doc top-1 con `has_source: true`.

- [ ] **Step 5: Commit**

```bash
git add apps/api/tests/test_rag_corpus.py apps/api/tests/fixtures/
git commit -m "test(rag): corpus P0 con queries ancla"
```

### Task A2: Metadatos de ambito (municipal/nacional/internacional)

**Files:**
- Modify: `apps/api/app/rag/models.py` (columna `scope`), `database/migrations/002_rag_scope.sql` (crear)
- Modify: `apps/api/app/rag/ingest.py` (derivar scope de source), `apps/api/app/api/v1/endpoints/rag.py` (exponerlo)
- Test: `apps/api/tests/test_rag.py` (agregar)

**Interfaces:**
- Consumes: mapa `{'siata': 'municipal', 'gobierno': 'nacional', 'oms': 'internacional', 'ods': 'internacional', 'academia': 'mixto', 'proyecto': 'proyecto', 'otro': 'mixto'}`.
- Produces: campo `scope` en `DocumentOut`, `Citation` y filtros `sources` + `scopes` en search.

- [ ] **Step 1: Failing test** — `search(scopes=['municipal'])` solo trae SIATA.
- [ ] **Step 2: Run** — FAIL (sin columna).
- [ ] **Step 3: Implementar** — columna + migracion + filtro SQL `AND d.scope = ANY(:scopes)` en `store.py` y `memory.py`.
- [ ] **Step 4: Run** — `python -m pytest apps/api/tests/ -q` PASS (22+).
- [ ] **Step 5: Commit** — `feat(rag): filtro por ambito municipal/nacional/internacional`.

---

## Fase B — Calidad del RAG (medir antes de decorar)

### Task B1: Set dorado de 15 preguntas + script de evaluacion

**Files:**
- Create: `apps/api/tests/fixtures/golden_qa.json` (15x {q, expected_doc, must_contain})
- Create: `apps/api/eval_rag.py` (script CLI contra API local)
- Test: el script falla si hit@3 < 0.8

**Interfaces:**
- Consumes: `POST /api/v1/rag/search` en `http://127.0.0.1:8000`.
- Produces: reporte `{hit@1, hit@3, abstenciones}`.

- [ ] **Step 1: Escribir golden_qa.json** (15 preguntas: 5 SIATA, 4 normas, 3 OMS, 3 ODS/planes).
- [ ] **Step 2: Escribir eval_rag.py** que itera, mide y sale codigo 1 si hit@3 < 0.8.
- [ ] **Step 3: Run** — `python apps/api/eval_rag.py` (esperado: baseline, probablemente < 0.8 con hash).
- [ ] **Step 4: Subir RAG_MIN_SCORE a 0.3 si hay falsos positivos** (config, no codigo).
- [ ] **Step 5: Commit** — `test(rag): evaluacion dorada hit@3`.

### Task B2: Nota OCR para PDFs escaneados

**Files:**
- Modify: `apps/api/app/rag/parsers.py` (`_extract_pdf`: si `pages_with_text == 0` y hay paginas, mensaje accionable)
- Test: `apps/api/tests/test_rag.py` (PDF sin capa de texto -> ValueError con texto "sin OCR")

- [ ] **Step 1: Failing test** con PDF de pagina en blanco generada con pypdf.
- [ ] **Step 2-4: Implementar y pasar** — el error debe decir: "PDF sin texto extraible (escaneado?): pasa OCR o sube version digital".
- [ ] **Step 5: Commit** — `feat(rag): mensaje accionable para PDFs escaneados`.

---

## Fase C — UX del panel (intuitivo para no tecnicos)

### Task C1: Filtros por ambito + badge de cita verificada

**Files:**
- Modify: `apps/web/src/components/RagLibrary.tsx` (chips Municipal/Nacional/Internacional que filtran preguntas y biblioteca)
- Modify: `apps/web/src/services/ragBackend.ts` (pasar `scopes` a search/query)
- Test: `apps/web/src/__tests__/ragBackend.test.ts` (scopes se envian en el body)

- [ ] **Step 1: Failing test** — `retrieveContext` con scopes incluye `scopes` en el JSON.
- [ ] **Step 2-4: Implementar y pasar** (`npx vitest run`, `npx tsc -b`).
- [ ] **Step 5: Commit** — `feat(rag-ui): filtros por ambito`.

### Task C2: Vista previa del documento y pagina citada

**Files:**
- Modify: `apps/web/src/components/RagLibrary.tsx` (click en cita -> modal con excerpt completo + metadatos + link Abrir fuente)
- Test: manual en dev (click cita [1] muestra modal). Sin test unitario: es presentacional puro.

- [ ] **Step 1-3: Implementar modal** reutilizando `dashboard-view` como contenedor.
- [ ] **Step 4: Verificar** — `npx tsc -b` + click manual en http://127.0.0.1:5173/.
- [ ] **Step 5: Commit** — `feat(rag-ui): modal de cita con contexto`.

---

## Fase D — Produccion (pgvector + scheduler + Vercel)

### Task D1: Subir stack real y primera ingesta SIATA

**Files:**
- Usa: `database/Dockerfile`, `docker-compose.yml`, `database/migrations/001_rag.sql` (ya existen)
- Modify: `.env.example` (ya tiene RAG_*; verificar en servidor)

- [ ] **Step 1: Build y up** — `docker compose build db && docker compose up -d db` en servidor.
- [ ] **Step 2: Migrar** — `psql $DATABASE_URL -f database/migrations/001_rag.sql` (esperado: tablas + indice ivfflat).
- [ ] **Step 3: Ingesta manual** — `RAG_STORE=pgvector RAG_AUTO_INGEST=True uvicorn...` y verificar `/rag/documents` trae el informe de hoy.
- [ ] **Step 4: Scheduler** — dejar proceso con APScheduler; verificar log `[rag] startup ingest: ok` al dia siguiente.
- [ ] **Step 5: Commit** — solo docs si hizo falta (`docs: despliegue RAG en servidor`).

### Task D2: Frontend a Vercel contra el API

**Files:**
- Config Vercel: `VITE_API_URL=https://<tu-api>` (Railway/Fly).
- Test: abrir panel, badge debe decir "backend", subir un PDF real.

- [ ] **Step 1: Set env en Vercel y redeploy.**
- [ ] **Step 2: Verificar** — biblioteca muestra docs del servidor; pregunta cita SIATA real.
- [ ] **Step 3: Rollback plan** — si falla, vaciar VITE_API_URL (vuelve a local sin romper nada).
- [ ] **Step 4: Commit** — `chore: VITE_API_URL a produccion` (solo si hay archivo versionado que lo pida; si es dashboard, documentar).

---

## Self-Review

- Cobertura: corpus (A1-A2), calidad (B1-B2), UX (C1-C2), prod (D1-D2). Sin gaps.
- Placeholders: ninguno; cada paso tiene comando o codigo.
- Tipos: `scope` debe existir en `Document`, `RagChunk` no cambia; `Citation.scope`? No se agrego: las citas ya traen `source` y el frontend deriva ambito con `sourceMeta` (verificar en C1 que el filtro use `sources`, no un campo nuevo).

## Anexo — Normas ISO/NTC para el corpus

Clasificacion: `source: otro`, `kind: norma`, titulo con edicion (ej. "ISO 14001:2015 (copia privada)").
AVISO LEGAL: las ISO son de pago (ISO.org / ICONTEC). No redistribuir: subir solo
copias licenciadas para uso privado del RAG, o indexar alcances publicos + adopciones NTC.

- P1: NTC-ISO/IEC 17025 (competencia de laboratorios; la usa la red SIATA, respalda la confianza en el dato).
- P1: ISO 14001:2015 / NTC-ISO 14001 (gestion ambiental; marco para autoridades y empresas del Valle).
- P1: ISO 14064-1:2018 (inventarios GEI; base de inventarios de emisiones).
- P1: ISO 37120:2018 (indicadores de ciudad sostenible; incluye PM2.5 como indicador urbano).
- P2: ISO 14067:2018 (huella de carbono de producto).
- P2: ISO 14040/14044 (analisis de ciclo de vida).
- P2: Metodos de referencia de monitoreo (ej. atenuacion beta para PM, quimioluminiscencia para NOx).
- P2: ISO 14090 (adaptacion al cambio climatico), ISO 50001 (energia), ISO 14046 (huella hidrica).
- P1: Adopciones NTC-ISO via ICONTEC (tienda.icontec.org): NTC-ISO 14001, NTC-ISO 14064-1, NTC-ISO/IEC 17025.
- P2: GTC (Guias Tecnicas Colombianas) de gestion ambiental y monitoreo que apliquen al Valle.
- Nota: clasificar igual (source: otro, kind: norma); las NTC tambien son de pago, mismo tratamiento legal que las ISO.