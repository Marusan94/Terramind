"""RAG backend de Terramind: ingestion, pgvector store y retrieval con citas."""
from app.rag.chunking import Chunk, chunk_text
from app.rag.embeddings import Embedder, HashEmbedder, get_embedder

__all__ = ['Chunk', 'chunk_text', 'Embedder', 'HashEmbedder', 'get_embedder']