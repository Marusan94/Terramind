/**
 * Chat Widget - Floating chat like Cursor
 */

import { useState, useRef, useEffect } from 'react';
import { ragService, initializeSampleDocuments, SearchResult } from '../services/rag';
import { askCopilot, backendConfigured, retrieveContext } from '../services/ragBackend';

const OPENROUTER_KEY = (import.meta.env.VITE_OPENROUTER_API_KEY as string | undefined) || undefined;
const GEMINI_KEY = (import.meta.env.VITE_GEMINI_API_KEY as string | undefined) || undefined;
const GROQ_KEY = (import.meta.env.VITE_GROQ_API_KEY as string | undefined) || undefined;
// URLs base: el chat usa el proxy mismo-origen /api/llm/* con caída a directo.

// Cadena de proveedores: se usa el primero con key configurada que responda.
// Dentro de cada proveedor se prueban sus modelos en orden.
const GEMINI_MODELS = ['gemini-2.5-flash', 'gemini-2.0-flash'];
// Llama retirados de Groq en ago-2026; gpt-oss son sus reemplazos oficiales.
const GROQ_MODELS = ['openai/gpt-oss-20b', 'openai/gpt-oss-120b'];
const OPENROUTER_MODELS = [
  'google/gemma-4-31b-it:free',
  'liquid/lfm-2.5-2.6b:free',
  'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free',
];

type Provider = 'gemini' | 'groq' | 'openrouter';
interface Attempt { provider: Provider; model: string }

/** POST mismo-origen (proxy Vite /api/llm) con caída a URL directa.
 *  El proxy evita CORS y bloqueos de red en el celular; si no existe
 *  (Vite devuelve el index.html), se reintenta directo. */
async function postJson(
  proxyUrl: string,
  directUrl: string,
  headers: Record<string, string>,
  payload: unknown,
): Promise<Response> {
  try {
    const r = await fetch(proxyUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });
    const ct = r.headers.get('content-type') ?? '';
    if (ct.includes('json') || ct.includes('event-stream')) return r;
    // El proxy no existe: cayó al index.html → intenta directo
  } catch {
    // Sin red al propio servidor: intenta directo igual
  }
  return fetch(directUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });
}

/** Streaming estilo OpenAI (OpenRouter y Groq): líneas `data:` con delta. */
async function streamOpenAICompatible(
  proxyUrl: string,
  directUrl: string,
  headers: Record<string, string>,
  payload: unknown,
  onDelta: (full: string) => void,
): Promise<string> {
  const response = await postJson(proxyUrl, directUrl, headers, payload);
  if (response.status === 401 || response.status === 403) {
    throw new Error(`API error: ${response.status}`);
  }
  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }
  const reader = response.body?.getReader();
  if (!reader) throw new Error('No stream available');

  const decoder = new TextDecoder();
  let buffer = '';
  let full = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      const t = line.trim();
      if (!t.startsWith('data:')) continue;
      const dataPayload = t.slice(5).trim();
      if (!dataPayload || dataPayload === '[DONE]') continue;
      try {
        const json = JSON.parse(dataPayload);
        const delta: string = json.choices?.[0]?.delta?.content ?? '';
        if (delta) {
          full += delta;
          onDelta(full);
        }
      } catch {
        // Fragmento parcial: se completa en el siguiente chunk
      }
    }
  }
  if (!full) throw new Error('Empty response');
  return full;
}

/** Streaming de Gemini (streamGenerateContent con SSE). */
async function streamGemini(
  model: string,
  key: string,
  system: string,
  user: string,
  maxTokens: number,
  temperature: number,
  onDelta: (full: string) => void,
): Promise<string> {
  const proxyUrl = `/api/llm/gemini/models/${model}:streamGenerateContent?alt=sse`;
  const directUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse`;
  const payload = {
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: 'user', parts: [{ text: user }] }],
    generationConfig: { temperature, maxOutputTokens: maxTokens },
  };
  const response = await postJson(proxyUrl, directUrl, {
    'Content-Type': 'application/json',
    'x-goog-api-key': key,
  }, payload);
  if (response.status === 400 || response.status === 401 || response.status === 403) {
    throw new Error(`API error: ${response.status}`);
  }
  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }
  const reader = response.body?.getReader();
  if (!reader) throw new Error('No stream available');

  const decoder = new TextDecoder();
  let buffer = '';
  let full = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      const t = line.trim();
      if (!t.startsWith('data:')) continue;
      const dataPayload = t.slice(5).trim();
      if (!dataPayload || dataPayload === '[DONE]') continue;
      try {
        const json = JSON.parse(dataPayload);
        const parts = json.candidates?.[0]?.content?.parts ?? [];
        for (const p of parts) {
          if (typeof p?.text === 'string' && p.text) {
            full += p.text;
            onDelta(full);
          }
        }
      } catch {
        // Fragmento parcial: se completa en el siguiente chunk
      }
    }
  }
  if (!full) throw new Error('Empty response');
  return full;
}

const SYSTEM_PROMPT = `Eres **Terramind AI**, asistente de calidad del aire para Medellín.

ESTILO (siempre): español, MÁXIMO 60 palabras, frases cortas, 2-4 viñetas
si ayuda. Lenguaje simple y directo.

INTENCIÓN (importante, decide según lo que te digan):
- Saludo o charla ("hola", "cómo estás", "gracias", "quién eres"): responde
  natural y breve. NO des datos del aire salvo que los pidan. Cierra con
  una línea ofreciendo ayuda.
- Pregunta de aire/ambiente/aire libre ("¿puedo correr?", "¿cómo está el
  aire?", "pico y placa"): usa la observación y estructura en 3 partes:
  1) dato observado, 2) interpretación breve, 3) recomendación general.
- Otro tema: responde en 1-2 líneas y ofrece ayudar con calidad del aire.

PROHIBIDO dar recomendaciones médicas personalizadas; ante salud,
sugiere consultar a un profesional.`;

type GeneratorKind = 'article' | 'script' | 'dataset';

interface Generator {
  label: string;
  icon: string;
  mime: string;
  filename: () => string;
  system: string;
  hint: string;
}

const GENERATORS: Record<GeneratorKind, Generator> = {
  article: {
    label: 'Artículo',
    icon: '📄',
    mime: 'text/markdown',
    filename: () => `terramind-articulo-${Date.now()}.md`,
    hint: 'Tema del artículo sobre calidad del aire…',
    system: `Eres un redactor científico de Terramind. Genera un artículo breve y riguroso
sobre calidad del aire en el Valle de Aburrá (Medellín) a partir del tema del usuario.
Responde SOLO en Markdown con: título, resumen (2-3 líneas), 3 secciones con subtítulos,
una tabla de datos relevantes y 3 referencias formateadas. Máximo 500 palabras.`,
  },
  script: {
    label: 'Script',
    icon: '🐍',
    mime: 'text/x-python',
    filename: () => `terramind-script-${Date.now()}.py`,
    hint: 'Qué debe hacer el script Python…',
    system: `Eres un ingeniero de datos de Terramind. Genera un script Python funcional
(relacionado con calidad del aire: AQI, PM2.5, Open-Meteo, gráficas) según el pedido.
Responde SOLO con código Python, sin explicaciones fuera de comentarios del código.
Si usas librerías externas, incluye el pip install como comentario en la primera línea.`,
  },
  dataset: {
    label: 'Dataset',
    icon: '📊',
    mime: 'text/csv',
    filename: () => `terramind-dataset-${Date.now()}.csv`,
    hint: 'Describe el dataset CSV que necesitas…',
    system: `Eres un generador de datasets de Terramind. Genera datos tabulares sintéticos
pero realistas sobre calidad del aire del Valle de Aburrá según el pedido del usuario.
Responde SOLO con CSV válido: primera fila de encabezados, 20 filas de datos,
separador coma, decimales con punto. Sin texto adicional fuera del CSV.`,
  },
};

function stripCodeFences(text: string): string {
  const m = text.match(/```(?:\w+)?\n([\s\S]*?)```/);
  return m ? m[1].trim() : text.trim();
}

function downloadText(filename: string, mime: string, text: string) {
  const blob = new Blob([text], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  sources?: SearchResult[];
  error?: boolean;
  download?: { filename: string; mime: string };
  via?: string;
}

interface AirSnapshot {
  aqi: number;
  pm25: number;
  category: string;
}

function welcomeText(d?: AirSnapshot): string {
  return `👋 Hola, soy **Terramind AI**.

Datos actuales: AQI ${d?.aqi || '--'}, PM2.5 ${d?.pm25 || '--'} µg/m³

¿En qué puedo ayudarte?`;
}

interface ChatPos {
  left: number;
  top: number;
}

const CHAT_POS_KEY = 'terramind-chat-pos';
const SMALL_SCREEN_PX = 768;

/** En pantallas pequeñas el chat va anclado abajo: se ignora lo guardado. */
export function isSmallScreen(): boolean {
  return typeof window !== 'undefined' && window.innerWidth < SMALL_SCREEN_PX;
}

/** Constriñe la posición al viewport para que el widget nunca se pierda. */
export function clampChatPos(p: ChatPos, w = 380, h = 120): ChatPos {
  const vw = window.innerWidth || 1024;
  const vh = window.innerHeight || 768;
  const maxLeft = Math.max(8, vw - Math.min(w, vw - 16));
  const maxTop = Math.max(8, vh - Math.max(h, 70));
  return {
    left: Math.min(Math.max(8, Math.round(p.left)), maxLeft),
    top: Math.min(Math.max(8, Math.round(p.top)), maxTop),
  };
}

export function loadChatPos(): ChatPos | null {
  try {
    if (isSmallScreen()) return null;
    const raw = localStorage.getItem(CHAT_POS_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as Partial<ChatPos>;
    if (typeof p.left !== 'number' || typeof p.top !== 'number') return null;
    return clampChatPos({ left: p.left, top: p.top });
  } catch {
    return null;
  }
}

export default function ChatWidget({ 
  airQualityData,
}: { 
  airQualityData?: {
    aqi: number;
    pm25: number;
    category: string;
    source?: string;
    updatedAt?: number;
    stations?: number;
    live?: { aqi: number; pm25: number };
  };
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content: welcomeText(airQualityData),
    },
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [documents, setDocuments] = useState<any[]>([]);
  const [showDocs, setShowDocs] = useState(false);
  const [pendingGen, setPendingGen] = useState<GeneratorKind | null>(null);
  const [dragging, setDragging] = useState(false);
  // Posición persistente: null = anclado abajo-derecha (CSS por defecto)
  const [pos, setPos] = useState<ChatPos | null>(loadChatPos);
  const widgetRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    startX: number; startY: number; origLeft: number; origTop: number; moved: boolean;
  } | null>(null);
  const suppressToggleClick = useRef(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    initializeSampleDocuments();
    setDocuments(ragService.getDocuments());
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Cuando llegan los datos reales, actualiza el saludo (evita "AQI --")
  const snapAqi = airQualityData?.aqi ?? 0;
  const snapPm25 = airQualityData?.pm25 ?? 0;
  useEffect(() => {
    if (!snapAqi) return;
    setMessages(prev => prev.map(m =>
      m.id === 'welcome' ? { ...m, content: welcomeText({ aqi: snapAqi, pm25: snapPm25, category: '' }) } : m
    ));
  }, [snapAqi, snapPm25]);

  // Arrastre unificado: funciona con el panel abierto (header) y con el
  // botón flotante (chat minimizado). Umbral anti-click y guardado al soltar.
  useEffect(() => {
    if (!dragging) return;
    const move = (e: MouseEvent) => {
      const d = dragRef.current;
      const el = widgetRef.current;
      if (!d || !el) return;
      if (Math.abs(e.clientX - d.startX) + Math.abs(e.clientY - d.startY) > 4) d.moved = true;
      const rect = el.getBoundingClientRect();
      setPos(clampChatPos(
        { left: d.origLeft + e.clientX - d.startX, top: d.origTop + e.clientY - d.startY },
        rect.width || 380,
        rect.height || 120,
      ));
    };
    const up = () => {
      if (dragRef.current?.moved) {
        // Fue arrastre, no click: evita que el toggle abra/cierre y guarda
        suppressToggleClick.current = true;
        window.setTimeout(() => { suppressToggleClick.current = false; }, 0);
        setPos(prev => {
          if (prev) {
            try {
              localStorage.setItem(CHAT_POS_KEY, JSON.stringify(prev));
            } catch {
              // sin almacenamiento: la posición igual aplica en sesión
            }
          }
          return prev;
        });
      }
      dragRef.current = null;
      setDragging(false);
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    return () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
    };
  }, [dragging]);

  // Re-constreñir si el viewport cambia; en móvil se vuelve al anclaje
  // por defecto para que el chat nunca quede fuera de foco.
  useEffect(() => {
    const onResize = () => {
      if (isSmallScreen()) {
        setPos(null);
        return;
      }
      setPos(prev => (prev ? clampChatPos(prev) : prev));
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const beginDrag = (e: React.MouseEvent) => {
    const el = widgetRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      origLeft: pos ? pos.left : rect.left,
      origTop: pos ? pos.top : rect.top,
      moved: false,
    };
    setDragging(true);
    e.preventDefault();
  };

  const onHeaderMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('.chat-close')) return;
    beginDrag(e);
  };

  const onToggleMouseDown = (e: React.MouseEvent) => {
    beginDrag(e);
  };

  const onToggleClick = () => {
    if (suppressToggleClick.current) {
      suppressToggleClick.current = false;
      return;
    }
    // Al abrir, garantiza espacio hacia arriba: si el panel (~520px + botón)
    // quedaría cortado por el borde superior, sube el widget antes de abrir.
    if (!isOpen && pos && !isSmallScreen()) {
      const need = 520 + 90;
      const vh = window.innerHeight || 768;
      if (pos.top + need > vh) {
        const next = clampChatPos({ left: pos.left, top: Math.max(8, vh - need) }, 380, 120);
        setPos(next);
        try {
          localStorage.setItem(CHAT_POS_KEY, JSON.stringify(next));
        } catch {
          // sin almacenamiento: la posición igual aplica en sesión
        }
      }
    }
    setIsOpen(v => !v);
  };

  // El panel abre SIEMPRE hacia arriba (anclado con bottom por CSS):
  // nunca se abre hacia abajo ni queda fuera de foco.

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const gen0: GeneratorKind | null = pendingGen;
    const hasDirectKeys = Boolean(GEMINI_KEY || GROQ_KEY || OPENROUTER_KEY);
    // Sin keys directas solo el backend puede responder (y no genera formatos).
    if (!hasDirectKeys && !(backendConfigured() && !gen0)) {
      console.error('Terramind: ninguna API key configurada (VITE_GEMINI_API_KEY, VITE_GROQ_API_KEY o VITE_OPENROUTER_API_KEY).');
      setMessages(prev => [...prev, {
        id: Date.now().toString(),
        role: 'assistant',
        content: '🤖 Terramind AI temporalmente no disponible. Intenta de nuevo en unos minutos.',
        error: true,
      }]);
      return;
    }

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input.trim(),
    };
    const gen = gen0;
    setPendingGen(null);

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    const assistantId = (Date.now() + 1).toString();
    setMessages(prev => [...prev, { id: assistantId, role: 'assistant', content: '' }]);

    try {
      const { results: searchResults, origin: ragOrigin } = await retrieveContext(userMessage.content, 3);

      let ragContext = '';
      if (searchResults.length > 0) {
        ragContext = ragOrigin === 'backend' ? '\n\n**Base documental Terramind (SIATA + oficiales):**\n' : '\n\n**Documentos cargados:**\n';
        searchResults.forEach((result, i) => {
          ragContext += `${i + 1}. ${result.chunk}\n`;
        });
      }

      const d = airQualityData;
      const when = d?.updatedAt
        ? new Date(d.updatedAt).toLocaleString('es-CO', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
        : 's/d';
      const airContext = d
        ? `\n\n**Observación actual Valle de Aburrá (${d.source ?? 'SIATA'} · ${when} · ${d.stations ?? '?'} estaciones):** ` +
          `AQI ${d.aqi} (${d.category}), PM2.5 ${d.pm25} µg/m³` +
          (d.live ? `. Referencia actual CAMS: AQI ${d.live.aqi}, PM2.5 ${d.live.pm25} µg/m³` : '') +
          `\nUsa esta observación SOLO si la pregunta es sobre calidad del aire o ` +
          `actividades al aire libre. Estructura entonces: 1) dato observado, ` +
          `2) interpretación breve, 3) recomendación general. ` +
          `PROHIBIDO dar recomendaciones médicas personalizadas; ante salud, sugiere consultar a un profesional.`
        : '';

      const systemPrompt = gen
        ? `${GENERATORS[gen].system}${airContext}${ragContext}`
        : `${SYSTEM_PROMPT}${airContext}${ragContext}\n\n**Pregunta:** ${userMessage.content}`;

      // Vía 1: backend Terramind (la llave Groq vive en el servidor,
      // nada que configurar en el navegador). Solo preguntas normales:
      // los generadores necesitan su formato propio.
      if (!gen && backendConfigured()) {
        try {
          const cop = await askCopilot(`${userMessage.content}${airContext}${ragContext}`);
          if (cop && cop.summary) {
            const engine =
              typeof cop.metrics?.model_engine === 'string' ? cop.metrics.model_engine : 'backend';
            setMessages(prev => prev.map(m =>
              m.id === assistantId
                ? {
                    ...m,
                    content: cop.summary,
                    sources: searchResults.length > 0 ? searchResults : undefined,
                    via: `vía backend · ${engine}`,
                  }
                : m
            ));
            setIsLoading(false);
            return;
          }
        } catch (e) {
          console.warn('Terramind: backend no respondió, intento directo:', e);
        }
      }

      // Vía 2: proveedores directos (solo los que tienen key en el navegador).
      // Si la key de un proveedor es rechazada (400/401/403), se salta el resto
      // de sus modelos y se pasa al siguiente proveedor.
      const attempts: Attempt[] = [];
      if (GEMINI_KEY) {
        for (const model of GEMINI_MODELS) attempts.push({ provider: 'gemini', model });
      }
      if (GROQ_KEY) {
        for (const model of GROQ_MODELS) attempts.push({ provider: 'groq', model });
      }
      if (OPENROUTER_KEY) {
        for (const model of OPENROUTER_MODELS) attempts.push({ provider: 'openrouter', model });
      }

      const temperature = gen ? 0.5 : 0.7;
      const maxTokens = gen ? 2000 : 300;
      const messages = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage.content },
      ];
      const onDelta = (full: string) => {
        const snapshot = full;
        setMessages(prev => prev.map(m =>
          m.id === assistantId ? { ...m, content: snapshot } : m
        ));
      };

      let lastError: unknown = null;
      let succeeded = false;
      const skippedProviders = new Set<Provider>();
      for (const attempt of attempts) {
        if (skippedProviders.has(attempt.provider)) continue;
        // Limpia el intento parcial anterior antes de reintentar
        setMessages(prev => prev.map(m =>
          m.id === assistantId && m.content ? { ...m, content: '' } : m
        ));

        try {
          if (attempt.provider === 'gemini') {
            await streamGemini(
              attempt.model, GEMINI_KEY!, systemPrompt, userMessage.content,
              maxTokens, temperature, onDelta,
            );
          } else if (attempt.provider === 'groq') {
            await streamOpenAICompatible(
              '/api/llm/groq/chat/completions',
              'https://api.groq.com/openai/v1/chat/completions',
              {
                'Authorization': `Bearer ${GROQ_KEY}`,
                'Content-Type': 'application/json',
              },
              { model: attempt.model, messages, temperature, max_tokens: maxTokens, stream: true },
              onDelta,
            );
          } else {
            await streamOpenAICompatible(
              '/api/llm/openrouter/chat/completions',
              'https://openrouter.ai/api/v1/chat/completions',
              {
                'Authorization': `Bearer ${OPENROUTER_KEY}`,
                'Content-Type': 'application/json',
                'HTTP-Referer': window.location.origin || 'http://localhost:3000',
                'X-Title': 'Terramind',
              },
              { model: attempt.model, messages, temperature, max_tokens: maxTokens, stream: true },
              onDelta,
            );
          }
          succeeded = true;
          break;
        } catch (e) {
          lastError = e;
          console.warn(`Terramind: falló ${attempt.provider}/${attempt.model}:`, e);
          if (e instanceof Error && /API error: (400|401|403)/.test(e.message)) {
            // Key rechazada: no sirve reintentar otros modelos del mismo proveedor
            skippedProviders.add(attempt.provider);
          }
        }
      } // fin for (const attempt of attempts)

      // Vía 3 (último recurso): extractivo con los fragmentos del RAG.
      if (!succeeded && !gen && searchResults.length > 0) {
        const parts = searchResults.slice(0, 3).map((r, i) => `${r.chunk} [${i + 1}]`);
        setMessages(prev => prev.map(m =>
          m.id === assistantId
            ? {
                ...m,
                content: `Esto dicen tus documentos:\n\n${parts.join('\n\n')}`,
                sources: searchResults,
                via: 'extractivo local',
              }
            : m
        ));
        succeeded = true;
      }

      if (!succeeded) {
        throw lastError instanceof Error ? lastError : new Error('All providers failed');
      }

      setMessages(prev => prev.map(m =>
        m.id === assistantId
          ? {
              ...m,
              sources: !gen && searchResults.length > 0 ? searchResults : undefined,
              download: gen
                ? { filename: GENERATORS[gen].filename(), mime: GENERATORS[gen].mime }
                : undefined,
            }
          : m
      ));

    } catch (error) {
      console.error('Terramind: todos los proveedores de IA fallaron:', error);
      setMessages(prev => prev.map(m =>
        m.id === assistantId
          ? { ...m, content: '🤖 Terramind AI temporalmente no disponible. Intenta de nuevo en unos minutos.', error: true }
          : m
      ));
    }

    setIsLoading(false);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    for (const file of Array.from(files)) {
      try {
        const doc = await ragService.addDocument(file);
        setDocuments(ragService.getDocuments());
        
        setMessages(prev => [...prev, {
          id: (Date.now() + file.name).toString(),
          role: 'system',
          content: `✅ **${file.name}** cargado (${doc.chunks.length} secciones indexadas)`,
        }]);
      } catch (error) {
        setMessages(prev => [...prev, {
          id: (Date.now() + file.name).toString(),
          role: 'system',
          content: `❌ Error subiendo ${file.name}`,
          error: true,
        }]);
      }
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const removeDocument = (id: string) => {
    ragService.removeDocument(id);
    setDocuments(ragService.getDocuments());
  };

  return (
    <div
      className="chat-widget"
      ref={widgetRef}
      style={pos ? { left: pos.left, top: pos.top, right: 'auto', bottom: 'auto' } : undefined}
    >
      {/* Chat Panel: siempre abre hacia arriba (bottom anclado por CSS) */}
      <div className={`chat-panel ${isOpen ? '' : 'hidden'}`}>
        {/* Header */}
        <div className="chat-header" onMouseDown={onHeaderMouseDown} title="Arrastra para mover">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{
              width: 20,
              height: 20,
              background: 'linear-gradient(135deg, var(--accent), var(--cyan))',
              borderRadius: 4,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 10,
              fontWeight: 700,
              color: 'white',
            }}>
              T
            </div>
            <span className="chat-header-title">Terramind AI</span>
          </div>
          <button className="chat-close" onClick={() => setIsOpen(false)}>×</button>
        </div>

        {/* Docs Panel */}
        {showDocs && (
          <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)', background: 'var(--bg-2)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>📂 Documentos ({documents.length})</span>
              <button 
                onClick={() => setShowDocs(false)}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 12 }}
              >
                ×
              </button>
            </div>
            
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
              {documents.map(doc => (
                <div
                  key={doc.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                    padding: '4px 8px',
                    background: 'var(--bg-3)',
                    borderRadius: 4,
                    fontSize: 10,
                  }}
                >
                  <span>📄</span>
                  <span style={{ maxWidth: 60, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {doc.name}
                  </span>
                  <button
                    onClick={() => removeDocument(doc.id)}
                    style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 0, fontSize: 12 }}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.xlsx,.xls,.docx,.doc,.txt,.md"
              multiple
              onChange={handleFileUpload}
              style={{ display: 'none' }}
            />
            
            <button
              onClick={() => fileInputRef.current?.click()}
              style={{
                width: '100%',
                padding: '6px 10px',
                background: 'var(--bg-1)',
                border: '1px dashed var(--border)',
                borderRadius: 4,
                color: 'var(--text-muted)',
                fontSize: 11,
                cursor: 'pointer',
                fontFamily: 'var(--font)',
              }}
            >
              📤 Subir PDF, Excel o Word
            </button>
          </div>
        )}

        {/* Messages */}
        <div className="chat-messages">
          {messages.map(msg => (
            <div key={msg.id} className={`chat-message ${msg.role} ${msg.error ? 'error' : ''}`}>
              {msg.via && (
                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 4 }}>{msg.via}</div>
              )}
              {msg.content}
              {msg.download && msg.content && !msg.error && (
                <div style={{ marginTop: 8 }}>
                  <button
                    className="suggestion"
                    onClick={() => downloadText(
                      msg.download!.filename,
                      msg.download!.mime,
                      msg.download!.mime === 'text/markdown' ? msg.content : stripCodeFences(msg.content)
                    )}
                  >
                    ⬇ Descargar .{msg.download.filename.split('.').pop()}
                  </button>
                </div>
              )}
            </div>
          ))}

          {isLoading && messages[messages.length - 1]?.role === 'assistant' && !messages[messages.length - 1]?.content && (
            <div className="chat-message system">
              <div className="loading">
                <div className="loading-dots">
                  <div className="loading-dot" />
                  <div className="loading-dot" />
                  <div className="loading-dot" />
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Suggestions */}
        {!input && messages.length <= 2 && (
          <div className="suggestions">
            <button className="suggestion" onClick={() => setInput('¿Puedo salir a correr?')}>
              ¿Puedo salir a correr?
            </button>
            <button className="suggestion" onClick={() => setInput('¿Qué es el Pico y Placa?')}>
              Pico y Placa
            </button>
            <button className="suggestion" onClick={() => setInput('Zonas de Baja Emisión')}>
              ZBE
            </button>
          </div>
        )}

        {/* Generator toolbar */}
        <div style={{ display: 'flex', gap: 6, padding: '8px 12px 0' }}>
          {(Object.keys(GENERATORS) as GeneratorKind[]).map(k => (
            <button
              key={k}
              className="suggestion"
              onClick={() => setPendingGen(prev => (prev === k ? null : k))}
              style={pendingGen === k
                ? { background: 'var(--accent)', color: 'white', borderColor: 'var(--accent)' }
                : undefined}
              title={`Generar ${GENERATORS[k].label.toLowerCase()} descargable`}
            >
              {GENERATORS[k].icon} {GENERATORS[k].label}
            </button>
          ))}
        </div>

        {/* Input */}
        <div className="chat-input-area">
          <button
            onClick={() => setShowDocs(!showDocs)}
            style={{
              width: 40,
              height: 40,
              background: showDocs ? 'var(--accent)' : 'var(--bg-2)',
              border: '1px solid var(--border)',
              borderRadius: 6,
              color: showDocs ? 'white' : 'var(--text-dim)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 16,
            }}
            title="Adjuntar documentos"
          >
            📎
          </button>
          <textarea
            className="chat-input"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder={pendingGen ? GENERATORS[pendingGen].hint : 'Pregunta sobre aire...'}
            disabled={isLoading}
            rows={1}
          />
          <button
            className="chat-send"
            onClick={handleSend}
            disabled={isLoading || !input.trim()}
          >
            ➤
          </button>
        </div>
      </div>

      {/* Toggle Button */}
      <button
        className={`chat-toggle ${isOpen ? 'active' : ''}`}
        onClick={onToggleClick}
        onMouseDown={onToggleMouseDown}
        title={isOpen ? 'Cerrar chat (arrastra para mover)' : 'Abrir chat (arrastra para mover)'}
      >
        💬
      </button>
    </div>
  );
}
