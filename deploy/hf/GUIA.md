# Despliegue gratis en Hugging Face Spaces

## Space 1 — Backend (Docker)

1. Crea cuenta en **huggingface.co/join** y un token en **Settings → Access Tokens** (tipo Write).
2. Crea un Space: **New Space** → nombre `terramind-api` → SDK **Docker** → Blank → Create.
3. En tu PC:
   ```bash
   git clone https://huggingface.co/spaces/TU_USUARIO/terramind-api
   cd terramind-api
   # copia el codigo (NO el .env, NO .venv):
   cp -r C:/Users/USUARIO/Terramind/apps/api/app ./app
   cp -r C:/Users/USUARIO/Terramind/data ./data
   cp C:/Users/USUARIO/Terramind/deploy/hf/backend/Dockerfile .
   cp C:/Users/USUARIO/Terramind/deploy/hf/backend/requirements.docker.txt .
   cp C:/Users/USUARIO/Terramind/deploy/hf/backend/.dockerignore .
   cp C:/Users/USUARIO/Terramind/deploy/hf/backend/README.md .
   git add -A
   git commit -m "terramind api"
   git push
   ```
4. En el Space → **Settings → Variables and secrets**: agrega `GROQ_API_KEY`, `OPENROUTER_API_KEY`, `DEEPSEEK_API_KEY` (los valores de tu `apps/api/.env`).
5. Espera el build (10-20 min la primera vez) y verifica: `https://TU_USUARIO-terramind-api.hf.space/api/v1/health`.

## Space 2 — Frontend (Static)

1. New Space → nombre `terramind-web` → SDK **Static** → Blank.
2. Construye con la URL del backend ya viva:
   ```bash
   cd C:/Users/USUARIO/Terramind/apps/web
   $env:VITE_API_URL="https://TU_USUARIO-terramind-api.hf.space"
   npm run build
   ```
3. Sube `dist/` + un `README.md` con frontmatter `sdk: static` al Space y verifica el chat y el panel RAG.
