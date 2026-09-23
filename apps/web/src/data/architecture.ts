/**
 * Datos curados del diagrama Archify (docs/architecture-terramind.json).
 * Fuente original: architecture-terramind.html/png en docs/.
 */

export interface ArchComponent {
  id: string;
  type: string;
  label: string;
  sublabel: string;
}

export interface ArchBoundary {
  label: string;
  wraps: string[];
}

export interface ArchConnection {
  from: string;
  to: string;
  label: string;
}

export interface ArchCard {
  dot: string;
  title: string;
  items: string[];
}

export const ARCH_META = {
  title: 'Terramind — Environmental Intelligence Platform',
  subtitle: 'External APIs → valley.ts → Frontend → Backend → PostGIS',
} as const;

export const ARCH_COMPONENTS: ArchComponent[] = [
  { id: 'siata', type: 'external', label: 'SIATA', sublabel: 'Histórico sep-2024' },
  { id: 'openmeteo', type: 'external', label: 'Open-Meteo CAMS', sublabel: 'Aire + clima (gratis)' },
  { id: 'valley-service', type: 'frontend', label: 'valley.ts (Data Layer)', sublabel: 'Unifica SIATA + Open-Meteo + sim' },
  { id: 'web-app', type: 'frontend', label: 'Terramind Web App', sublabel: 'React 18 + TS + Vite' },
  { id: 'maplibre', type: 'frontend', label: 'MapLibre + deck.gl', sublabel: '3D terrain + buildings' },
  { id: 'copilot', type: 'frontend', label: 'AI Copilot', sublabel: 'OpenRouter streaming + RAG' },
  { id: 'omniroute', type: 'backend', label: 'OmniRoute LLM', sublabel: 'Groq → OpenRouter → DeepSeek → mock' },
  { id: 'postgis', type: 'database', label: 'PostgreSQL + PostGIS', sublabel: 'geometry(4326) + pgvector' },
];

export const ARCH_BOUNDARIES: ArchBoundary[] = [
  { label: 'External Data Sources', wraps: ['siata', 'openmeteo'] },
  { label: 'Frontend Plane (React 18 + Vite)', wraps: ['valley-service', 'web-app', 'maplibre', 'copilot'] },
  { label: 'Backend Plane (FastAPI)', wraps: ['omniroute'] },
  { label: 'Data Plane', wraps: ['postgis'] },
];

export const ARCH_CONNECTIONS: ArchConnection[] = [
  { from: 'SIATA', to: 'valley.ts', label: 'GET histórico' },
  { from: 'Open-Meteo', to: 'valley.ts', label: 'GET CAMS + weather' },
  { from: 'valley.ts', to: 'Web App', label: 'loadValleyData()' },
  { from: 'Web App', to: 'MapLibre', label: 'renders' },
  { from: 'Web App', to: 'Copilot', label: 'opens chat' },
  { from: 'Copilot', to: 'OmniRoute', label: 'POST /copilot/query (SSE)' },
  { from: 'OmniRoute', to: 'PostGIS', label: 'RAG vector search' },
];

export const ARCH_CARDS: ArchCard[] = [
  {
    dot: '#06b6d4',
    title: 'Data Honesty — siempre visible',
    items: [
      'Orden: 1) SIATA histórico  2) Open-Meteo CAMS  3) Simulado (fallback offline)',
      'Cada dato muestra fuente + calidad (VALID / MISSING / SIMULATED)',
    ],
  },
  {
    dot: '#10b981',
    title: 'Anti-alucinación (AGENTS.md §6)',
    items: [
      'Respuestas con confidence_score, sources[] con DOI/URL y GeoJSON',
      'Sin fuente → se declara explícitamente',
    ],
  },
  {
    dot: '#8b5cf6',
    title: 'OmniRoute — cascada',
    items: [
      'Proveedor configurado → otros con key → Ollama → mock local',
      'Agnóstico: Groq, OpenRouter, DeepSeek, Ollama',
    ],
  },
];
