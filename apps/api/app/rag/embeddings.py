"""Embeddings para el RAG: interfaz + dos implementaciones.

- HashEmbedder: determinista, sin dependencias ni red. Para tests,
  desarrollo offline y fallback honesto (se marca en metadatos).
- SentenceTransformerEmbedder: modelo multilingue real (ES/EN),
  carga perezosa para no romper imports sin torch.
"""
from __future__ import annotations

import hashlib
import math
from functools import lru_cache
from typing import Protocol


class Embedder(Protocol):
    dim: int
    name: str

    def embed(self, texts: list[str]) -> list[list[float]]:
        ...


def _l2norm(vec: list[float]) -> list[float]:
    n = math.sqrt(sum(v * v for v in vec)) or 1.0
    return [v / n for v in vec]


class HashEmbedder:
    """Proyeccion determinista token-hash, normalizada L2.

    Util para tests y modo offline. NO es semantica real: documentos
    indexados con otro embedder deben re-indexarse al cambiar.
    """

    dim = 384
    name = 'hash-384'

    def embed(self, texts: list[str]) -> list[list[float]]:
        out: list[list[float]] = []
        for text in texts:
            vec = [0.0] * self.dim
            for token in text.lower().split():
                h = hashlib.md5(token.encode('utf-8')).digest()
                for i in range(4):
                    idx = int.from_bytes(h[i * 4:(i + 1) * 4], 'big') % self.dim
                    vec[idx] += 1.0
            out.append(_l2norm(vec))
        return out


class SentenceTransformerEmbedder:
    """Embeddings multilingues reales (por defecto MiniLM multilingue)."""

    def __init__(self, model_name: str = 'paraphrase-multilingual-MiniLM-L12-v2'):
        self.model_name = model_name
        self._model = None
        self._dim = 0

    @property
    def name(self) -> str:
        return f'st:{self.model_name}'

    @property
    def dim(self) -> int:
        if self._dim:
            return self._dim
        self._ensure()
        return self._dim

    def _ensure(self):
        if self._model is None:
            try:
                from sentence_transformers import SentenceTransformer
            except ImportError as exc:
                raise RuntimeError(
                    'sentence-transformers no instalado. '
                    'pip install sentence-transformers'
                ) from exc
            self._model = SentenceTransformer(self.model_name)
            self._dim = int(self._model.get_sentence_embedding_dimension())
        return self._model

    def embed(self, texts: list[str]) -> list[list[float]]:
        model = self._ensure()
        vecs = model.encode(texts, normalize_embeddings=True, show_progress_bar=False)
        return [list(map(float, v)) for v in vecs]


@lru_cache(maxsize=4)
def _cached_st(model_name: str) -> SentenceTransformerEmbedder:
    return SentenceTransformerEmbedder(model_name)


def get_embedder() -> Embedder:
    """Embedder segun configuracion (lazy; respeta modo offline)."""
    from app.core.config import settings

    if settings.RAG_OFFLINE or settings.EMBEDDING_MODEL == 'hash':
        return HashEmbedder()
    return _cached_st(settings.EMBEDDING_MODEL)