/**
 * Resumen curado del grafo Graphify (graphify-out/GRAPH_REPORT.md).
 * Se muestra inline para no inflar el bundle: el interactivo completo
 * (graph.html, 735 KB) se abre aparte cuando se copia a public/.
 * Regenerar a mano si cambia el reporte: 861 nodos · 1570 edges · 64 comunidades.
 */

export const GRAPH_STATS = {
  nodes: 861,
  edges: 1570,
  communities: 64,
  commit: 'dc3260d8',
  tokenCost: '2.745 in / 715 out',
} as const;

export interface GodNode {
  name: string;
  edges: number;
  where: string;
}

export const GOD_NODES: GodNode[] = [
  { name: 'ingest_bytes()', edges: 19, where: 'apps/api/app/rag/ingest.py' },
  { name: 'RAGService', edges: 18, where: 'capa RAG (store + memoria)' },
  { name: 'IntelligenceTab()', edges: 18, where: 'apps/web/src/components' },
  { name: 'loadValleyData()', edges: 17, where: 'apps/web/src/services/valley.ts' },
  { name: 'extract_text()', edges: 16, where: 'apps/api/app/rag/parsers.py' },
  { name: 'App()', edges: 15, where: 'apps/web/src/App.tsx' },
  { name: 'RagStore', edges: 14, where: 'apps/api/app/rag/store.py' },
  { name: 'ChatWidget()', edges: 14, where: 'apps/web/src/components/ChatWidget.tsx' },
];

export const COMMUNITIES: string[] = [
  'RAG Memory Store',
  'Map Visualization Components',
  'Environmental Data Fetching',
  'Text Chunking and Embeddings',
  'Air Quality Dashboard',
  'RAG Library UI',
  'RAG API Endpoints',
  'Chat Widget UI',
  'LLM Provider Router',
  'Alerts Management System',
  'Copilot Query Logic',
  'Data Ingestion Pipeline',
  'Spatial Data Models',
  'Fire Detection Data',
];

export const GRAPH_QUESTIONS: string[] = [
  '¿Cómo fluye la data de sensores a mapas?',
  '¿Qué usa RagStore y qué tests lo cubren?',
  '¿Cómo funciona el chat copilot con el mapa?',
  '¿Cómo añadir un nuevo proveedor LLM?',
];

export const GRAPH_COMMANDS: string[] = [
  'graphify query "tu pregunta"',
  'graphify path "Origen" "Destino" --undirected',
  'graphify explain "node_id_exacta"',
  'graphify update .   (tras cambios, sin costo)',
];
