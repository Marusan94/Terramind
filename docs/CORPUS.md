# 📚 CORPUS — Documentos indexados en Terramind RAG

> Tabla viva de todas las fuentes documentales soportadas. Cada fila indica el documento, su enlace, clase, método de ingestión y estado real (indexado / pendiente). Actualízala cada vez que agregues/quites un PDF o URL.

## 🌎 Municipal — Valle de Aburrá (Antioquia)

| # | Documento | Link | Clase | Método | Estado |
|---|-----------|------|-------|--------|--------|
| 1 | Informes diarios SIATA | <https://siata.gov.co/Informes_Aire> | siata/informe_diario | auto-diaria (prod) | pendiente prod |
| 2 | Bedoya & Martínez 2009, Calidad del aire Valle de Aburrá (UNAL+UdeA) | <https://scielo.org.co> (pid S0012-73532009000200001) | academia/paper | from-url HTML | verificado hoy |
| 3 | Ramos-Contreras et al 2023, PM10 + inversión 17–10h (UdeA GAIA) | <https://pmc.ncbi.nlm.nih.gov> (PMC10163095) | academia/paper | from-url HTML | verificado hoy |
| 4 | AMVA Escenario de riesgo por contaminación | <https://metropol.gov.co> (PDF) | gobierno/plan | from-url, verificar en build | pendiente |
| 5 | AMVA Inventario de emisiones 2015 | <https://metropol.gov.co> | gobierno/plan | verificar link en build | pendiente |
| 6 | AMVA Informe Anual Aire 2017 | <https://metropol.gov.co> | gobierno/informe_diario | verificar en build | pendiente |
| 7 | POECA + PIGECA | <https://metropol.gov.co> | gobierno/protocolo, gobierno/plan | upload manual | pendiente |
| 8 | Tesis SIATA (cantera local) | <https://siata.gov.co/sitio_web/index.php/tesis> | academia/tesis | upload c/u | pendiente |

## 🇨🇴 Nacional — Colombia

| # | Documento | Link | Clase | Método | Estado |
|---|-----------|------|-------|--------|--------|
| 9 | Res. 2254 de 2017 | compilación ICBF (HTML) | gobierno/norma | upload manual (rag_library, 17 frag) | ✅ |
| 10 | CONPES 3943 de 2018 | <https://minambiente.gov.co/normativa/conpes> | gobierno/plan | página índice → PDF manual | pendiente |
| 11 | Estrategia Nacional Calidad del Aire 2019 | <https://minambiente.gov.co> (lineamientos) | gobierno/plan | upload manual | pendiente |
| 12 | Ley 99/1993, Decreto 1076 | <https://secretariasenado.gov.co> / <https://alcaldiabogota.gov.co> HTML | gobierno/norma | upload manual (rag_library) | ✅ indexadas (326 + 4899 frag) |
| 13 | CONPES 3918 (ODS Colombia) | <https://minambiente.gov.co> | gobierno/plan | upload | pendiente |
| 14 | IDEAM/SISAIRE informes anuales | <https://ideam.gov.co> | gobierno/informe_diario | upload | pendiente |
| 21 | Res. 631 de 2015 (texto Cancillería) | <https://www.cancilleria.gov.co/sites/default/files/Normograma/docs/resolucion_minambienteds_0631_2015.htm> | gobierno/norma | upload manual (rag_library) | ✅ indexada (346 frag) |
| 22 | Res. 627 de 2006 (ruido) | MinAmbiente PDF (rag_library) | gobierno/norma | upload manual (rag_library) | ✅ indexada (145 frag) |
| 23 | Ley 1333 de 2009 (sancionatorio) | VITAL PDF (rag_library) | gobierno/norma | upload manual (rag_library) | ✅ indexada (108 frag) |
| 24 | Constitución 1991 (ambiente sano) | Senado PDF (rag_library) | gobierno/norma | upload manual (rag_library) | ✅ indexada (664 frag) |
| 25 | Ley 1931/2018 + Ley 2169/2021 (clima) | Cancillería HTML (rag_library) | gobierno/norma | upload manual (rag_library) | ✅ indexadas (106 + 175 frag) |
| 26 | NDC Colombia (MinAmbiente) | MinAmbiente HTML (rag_library) | gobierno/plan | upload manual (rag_library) | ✅ indexada (23 frag) |

## 🌐 Internacional + Papers Mundo

| # | Documento | Link | Clase | Método | Estado |
|---|-----------|------|-------|--------|--------|
| 15 | OMS Guías 2021 (completa) | <https://who.int/publications/i/item/9789240034228> | oms/guia | from-url PDF | parcial (demo) |
| 16 | ODS 3 y 11 | <https://sdgs.un.org/goals> | ods/plan | referencia + upload | parcial (demo) |
| 17 | Parra 2024, meteorología vs PM2.5 (MDPI) | <https://mdpi.com/2071-1050/16/23/10250> | academia/paper | verificar en build | pendiente |
| 18 | Long-range transport aerosoles (EGUsphere 2024-695) | <https://egusphere> (preprint abierto) | academia/paper | verificar en build | pendiente |
| 19 | Aguiar-Gil 2020 (2004 muertes 2016) | ScienceDirect (paywall) | — | solo abstract + cita | no indexar |
| 20 | WHO Global Air Quality Database | <https://who.int> | oms/guia | referencia | pendiente |

## 📄 Normas ISO/NTC (anexo)

| Normas | Estado |
|--------|--------|
| ISO 17025 (calibración) | P1 — licencia privada |
| ISO 14001 (ambiental) | ✅ indexada (257 frag, copia pública NTC-ISO-14001-2015) ; P1 aplica a edición oficial |
| ISO 14064-1 (GEI) | P1 — licencia privada |
| ISO 37120 (ciudades sostenibles) | P1 — aceso público limitado |
| NTC 5021 (calidad del aire) | P2 — técnico, sin copia pública |

### Leyenda de columnas

| Columna | Significado |
|---------|-------------|
| **Clase** | Categoría de origen: `siata/informe_diario`, `academia/paper`, `gobierno/plan`, `gobierno/norma`, `gobierno/protocolo`, `academia/tesis`, `oms/guia`, `ods/plan` |
| **Método** | Cómo entró al índice: `from-url HTML`, `from-url PDF`, `upload manual` o `auto-diaria (prod)` |
| **Estado** | `✅` = indexado y presente en golden QA; `pendiente` = por ingerir; `verificar en build` = link vivo pero falta confirmar en el pipeline de build; `no indexar` = detrás de muro de pago o solo abstract |

### Próximos pasos

1. Pega tu `GROQ_API_KEY` en `apps/api/.env` (una sola vez) y reinicia el API.
2. Ejecuta `python eval_rag.py` — debe dar **EVAL PASS** (hit@3 ≥ 0.80, abstención PASS).
3. Usa el panel `RagLibrary` (`/rag`) para subir PDFs nuevos o ingresar URLs (`from-url`).
4. Actualiza esta tabla cada vez que un documento pase de `pendiente` a `indexado`.

---
*Generado automáticamente por el script de saneamiento. No editar a mano — las columnas `Clase` y `Método` son consumidas por los parsers y el pipeline de ingestion.*