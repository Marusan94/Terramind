# Terramind API en Hugging Face Spaces (Docker). El puerto 7860 es obligatorio.
FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=7860 \
    RAG_STORE=memory \
    RAG_OFFLINE=True \
    RAG_DEMO_SEED=True \
    RAG_AUTO_INGEST=True \
    RAG_LIBRARY_DIR=/srv/data/rag_library

WORKDIR /srv

COPY requirements.docker.txt .
RUN pip install --no-cache-dir -r requirements.docker.txt

# El repo del Space debe contener: app/ (de apps/api) + data/rag_library/
COPY app ./app
COPY data ./data

EXPOSE 7860

CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-7860}"]
