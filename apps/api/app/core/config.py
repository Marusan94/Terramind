import os
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    PROJECT_NAME: str = "TerraMind Environmental Intelligence API"
    VERSION: str = "0.1.0"
    API_V1_STR: str = "/api/v1"
    
    # Environment
    ENVIRONMENT: str = os.getenv("ENVIRONMENT", "development")
    DEBUG: bool = os.getenv("DEBUG", "True").lower() == "true"
    
    # Database
    DATABASE_URL: str = os.getenv(
        "DATABASE_URL",
        "postgresql+asyncpg://postgres:postgres@localhost:5432/terramind"
    )
    
    # AI / Model Routing (OmniRoute)
    DEFAULT_LLM_PROVIDER: str = os.getenv("DEFAULT_LLM_PROVIDER", "openrouter")
    OPENROUTER_API_KEY: str = os.getenv("OPENROUTER_API_KEY", "")
    GROQ_API_KEY: str = os.getenv("GROQ_API_KEY", "")
    DEEPSEEK_API_KEY: str = os.getenv("DEEPSEEK_API_KEY", "")
    GROQ_MODEL: str = os.getenv("GROQ_MODEL", "openai/gpt-oss-20b")
    DEFAULT_MODEL: str = os.getenv("DEFAULT_MODEL", "deepseek/deepseek-chat")
    FAST_MODEL: str = os.getenv("FAST_MODEL", "meta-llama/llama-3-8b-instruct")
    OLLAMA_BASE_URL: str = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
    
    # RAG (pgvector + ingesta SIATA)
    EMBEDDING_MODEL: str = os.getenv("EMBEDDING_MODEL", "paraphrase-multilingual-MiniLM-L12-v2")
    EMBEDDING_DIM: int = int(os.getenv("EMBEDDING_DIM", "384"))
    RAG_OFFLINE: bool = os.getenv("RAG_OFFLINE", "False").lower() == "true"
    RAG_TOP_K: int = int(os.getenv("RAG_TOP_K", "8"))
    RAG_MIN_SCORE: float = float(os.getenv("RAG_MIN_SCORE", "0.25"))
    RAG_AUTO_INGEST: bool = os.getenv("RAG_AUTO_INGEST", "False").lower() == "true"
    RAG_STORE: str = os.getenv("RAG_STORE", "memory")
    RAG_DEMO_SEED: bool = os.getenv("RAG_DEMO_SEED", "True").lower() == "true"
    # Carpeta con MANIFEST.csv + pdf/html (data/rag_library). Si existe, se ingiere al arrancar.
    RAG_LIBRARY_DIR: str = os.getenv("RAG_LIBRARY_DIR", "")

    class Config:
        case_sensitive = True
        env_file = ".env"

settings = Settings()
