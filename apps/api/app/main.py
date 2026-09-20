from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.api.v1.endpoints import health, spatial, copilot, rag

app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    description="Backend API and multi-agent coordination server for TerraMind Environmental Intelligence.",
    openapi_url=f"{settings.API_V1_STR}/openapi.json",
    docs_url="/docs",
    redoc_url="/redoc"
)

# Cross-Origin Resource Sharing
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register API v1 Routers
app.include_router(health.router, prefix=settings.API_V1_STR)
app.include_router(spatial.router, prefix=f"{settings.API_V1_STR}/spatial")
app.include_router(copilot.router, prefix=f"{settings.API_V1_STR}/copilot")
app.include_router(rag.router, prefix=f"{settings.API_V1_STR}/rag")


@app.on_event("startup")
async def _startup_rag() -> None:
    """Configura el RAG segun RAG_STORE: memory (demo local) o pgvector (prod)."""
    try:
        from app.rag.embeddings import get_embedder
        from app.rag.memory import MemoryRagStore
        from app.rag.seed import seed_demo_docs

        embedder = get_embedder()
        if settings.RAG_STORE.strip().lower() == 'memory':
            store = MemoryRagStore(embedder)
            rag.configure_rag(store, embedder)
            if settings.RAG_DEMO_SEED:
                docs = await seed_demo_docs(store, embedder)
                print(f'[rag] memoria lista: {len(docs)} docs demo')
            if settings.RAG_LIBRARY_DIR:
                from app.rag.library import ingest_library_dir

                summary = await ingest_library_dir(store, embedder, settings.RAG_LIBRARY_DIR)
                print(f"[rag] biblioteca: ok={summary['ok']} docs={summary['docs']} fail={summary['fail']}")
            if settings.RAG_AUTO_INGEST:
                from app.rag.ingest import ingest_siata_daily, start_scheduler
                start_scheduler(lambda: store, lambda: embedder, on_result=rag.record_ingest)
                result = await ingest_siata_daily(store, embedder)
                rag.record_ingest(result)
                print('[rag] startup ingest:', result.get('status'))
            return
        if not settings.RAG_AUTO_INGEST:
            return
        from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
        from app.rag.ingest import ingest_siata_daily, start_scheduler
        from app.rag.models import init_rag_db
        from app.rag.store import RagStore

        engine = create_async_engine(settings.DATABASE_URL)
        await init_rag_db(engine)
        sessions = async_sessionmaker(engine, expire_on_commit=False)
        store = RagStore(sessions, embedder)
        rag.configure_rag(store, embedder)
        start_scheduler(
            lambda: RagStore(sessions, embedder), lambda: embedder,
            on_result=rag.record_ingest,
        )
        result = await ingest_siata_daily(store, embedder)
        rag.record_ingest(result)
        print('[rag] startup ingest:', result.get('status'))
    except Exception as exc:
        print(f'[rag] startup degradado (sigue sin RAG): {exc}')
@app.get("/")
def root():
    return {
        "message": "Welcome to TerraMind Environmental Intelligence API",
        "docs": "/docs",
        "health": f"{settings.API_V1_STR}/health"
    }