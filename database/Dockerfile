# PostGIS 16 + pgvector para el RAG de Terramind.
# Build: docker compose build db   (ver docker-compose.yml)
FROM postgis/postgis:16-3.4

RUN apt-get update \
    && apt-get install -y --no-install-recommends postgresql-16-pgvector \
    && rm -rf /var/lib/apt/lists/*