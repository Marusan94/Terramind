# 🌎 Terramind — Environmental Intelligence Platform

> **Plataforma fullstack de inteligencia ambiental para el Valle de Aburrá, Colombia: mapa 3D interactivo, datos en tiempo real de calidad del aire y clima, y copiloto conversacional con IA.**

**🚀 Demo en vivo:** https://terramind-mu.vercel.app

<p align="center">
  <img src="https://img.shields.io/badge/version-0.3.0-blue?style=flat-square" alt="Version" />
  <img src="https://img.shields.io/badge/license-Apache--2.0-green?style=flat-square" alt="License" />
  <img src="https://img.shields.io/badge/React-18-61DAFB?style=flat-square&logo=react&logoColor=black" alt="React" />
  <img src="https://img.shields.io/badge/TypeScript-5.4-3178C6?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/Python-3.11+-3776AB?style=flat-square&logo=python&logoColor=white" alt="Python" />
  <img src="https://img.shields.io/badge/FastAPI-009688?style=flat-square&logo=fastapi&logoColor=white" alt="FastAPI" />
  <img src="https://img.shields.io/badge/PostGIS-3.4-336791?style=flat-square&logo=postgresql&logoColor=white" alt="PostGIS" />
  <img src="https://img.shields.io/badge/tests-95_passing-brightgreen?style=flat-square" alt="Tests" />
  <img src="https://img.shields.io/badge/CI-GitHub_Actions-2088FF?style=flat-square&logo=github-actions&logoColor=white" alt="CI" />
</p>

## 📸 Capturas

![Terramind Mapa](./docs/screenshots/dashboard.png)

*Mapa 3D del Valle de Aburrá con estaciones de calidad del aire (AQI/PM2.5), capas de clima y radar, y copiloto de IA integrado.*

![Terramind Dashboard](./docs/screenshots/tab-pronostico.png)

*Dashboard analítico: pronóstico 48 horas, pronóstico semanal por municipio y tabs por tema (territorio, estaciones, clima, agua, vegetación).*

![Terramind Estaciones](./docs/screenshots/tab-estaciones.png)

*Red de estaciones SIATA por municipio con AQI y contaminantes en tiempo real.*

## ✨ ¿Qué es?

**Terramind** es una aplicación fullstack que unifica visualización geoespacial 3D, redes de sensores en tiempo real e IA conversacional en un solo panel:

- 🗺️ **Mapa 3D interactivo** (MapLibre GL + deck.gl): estaciones de calidad del aire, radar de lluvia, niveles de agua y vegetación
- 🌫️ **Datos reales**: red de monitoreo SIATA, Open-Meteo y RainViewer, con modo demo sin conexión
- 🤖 **Copiloto de IA**: preguntas en lenguaje natural sobre los datos, con enrutamiento multi-proveedor (Groq, Gemini, OpenRouter)
- 📊 **Dashboards**: AQI, PM2.5/PM10, histórico, alertas y reportes por zona

## 🛠️ Stack

| Capa | Tecnologías |
|------|--------------|
| Frontend | React 18, TypeScript, Vite, Tailwind CSS, Zustand, Recharts, MapLibre GL, deck.gl |
| Backend | Python, FastAPI, Pydantic v2, enrutamiento multi-LLM |
| Datos | PostgreSQL + PostGIS, Redis, APIs REST (SIATA, Open-Meteo, RainViewer) |
| Calidad | Vitest + Testing Library (95 tests), pytest backend (35 tests), ESLint, GitHub Actions (CI) |
| Deploy | Docker, Vercel (frontend), Railway/Fly.io (backend) |

## ⚡ Uso local (2 minutos, sin backend)

```bash
git clone https://github.com/Marusan94/Terramind.git
cd terramind/apps/web
npm install
npm run dev
# Abrir http://localhost:5173 — funciona en modo demo sin API keys
```

Con backend completo y API keys (opcionales), ver la instalación completa abajo.

<details>
<summary><strong>Instalación completa (backend + base de datos)</strong></summary>

```bash
# 1. Infraestructura (PostgreSQL + PostGIS + Redis)
docker compose up -d

# 2. Backend
cd apps/api
python -m venv .venv
.\.venv\Scripts\Activate.ps1   # Windows | source .venv/bin/activate en macOS/Linux
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
# API Docs: http://localhost:8000/docs

# 3. Variables de entorno (opcionales — sin ellas activa modo demo)
cp .env.example .env
# Conseguir keys gratuitas: Gemini (aistudio.google.com/apikey), Groq (console.groq.com/keys)
```

</details>

## 🧪 Tests

```bash
cd apps/web && npm test        # 8 tests Vitest
cd apps/api && pytest          # tests backend
```

## 🏗️ Arquitectura

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
   PostGIS + Redis     SIATA / Open-Meteo    Caché de mosaicos
   (espacial)          / RainViewer          + modo demo
```

## 📚 Documentación

| Documento | Descripción |
|-----------|-------------|
| [01_ARCHITECTURE.md](./docs/engineering/01_ARCHITECTURE.md) | Arquitectura del sistema |
| [07_API_CONTRACT.md](./docs/engineering/07_API_CONTRACT.md) | Documentación de la API REST |
| [AGENTS.md](./AGENTS.md) | Guía del sistema multi-agente |
| [CONTRIBUTING.md](./CONTRIBUTING.md) | Cómo contribuir |

## 👨‍💻 Autor

**Santiago Marulanda** — *Desarrollador de Software* — [@Marusan94](https://github.com/Marusan94)
- Licenciatura en Ciencias Naturales y Educación Ambiental — Universidad de Antioquia
- Técnico en Desarrollo de Software — Cesde
- 📧 santiago.marulandal@udea.edu.co · 📍 Medellín, Colombia

## 📜 Licencia

Apache 2.0 — ver [LICENSE](./LICENSE).

## 🙏 Fuentes de datos

**SIATA** (Área Metropolitana del Valle de Aburrá) · **Open-Meteo** · **RainViewer** · **OpenStreetMap** · **MapLibre** · **deck.gl**

## 📚 Biblioteca RAG

Normativa ambiental oficial indexada para el copiloto con citas (`data/rag_library/` — ver `MANIFEST.csv` y `README_INGESTA.md`):

- **Normas**: Decreto 1076/2015, Ley 99/1993, Ley 1333/2009, Res. 631/2015 (vertimientos), Res. 2254/2017 (aire), Res. 627/2006 (ruido), Constitución 1991, Leyes 1931/2018 y 2169/2021 (clima), NTC-ISO 14001, NDC Colombia
- **Nota**: los PDF de Res. 631/2254 de MinAmbiente son escaneados sin texto; el RAG indexa sus versiones HTML oficiales con texto. NDC 3.0 y E2050 (UNFCCC) requieren descarga manual.
- **Recarga**: el RAG en memoria se pierde al reiniciar el API — ver comandos de re-ingesta en `data/rag_library/README_INGESTA.md`.

---

<p align="center"><strong>🌎 Pregunta a los datos. • 🤖 La IA responde. • 🗺️ El mapa lo muestra.</strong><br>Hecho en Medellín, Colombia</p>
