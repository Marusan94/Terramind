# Biblioteca RAG — `data/rag_library/`

Carpeta de ingesta documental del RAG de Terramind. Ver `MANIFEST.csv` (tabla viva: archivo, título, `source/kind`, bytes, chunks, estado, URL origen).

## Contenido

- `pdf/` — 8 normas oficiales en PDF (6 con texto ingerible + 2 escaneadas sin texto).
- `html/` — 5 textos oficiales HTML (Leyes 1931/2169, NDC MinAmbiente, Res. 631 Cancillería, Res. 2254 ICBF).
- `referencias/` — `Fuentes_Ambientales_Colombia.pdf` + `enlaces_ambientales_colombia.*` (índice de 50+ portales, no se ingieren tal cual: son guía `from-url`).
- `ingest_result.json`, `test_result.json` — evidencia de ingesta y tests.

## Recargar la biblioteca (el RAG en memoria se pierde al reiniciar el API)

```bash
# 1. Backend (usa el python del sistema, que tiene fastapi + pypdf)
cd apps/api
C:\Users\USUARIO\AppData\Local\Programs\Python\Python311\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000

# 2. Ingesta (11 archivos base)
C:\Users\USUARIO\AppData\Local\Programs\Python\Python311\python.exe C:\Users\USUARIO\AppData\Local\Temp\opencode\ingest_rag_library.py

# 3. Resoluciones en HTML con texto (reemplazan los PDF escaneados)
C:\Users\USUARIO\AppData\Local\Programs\Python\Python311\python.exe C:\Users\USUARIO\AppData\Local\Temp\opencode\ingest_resoluciones.py
```

O vía panel web (`http://127.0.0.1:5173/` → biblioteca RAG → "Subir e indexar", `source=gobierno`, `kind=norma/plan`).

## Estado de tests (2026-09-19)

- Retrieval por norma: 10/12 = 0.83 (`test_rag_library.py`).
- Query con citas: OK (Groq real, 6 citas, ej. 40,00 °C Res. 631).
- Abstención: OK (`has_source=false`).
- `eval_rag.py` oficial: 6/10 = 0.60 (FAIL, umbral 0.80) — el golden QA se calibró para corpus solo-demo + `HashEmbedder` no semántico; con 11 normas reales se diluye. Remedio: `sentence-transformers` + `RAG_OFFLINE=False` + re-ingesta, y actualizar `golden_qa.json`.

## Pendientes

1. NDC 3.0 y E2050 (UNFCCC bloquea con Incapsula): descarga manual por navegador + subida por panel.
2. Res. 631/2254 PDF escaneados: requieren OCR (tesseract/ocrmypdf) para indexar el PDF oficial; mientras tanto el RAG usa las versiones HTML con texto.
3. `CORPUS.md` (`docs/`): marcar como indexadas las 11 normas de esta carpeta.
