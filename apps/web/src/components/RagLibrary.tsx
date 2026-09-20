/**
 * RAG Documental Ambiental: ventana chatbot + biblioteca viva.
 *
 * Izquierda: conversacion con citas. Derecha: documentos que crecen
 * (biblioteca), subida y fuentes oficiales. Separado del chatbot del mapa:
 * aqui mandan los documentos (SIATA, normas nacionales, OMS/ODS, papers).
 */

import { useEffect, useRef, useState } from 'react';
import {
  askBackend,
  backendConfigured,
  deleteDocument,
  listDocuments,
  listSources,
  retrieveContext,
  sourceMeta,
  uploadDocument,
  BackendCitation,
  BackendDoc,
  BackendSource,
} from '../services/ragBackend';

interface RagLibraryProps {
  onClose: () => void;
}

interface ChatMsg {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  cites?: BackendCitation[];
  abstained?: boolean;
  provider?: string;
}

const SOURCE_OPTIONS = ['siata', 'gobierno', 'ods', 'oms', 'academia', 'proyecto', 'otro'];
const KIND_OPTIONS = [
  'informe_diario', 'protocolo', 'guia', 'tesis', 'paper', 'plan',
  'norma', 'presentacion', 'dataset_doc', 'otro',
];

function providerLabel(provider?: string): string | null {
  if (!provider) return null;
  if (provider === 'groq') return 'redactado por groq';
  if (provider === 'openrouter' || provider === 'ollama') return `redactado por ${provider}`;
  if (provider === 'mock') return 'demo local (sin LLM)';
  if (provider === 'extractive-fallback') return 'extractivo (LLM no disponible)';
  if (provider === 'abstain') return null;
  return `vía ${provider}`;
}

const WELCOME =
  'Soy el RAG Documental Ambiental. Preguntame sobre informes SIATA, normas ' +
  'y planes de Colombia, guias OMS, ODS o los documentos de la biblioteca. ' +
  'Con fuentes respondo citado; sin fuentes te lo digo y te encauzo. Tambien saludo.';

function Badge({ source }: { source: string }) {
  const m = sourceMeta(source);
  return (
    <span
      title={m.scope}
      style={{
        fontSize: 10,
        fontWeight: 700,
        color: m.color,
        border: `1px solid ${m.color}`,
        borderRadius: 4,
        padding: '1px 6px',
        marginRight: 6,
        whiteSpace: 'nowrap',
      }}
    >
      {m.label}
    </span>
  );
}

function CitationCard({ c }: { c: BackendCitation }) {
  return (
    <div
      style={{
        marginTop: 6,
        padding: 8,
        border: '1px solid var(--border)',
        borderRadius: 6,
        fontSize: 12,
        background: 'rgba(255,255,255,0.02)',
      }}
    >
      <div>
        <Badge source={c.source} />
        <strong>[{c.n}] {c.title}</strong>
        <span style={{ color: 'var(--text-muted)' }}>
          {' '}· {c.kind}{c.page ? ` · pag ${c.page}` : ''} · {c.section} · {c.score}
        </span>
      </div>
      <div style={{ color: 'var(--text-muted)', marginTop: 4 }}>{c.excerpt.slice(0, 320)}</div>
      {c.uri && (
        <a href={c.uri} target="_blank" rel="noreferrer" style={{ fontSize: 11 }}>
          Abrir fuente
        </a>
      )}
    </div>
  );
}

let msgId = 0;
const nextId = () => `rag-${Date.now()}-${(msgId += 1)}`;

export default function RagLibrary({ onClose }: RagLibraryProps) {
  const [msgs, setMsgs] = useState<ChatMsg[]>([{ id: 'welcome', role: 'assistant', text: WELCOME }]);
  const [input, setInput] = useState('');
  const [asking, setAsking] = useState(false);

  const [docs, setDocs] = useState<BackendDoc[]>([]);
  const [docsOrigin, setDocsOrigin] = useState<'backend' | 'local'>('local');
  const [sources, setSources] = useState<BackendSource[]>([]);
  const [showSources, setShowSources] = useState(false);

  const [file, setFile] = useState<File | null>(null);
  const [upSource, setUpSource] = useState('gobierno');
  const [upKind, setUpKind] = useState('plan');
  const [upMsg, setUpMsg] = useState('');
  const [uploading, setUploading] = useState(false);
  const [libOpen, setLibOpen] = useState(true);

  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const refresh = async () => {
    const [d, s] = await Promise.all([listDocuments(), listSources()]);
    setDocs(d.docs);
    setDocsOrigin(d.origin);
    setSources(s.sources);
  };

  useEffect(() => {
    void refresh();
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [msgs, asking]);

  const push = (m: ChatMsg) => setMsgs(prev => [...prev, m]);

  const ask = async (text?: string) => {
    const q = (text ?? input).trim();
    if (!q || asking) return;
    setInput('');
    push({ id: nextId(), role: 'user', text: q });
    setAsking(true);
    try {
      if (backendConfigured()) {
        try {
          const r = await askBackend(q, 6);
          if (r) {
            push({
              id: nextId(),
              role: 'assistant',
              text: r.answer,
              cites: r.citations,
              abstained: !r.has_source,
              provider: r.provider,
            });
            return;
          }
        } catch {
          // cae a local
        }
      }
      const { results } = await retrieveContext(q, 5);
      if (!results.length) {
        push({
          id: nextId(),
          role: 'assistant',
          text: 'Sin fuentes en la base local. Sube un documento en la biblioteca o conecta el backend.',
          abstained: true,
        });
        return;
      }
      push({
        id: nextId(),
        role: 'assistant',
        text: 'Esto dicen tus documentos (modo local, extractivo):',
        cites: results.map((r, i) => ({
          n: i + 1,
          title: r.documentName,
          source: 'local',
          kind: 'documento',
          uri: null,
          section: 'General',
          page: null,
          excerpt: r.chunk,
          score: r.score,
        })),
      });
    } finally {
      setAsking(false);
    }
  };

  const upload = async () => {
    if (!file || uploading) return;
    setUploading(true);
    setUpMsg('');
    try {
      const r = await uploadDocument(file, upSource, upKind);
      setUpMsg(`"${r.title}" indexado con ${r.chunks} fragmentos (${r.origin}). Ya puedes preguntar por el.`);
      setFile(null);
      await refresh();
    } catch (e) {
      setUpMsg(`Fallo la subida: ${e instanceof Error ? e.message : 'error'}`);
    } finally {
      setUploading(false);
    }
  };

  const remove = async (id: string, title: string) => {
    await deleteDocument(id);
    await refresh();
    push({ id: nextId(), role: 'assistant', text: `Documento retirado de la biblioteca: "${title}".` });
  };

  const bySource = docs.reduce<Record<string, number>>((acc, d) => {
    acc[d.source] = (acc[d.source] ?? 0) + 1;
    return acc;
  }, {});

  const suggestions = [
    'Que dice el informe sobre Itagui?',
    'Metas OMS de PM2.5?',
    'Por que marzo es critico?',
  ];

  return (
    <div className="dashboard-overlay" onClick={onClose}>
      <div
        className="dashboard-view"
        onClick={e => e.stopPropagation()}
        style={{ display: 'flex', flexDirection: 'column', maxHeight: '88vh' }}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <div>
            <span style={{ fontSize: 15, fontWeight: 800 }}>RAG Documental Ambiental</span>
            <span
              style={{
                fontSize: 11,
                marginLeft: 8,
                color: docsOrigin === 'backend' ? '#22c55e' : '#eab308',
                fontWeight: 700,
              }}
            >
              {docsOrigin === 'backend' ? '● backend' : '● local'} · {docs.length} docs
            </span>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn" onClick={() => setLibOpen(v => !v)} title="Mostrar/ocultar biblioteca">
              {libOpen ? 'Ocultar docs' : 'Ver docs'}
            </button>
            <button className="btn" onClick={onClose} aria-label="Cerrar RAG documental" title="Cerrar">
              ×
            </button>
          </div>
        </div>

        {/* Cuerpo: chat + biblioteca */}
        <div style={{ display: 'flex', gap: 12, minHeight: 0, flex: 1 }}>
          {/* Chat */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
            <div style={{ flex: 1, overflowY: 'auto', minHeight: 220, paddingRight: 4 }}>
              {msgs.map(m => (
                <div
                  key={m.id}
                  style={{
                    display: 'flex',
                    justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start',
                    marginBottom: 8,
                  }}
                >
                  <div
                    style={{
                      maxWidth: '92%',
                      background: m.role === 'user' ? 'rgba(139,92,246,0.18)' : 'rgba(255,255,255,0.04)',
                      border: '1px solid var(--border)',
                      borderRadius: 8,
                      padding: '8px 10px',
                      fontSize: 13,
                      whiteSpace: 'pre-wrap',
                    }}
                  >
                    {m.abstained && (!m.provider || m.provider === 'abstain') && (
                      <div style={{ color: '#eab308', fontWeight: 700, marginBottom: 4 }}>Sin fuente suficiente</div>
                    )}
                    {m.provider && providerLabel(m.provider) && (
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>
                        {providerLabel(m.provider)}
                      </div>
                    )}
                    <div>{m.text}</div>
                    {m.cites?.map(c => <CitationCard key={`${c.title}-${c.n}`} c={c} />)}
                  </div>
                </div>
              ))}
              {asking && (
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Buscando en los documentos…</div>
              )}
              <div ref={bottomRef} />
            </div>

            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '8px 0' }}>
              {suggestions.map(s => (
                <button key={s} className="btn" onClick={() => void ask(s)} style={{ fontSize: 11 }}>
                  {s}
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') void ask(); }}
                placeholder="Pregunta a los documentos…"
                style={{
                  flex: 1,
                  background: 'rgba(0,0,0,0.5)',
                  border: '1px solid var(--border)',
                  borderRadius: 6,
                  color: 'var(--text)',
                  padding: '9px 12px',
                  fontSize: 13,
                  fontFamily: 'var(--font)',
                }}
              />
              <button
                onClick={() => void ask()}
                disabled={asking || !input.trim()}
                style={{
                  background: 'var(--accent)',
                  color: 'white',
                  border: 'none',
                  borderRadius: 6,
                  padding: '9px 16px',
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: 'pointer',
                  fontFamily: 'var(--font)',
                }}
              >
                Enviar
              </button>
            </div>
          </div>

          {/* Biblioteca viva */}
          {libOpen && (
            <div
              style={{
                width: 300,
                flexShrink: 0,
                borderLeft: '1px solid var(--border)',
                paddingLeft: 12,
                overflowY: 'auto',
                minHeight: 220,
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 4 }}>
                Biblioteca ({docs.length})
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8 }}>
                {Object.entries(bySource).map(([s, n]) => (
                  <span key={s} style={{ marginRight: 8 }}>
                    <Badge source={s} />
                    {n}
                  </span>
                ))}
                {docs.length === 0 && 'Vacia: sube el primer documento abajo.'}
              </div>
              {docs.map(d => (
                <div
                  key={d.id}
                  style={{
                    fontSize: 12,
                    padding: '6px 0',
                    borderBottom: '1px solid rgba(255,255,255,0.06)',
                  }}
                >
                  <Badge source={d.source} />
                  <strong>{d.title}</strong>
                  <div style={{ color: 'var(--text-muted)', fontSize: 11 }}>
                    {d.kind} · {d.chunks} fragmentos
                  </div>
                  <button
                    className="btn"
                    style={{ fontSize: 11, marginTop: 4 }}
                    onClick={() => void remove(d.id, d.title)}
                  >
                    Retirar
                  </button>
                </div>
              ))}

              <div style={{ fontSize: 13, fontWeight: 800, margin: '12px 0 4px' }}>
                Alimentar la biblioteca
              </div>
              <input
                type="file"
                accept=".pdf,.docx,.xlsx,.csv,.txt,.md"
                onChange={e => setFile(e.target.files?.[0] ?? null)}
                style={{ fontSize: 12, maxWidth: '100%' }}
              />
              <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                <select
                  value={upSource}
                  onChange={e => setUpSource(e.target.value)}
                  style={{ flex: 1, background: 'rgba(0,0,0,0.5)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 6, padding: 6, fontSize: 12 }}
                >
                  {SOURCE_OPTIONS.map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
                <select
                  value={upKind}
                  onChange={e => setUpKind(e.target.value)}
                  style={{ flex: 1, background: 'rgba(0,0,0,0.5)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 6, padding: 6, fontSize: 12 }}
                >
                  {KIND_OPTIONS.map(k => (
                    <option key={k} value={k}>{k}</option>
                  ))}
                </select>
              </div>
              <button
                onClick={() => void upload()}
                disabled={!file || uploading}
                style={{
                  marginTop: 6,
                  width: '100%',
                  background: 'var(--accent)',
                  color: 'white',
                  border: 'none',
                  borderRadius: 6,
                  padding: '8px',
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: 'pointer',
                  fontFamily: 'var(--font)',
                }}
              >
                {uploading ? 'Indexando…' : 'Subir e indexar'}
              </button>
              {upMsg && <div style={{ fontSize: 11, marginTop: 6 }}>{upMsg}</div>}

              <button
                className="btn"
                style={{ fontSize: 11, marginTop: 12 }}
                onClick={() => setShowSources(v => !v)}
              >
                {showSources ? 'Ocultar fuentes oficiales' : `Fuentes oficiales (${sources.length})`}
              </button>
              {showSources && sources.map(s => (
                <div key={s.url} style={{ fontSize: 11, marginTop: 6 }}>
                  <Badge source={s.source} />
                  <a href={s.url} target="_blank" rel="noreferrer"><strong>{s.name}</strong></a>
                  <div style={{ color: 'var(--text-muted)' }}>{s.notes}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}