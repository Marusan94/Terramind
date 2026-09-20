/**
 * Puente RAG documental: backend primero (mismo-origen /api/v1 via proxy,
 * o VITE_API_URL si esta definido), RAG local (rapido, sin red) como
 * respaldo automatico cuando el backend no responde.
 *
 * Usado por el panel "RAG Documental Ambiental" y por los chats.
 */
import { ragService, SearchResult, Document } from './rag';

export type RagOrigin = 'backend' | 'local';

export interface RagContextResult {
  results: SearchResult[];
  origin: RagOrigin;
}

export interface BackendDoc {
  id: string;
  title: string;
  source: string;
  kind: string;
  chunks: number;
  uri?: string | null;
}

export interface BackendSource {
  name: string;
  kind: string;
  url: string;
  source: string;
  notes: string;
}

export interface BackendCitation extends BackendHit {
  n: number;
}

interface BackendHit {
  n: number;
  title: string;
  source: string;
  kind: string;
  uri: string | null;
  section: string;
  page: number | null;
  excerpt: string;
  score: number;
}

/** Etiqueta y color por fuente documental. */
export const SOURCE_META: Record<string, { label: string; color: string; scope: string }> = {
  siata: { label: 'SIATA', color: '#38bdf8', scope: 'Municipal · Valle de Aburrá' },
  gobierno: { label: 'Gobierno', color: '#facc15', scope: 'Nacional · Colombia' },
  oms: { label: 'OMS', color: '#22c55e', scope: 'Internacional' },
  ods: { label: 'ODS-ONU', color: '#a78bfa', scope: 'Internacional' },
  academia: { label: 'Academia', color: '#fb923c', scope: 'UdeA / UNAL / papers' },
  proyecto: { label: 'Proyecto', color: '#8b5cf6', scope: 'Memoria Terramind' },
  otro: { label: 'Otro', color: '#71717a', scope: 'Varios' },
  local: { label: 'Local', color: '#71717a', scope: 'Este navegador' },
};

export function sourceMeta(source: string): { label: string; color: string; scope: string } {
  return SOURCE_META[source] ?? SOURCE_META.otro;
}

const API_URL = (
  (import.meta.env.VITE_API_URL as string | undefined) || ''
).replace(/\/$/, '');

/** Hay backend para intentar: mismo-origen (proxy /api/v1) o VITE_API_URL.
 *  Cada llamada lo intenta primero y cae a local si falla. */
export function backendConfigured(): boolean {
  return true;
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, init);
  if (!res.ok) throw new Error(`backend ${res.status}: ${path}`);
  return (await res.json()) as T;
}

function toSearchResult(h: BackendHit): SearchResult {
  const where = h.page ? `, pag ${h.page}` : '';
  return {
    chunk: h.excerpt,
    documentId: `${h.source}:${h.title}`,
    documentName: `${h.title} [${h.source}${where}]`,
    score: h.score,
    relevance: h.score >= 0.5 ? 'high' : h.score >= 0.3 ? 'medium' : 'low',
  };
}

/** Contexto documental: backend primero (mismo-origen si no hay VITE_API_URL),
 *  local si el backend no responde. */
export async function retrieveContext(query: string, topK = 3): Promise<RagContextResult> {
  try {
    const data = await api<{ hits?: BackendHit[] }>('/api/v1/rag/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, top_k: topK }),
    });
    const results = (data.hits ?? []).map(toSearchResult);
    if (results.length > 0) return { results, origin: 'backend' };
  } catch {
    // Sin backend a la mano: cae al RAG local sin romper el chat.
  }
  return { results: ragService.search(query, topK), origin: 'local' };
}

/** Pregunta con citas (backend; null si falla o no hay API). */
export async function askBackend(
  query: string,
  topK = 6,
): Promise<{ answer: string; citations: BackendCitation[]; has_source: boolean; provider: string } | null> {
  try {
    const data = await api<{
      answer: string;
      citations: BackendCitation[];
      has_source: boolean;
      provider: string;
    }>('/api/v1/rag/query', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, top_k: topK }),
    });
    return data;
  } catch {
    return null;
  }
}

/** Copiloto del mapa (backend con la llave Groq del servidor; null si falla). */
export async function askCopilot(query: string): Promise<BackendCopilot | null> {
  try {
    return await api<BackendCopilot>('/api/v1/copilot/query', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
    });
  } catch {
    return null;
  }
}

/** Respuesta del copiloto del mapa (backend). */
export interface BackendCopilot {
  summary: string;
  confidence_score: number;
  metrics: Record<string, unknown>;
  sources: { title: string; doi_or_url: string; confidence: string }[];
  suggested_actions: string[];
}

/** Documentos indexados (backend o locales). */
export async function listDocuments(): Promise<{ docs: BackendDoc[]; origin: RagOrigin }> {
  try {
    const docs = await api<BackendDoc[]>('/api/v1/rag/documents');
    return { docs, origin: 'backend' };
  } catch {
    // cae a local
  }
  const docs: BackendDoc[] = ragService.getDocuments().map((d: Document) => ({
    id: d.id,
    title: d.name,
    source: 'local',
    kind: d.type,
    chunks: d.chunks.length,
  }));
  return { docs, origin: 'local' };
}

/** Fuentes oficiales registradas en el backend (o guia local). */
export async function listSources(): Promise<{ sources: BackendSource[]; origin: RagOrigin }> {
  try {
    const data = await api<{ sources: BackendSource[] }>('/api/v1/rag/sources');
    return { sources: data.sources, origin: 'backend' };
  } catch {
    // cae a guia local
  }
  return { sources: LOCAL_SOURCES_GUIDE, origin: 'local' };
}

const LOCAL_SOURCES_GUIDE: BackendSource[] = [
  { name: 'SIATA - Informes de calidad del aire', kind: 'indice', url: 'https://siata.gov.co/Informes_Aire', source: 'siata', notes: 'Informes diarios y de campana (requiere backend para ingesta).' },
  { name: 'Area Metropolitana - Datos abiertos', kind: 'indice', url: 'https://datosabiertos.metropol.gov.co/', source: 'gobierno', notes: 'Portal de datos abiertos del Valle de Aburra.' },
  { name: 'OMS - Guias de calidad del aire 2021', kind: 'guia', url: 'https://www.who.int/publications/i/item/9789240034228', source: 'oms', notes: 'Guia global de referencia.' },
  { name: 'ONU - Objetivos de Desarrollo Sostenible', kind: 'plan', url: 'https://sdgs.un.org/goals', source: 'ods', notes: 'ODS 3 y 11 para salud y ciudades.' },
];

/** Sube un documento (backend primero, local si falla). Devuelve titulo y chunks. */
export async function uploadDocument(
  file: File,
  source: string,
  kind: string,
): Promise<{ title: string; chunks: number; origin: RagOrigin }> {
  try {
    const form = new FormData();
    form.append('file', file);
    form.append('source', source);
    form.append('kind', kind);
    const res = await fetch(`${API_URL}/api/v1/rag/documents/upload`, {
      method: 'POST',
      body: form,
    });
    if (!res.ok) throw new Error(`subida fallo: ${res.status}`);
    const data = (await res.json()) as BackendDoc;
    return { title: data.title, chunks: data.chunks, origin: 'backend' };
  } catch {
    // cae a local
  }
  const doc = await ragService.addDocument(file);
  return { title: doc.name, chunks: doc.chunks.length, origin: 'local' };
}

/** Borra un documento (backend primero, local si falla). */
export async function deleteDocument(id: string): Promise<RagOrigin> {
  try {
    const res = await fetch(`${API_URL}/api/v1/rag/documents/${id}`, { method: 'DELETE' });
    if (res.ok) return 'backend';
  } catch {
    // cae a local
  }
  ragService.removeDocument(id);
  return 'local';
}
