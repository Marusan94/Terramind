"""Chunking consciente de secciones para el RAG de Terramind.

Estrategia:
  1. Detecta encabezados (markdown `#`, MAYUSCULAS sostenidas, `1.2. Titulo`).
  2. Empaqueta oraciones hasta ~target caracteres con overlap de cola.
  3. Cada chunk conserva su seccion para citas precisas.

Puro y determinista: misma entrada, mismos chunks.
"""
from __future__ import annotations

import re
from dataclasses import dataclass

DEFAULT_TARGET = 800
DEFAULT_OVERLAP = 150
MIN_CHUNK = 200

_HEADING_MD = re.compile(r'^(#{1,4})\s+(.+?)\s*$')
_HEADING_NUM = re.compile(r'^((?:\d+\.)+\s*\S.{2,80})$')
_HEADING_CAPS = re.compile(r'^([A-ZÁÉÍÓÚÑ0-9][A-ZÁÉÍÓÚÑ0-9\s\-–:;/().,]{5,90})$')
_SENT_SPLIT = re.compile(r'(?<=[.!?;:])\s+(?=[A-ZÁÉÍÓÚÑ0-9"“(])')


@dataclass
class Chunk:
    text: str
    section: str
    index: int


def _is_heading(line: str) -> str | None:
    s = line.strip()
    if not s or len(s) > 100:
        return None
    m = _HEADING_MD.match(s)
    if m:
        return m.group(2).strip()
    m = _HEADING_NUM.match(s)
    if m:
        return m.group(1).strip()
    if len(s) >= 8 and _HEADING_CAPS.match(s) and sum(c.isalpha() for c in s) >= 6:
        return s.strip().rstrip(':')
    return None


def split_sections(text: str) -> list[tuple[str, str]]:
    """Divide en (seccion, cuerpo). Sin encabezados -> seccion 'General'."""
    sections: list[tuple[str, list[str]]] = []
    current = 'General'
    buf: list[str] = []

    def flush() -> None:
        body = '\n'.join(buf).strip()
        if body:
            sections.append((current, body))

    for raw in text.splitlines():
        head = _is_heading(raw)
        if head:
            flush()
            current = head
            buf = []
        else:
            buf.append(raw)
    flush()
    if not sections and text.strip():
        return [('General', text.strip())]
    return [(title, body) for title, body in sections]


def _sentences(paragraph: str) -> list[str]:
    parts = [p.strip() for p in _SENT_SPLIT.split(paragraph) if p.strip()]
    return parts or ([paragraph.strip()] if paragraph.strip() else [])


def chunk_text(
    text: str,
    target: int = DEFAULT_TARGET,
    overlap: int = DEFAULT_OVERLAP,
    min_chunk: int | None = None,
) -> list[Chunk]:
    """Empaqueta oraciones por seccion hasta `target` caracteres.

    El overlap toma la cola del chunk anterior para no cortar ideas.
    Fragmentos < MIN_CHUNK se fusionan con el vecino de la misma seccion.
    """
    out: list[Chunk] = []
    for section, body in split_sections(text):
        sents: list[str] = []
        for para in body.split('\n'):
            sents.extend(_sentences(para))
        if not sents:
            continue
        current = ''
        for sent in sents:
            candidate = (current + ' ' + sent).strip() if current else sent
            if len(candidate) > target and current:
                out.append(Chunk(text=current.strip(), section=section, index=len(out)))
                tail = current[-overlap:] if overlap > 0 else ''
                tail = tail[tail.find(' ') + 1:] if ' ' in tail else ''
                current = (tail + ' ' + sent).strip() if tail else sent
            else:
                current = candidate
        if current.strip():
            out.append(Chunk(text=current.strip(), section=section, index=len(out)))
    # Fusiona colas demasiado cortas con el chunk anterior de igual seccion.
    fuse_at = min_chunk if min_chunk is not None else min(MIN_CHUNK, max(50, target // 4))
    merged: list[Chunk] = []
    for ch in out:
        if (
            merged
            and len(ch.text) < fuse_at
            and merged[-1].section == ch.section
        ):
            prev = merged[-1]
            merged[-1] = Chunk(
                text=(prev.text + ' ' + ch.text).strip(),
                section=prev.section,
                index=prev.index,
            )
        else:
            merged.append(Chunk(text=ch.text, section=ch.section, index=len(merged)))
    return merged