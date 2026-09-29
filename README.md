<p align="center">
  <h1 align="center">🌎 Terramind</h1>
  <p align="center"><strong>Environmental intelligence for Valle de Aburrá, Colombia.</strong><br>Interactive 3D map, real-time air & climate data, and an AI copilot that answers with citations.<br><a href="https://terramind-mu.vercel.app"><strong>🚀 Live Demo → terramind-mu.vercel.app</strong></a></p>
  <p align="center">
    <img src="https://img.shields.io/badge/version-0.3.0-blue?style=flat-square" alt="Version" />
    <img src="https://img.shields.io/badge/license-Apache--2.0-green?style=flat-square" alt="License" />
    <img src="https://img.shields.io/badge/React-18-61DAFB?style=flat-square&logo=react&logoColor=black" alt="React" />
    <img src="https://img.shields.io/badge/TypeScript-5.4-3178C6?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript" />
    <img src="https://img.shields.io/badge/Python-3.11+-3776AB?style=flat-square&logo=python&logoColor=white" alt="Python" />
    <img src="https://img.shields.io/badge/FastAPI-009688?style=flat-square&logo=fastapi&logoColor=white" alt="FastAPI" />
    <img src="https://img.shields.io/badge/PostGIS-3.4-336791?style=flat-square&logo=postgresql&logoColor=white" alt="PostGIS" />
    <img src="https://img.shields.io/badge/tests-15_web_+_4_api-brightgreen?style=flat-square" alt="Tests" />
    <img src="https://img.shields.io/badge/CI-GitHub_Actions-2088FF?style=flat-square&logo=github-actions&logoColor=white" alt="CI" />
  </p>
</p>

## Table of Contents

- [Screenshots](#-screenshots)
- [Features](#-features)
- [Tech Stack](#️-tech-stack)
- [Quickstart](#-quickstart)
- [Usage](#-usage)
- [Architecture](#️-architecture)
- [Project Status](#-project-status)
- [Documentation](#-documentation)
- [Roadmap](#-roadmap)
- [Contributing](#-contributing)
- [License](#-license)

## 📸 Screenshots

![Terramind map today](./docs/screenshots/Captura%200.png)

*3D AQI map of the valley today: summary card, active layers (air, weather, water, vegetation, comunas), extruded buildings, action panel.*

![Terramind map](./docs/screenshots/home-mapa.png)

*Comunas colored by AQI, PM2.5/PM10 stations, water levels, and the AI copilot answering live.*

![Intelligence tab](./docs/screenshots/tab-inteligencia.png)

*Intelligence tab: estimated mixing height (thermal inversion layer) and neighborhoods above the WHO PM2.5 standard.*

![Forecast tab](./docs/screenshots/tab-pronostico.png)

*Forecast tab: 48-hour series with intervals plus a 7-day outlook.*

![Stations tab](./docs/screenshots/tab-estaciones.png)

*Stations tab: SIATA network by municipality with AQI, PM2.5/PM10, O₃, NO₂.*

![Water tab](./docs/screenshots/tab-agua.png)

*Water tab: live Medellín River and stream levels from the SIATA geoportal, with precaution-threshold alerts.*

![RAG panel](./docs/screenshots/tab-rag.png)

*RAG panel: 15-document library (Colombian regulation, WHO guides, SDGs), cited answers, file upload for indexing.*

## ✨ Features

- 🗺️ **Interactive 3D map** (MapLibre GL + deck.gl): air stations, rain radar, water levels, vegetation, terrain + extruded buildings
- 🌫️ **Real data with offline demo**: SIATA sensor network, Open-Meteo, RainViewer — works without API keys in demo mode
- 🤖 **AI copilot**: natural-language questions over live data, multi-provider routing (Groq, Gemini, OpenRouter), SSE streaming
- 📚 **Document RAG**: Colombian environmental norms + WHO guides, answers with citations, upload-to-index flow
- 📊 **11-tab dashboard**: AQI, PM2.5/PM10, history, alerts, 48h/weekly forecast, share links
- 🔁 **Hybrid pipeline**: anti-corruption data layer (17 services), deterministic simulation fallback, tile cache

## 🛠️ Tech Stack

| Layer | Technologies |
|-------|--------------|
| Frontend | React 18, TypeScript 5.4, Vite, Tailwind CSS, Zustand, Recharts, MapLibre GL, deck.gl |
| Backend | Python 3.11+, FastAPI, Pydantic v2, multi-LLM routing |
| Data | PostgreSQL 16 + PostGIS 3.4, Redis, REST (SIATA, Open-Meteo, RainViewer) |
| Quality | Vitest + Testing Library (15 suites), pytest (4 modules), ESLint, GitHub Actions |
| Deploy | Docker Compose, Vercel (web), Railway/Fly.io (API) |

## ⚡ Quickstart

```bash
# 2 minutes, no backend — demo mode
git clone https://github.com/Marusan94/Terramind.git
cd terramind/apps/web
npm install
npm run dev
# Open http://localhost:5173
```

<details>
<summary><strong>Full install (backend + database)</strong></summary>

```bash
# 1. Infra (PostgreSQL + PostGIS + Redis)
docker compose up -d

# 2. Backend
cd apps/api
python -m venv .venv
# Windows:
.\.venv\Scripts\Activate.ps1
# macOS/Linux:
# source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
# API docs: http://localhost:8000/docs

# 3. Env (optional — without keys demo mode kicks in)
cp .env.example .env
# Free keys: Gemini (aistudio.google.com/apikey), Groq (console.groq.com/keys)
```

</details>

```bash
# Tests
cd apps/web && npm test        # 15 Vitest suites
cd apps/api && pytest          # 4 backend modules
```

## 💡 Usage

```bash
# Health check
curl http://localhost:8000/health
```

- **Ask the copilot**: `¿Cuál es el PM2.5 ahora en Laureles y supera la norma OMS?` → cited answer + map highlight.
- **Forecast flow**: open *Pronóstico* → pick a comuna → read the 48h band + weekly cards.
- **RAG flow**: open *RAG Documental* → ask `¿Qué dice el Decreto 1076 sobre vertimientos?` → answer with document chunks.

## 🏗️ Architecture

![Terramind architecture](./docs/architecture-terramind-dark.png)

*Interactive version: [`docs/architecture-terramind.html`](./docs/architecture-terramind.html) — explore nodes, trace routes (`R`), upstream/downstream scope, role compare (`L`), present (`F`), export (`E`). Versioned source: [`docs/architecture-terramind.json`](./docs/architecture-terramind.json).*

```
        React 18 + TypeScript (MapLibre + deck.gl)
                          │
            ┌─────────────┴─────────────┐
            │                           │
    🗺️ 3D MAP VIEWPORT           🤖 AI COPILOT (Groq/Gemini/OpenRouter)
            │                           │
            └─────────────┬─────────────┘
                          ▼
                   FASTAPI BACKEND
                          │
     ┌────────────────────┼────────────────────┐
     ▼                    ▼                    ▼
PostGIS + Redis     SIATA / Open-Meteo    Tile cache
(spatial)           / RainViewer          + demo mode
```

## 📍 Project Status

| Capability | State | Evidence |
|---|---|---|
| 3D map with terrain + extruded buildings | ✅ Live (toggle) | `AirMap.tsx`, `MapViewport.tsx`, `basemaps.ts` |
| Dashboard overlay (11 tabs) | ✅ Wired | `App.tsx:395` |
| Chat with SSE streaming | ✅ Live | `ChatWidget.tsx`, `openRouter.ts` |
| Hybrid SIATA + Open-Meteo + simulated | ✅ Live | `valley.ts` (17 services) |
| FastAPI (copilot, health, rag, spatial) | ✅ Done | `apps/api/app/api/v1/endpoints/` |
| Document RAG + multi-LLM | ✅ Done | `apps/api/app/rag/`, `core/llm.py` |
| Forecast, alerts, share | ✅ Done | `predictions.ts`, `AlertsPanel.tsx`, `share.ts` |
| 100% live data, no fallback | ⏳ Pending | SIATA history + Open-Meteo + deterministic sim |
| Mobile-responsive design | ⏳ Pending | Desktop-first (see PRD §9) |

## 📚 Documentation

| Document | Description |
|-----------|-------------|
| [01_ARCHITECTURE.md](./docs/engineering/01_ARCHITECTURE.md) | System architecture |
| [07_API_CONTRACT.md](./docs/engineering/07_API_CONTRACT.md) | REST API contract |
| [AGENTS.md](./AGENTS.md) | Multi-agent guide |
| [CONTRIBUTING.md](./CONTRIBUTING.md) | How to contribute |
| [RAG ingest guide](./data/rag_library/README_INGESTA.md) | Re-index commands (in-memory RAG resets on API restart) |

## 🗺️ Roadmap

- [x] 3D map + dashboard + copilot + RAG with citations
- [ ] 100% live pipeline (remove simulation fallback)
- [ ] Mobile-responsive layout
- [ ] Alert subscriptions (email/push per comuna)
- [ ] Public embed widget (`<iframe>` map)

## 🤝 Contributing

Fork → branch (`feat/map: ...`) → `npm test` + `pytest` → PR with screenshots for UI changes. See [CONTRIBUTING.md](./CONTRIBUTING.md).

## 📜 License

Apache-2.0 — see [LICENSE](./LICENSE). Data: **SIATA** (Área Metropolitana del Valle de Aburrá) · **Open-Meteo** · **RainViewer** · **OpenStreetMap** · **MapLibre** · **deck.gl**.

---

<p align="center"><strong>🌎 Ask the data. • 🤖 AI answers. • 🗺️ The map shows it.</strong><br>Built in Medellín, Colombia — by <a href="https://github.com/Marusan94">@Marusan94</a></p>
