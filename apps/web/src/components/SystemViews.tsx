/**
 * Vistas de sistema: exponen el grafo Graphify y el diagrama Archify
 * dentro de la app, con datos livianos inline (sin inflar el bundle).
 * El interactivo completo de Graphify (graph.html) se abre aparte.
 */
import { ARCH_BOUNDARIES, ARCH_CARDS, ARCH_COMPONENTS, ARCH_CONNECTIONS, ARCH_META } from '../data/architecture';
import { COMMUNITIES, GOD_NODES, GRAPH_COMMANDS, GRAPH_QUESTIONS, GRAPH_STATS } from '../data/systemGraph';

const shell: React.CSSProperties = {
  background: 'var(--bg-1)',
  border: '1px solid var(--border)',
  borderRadius: 12,
  padding: 20,
  width: 'min(640px, 94vw)',
  maxHeight: '88dvh',
  overflowY: 'auto',
  color: 'var(--text)',
};

const h: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  marginBottom: 12,
};

const sub: React.CSSProperties = { fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 };
const sectionTitle: React.CSSProperties = { fontSize: 13, fontWeight: 700, margin: '14px 0 6px' };
const chip: React.CSSProperties = {
  fontSize: 11,
  padding: '3px 10px',
  background: 'var(--bg-3)',
  border: '1px solid var(--border)',
  borderRadius: 999,
  color: 'var(--text-dim)',
};

function Close({ onClose }: { onClose: () => void }) {
  return (
    <button className="btn icon" onClick={onClose} aria-label="Cerrar">
      ×
    </button>
  );
}

export function GraphModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div role="dialog" aria-label="Grafo de conocimiento" onClick={e => e.stopPropagation()} style={shell}>
        <div style={h}>
          <strong>🧠 Grafo de conocimiento (Graphify)</strong>
          <Close onClose={onClose} />
        </div>
        <div style={sub}>
          Mapa de cómo se conecta el código: {GRAPH_STATS.nodes} nodos · {GRAPH_STATS.edges} relaciones ·{' '}
          {GRAPH_STATS.communities} comunidades · commit {GRAPH_STATS.commit}
        </div>

        <div style={sectionTitle}>Nodos centrales (los que más conectan)</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {GOD_NODES.slice(0, 6).map(g => (
            <div key={g.name} style={{ fontSize: 12, display: 'flex', gap: 8, alignItems: 'baseline' }}>
              <code style={{ color: 'var(--cyan)' }}>{g.name}</code>
              <span style={{ color: 'var(--text-muted)' }}>
                {g.edges} conexiones · {g.where}
              </span>
            </div>
          ))}
        </div>

        <div style={sectionTitle}>Áreas del sistema</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {COMMUNITIES.map(c => (
            <span key={c} style={chip}>
              {c}
            </span>
          ))}
        </div>

        <div style={sectionTitle}>Preguntas que responde</div>
        <ul style={{ fontSize: 12, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 4 }}>
          {GRAPH_QUESTIONS.map(q => (
            <li key={q}>{q}</li>
          ))}
        </ul>

        <details style={{ marginTop: 12, fontSize: 12 }}>
          <summary style={{ cursor: 'pointer', color: 'var(--text-dim)' }}>
            Ver interactivo completo y comandos (ahorra tokens)
          </summary>
          <div style={{ marginTop: 8, color: 'var(--text-muted)' }}>
            El grafo interactivo vive en <code>graphify-out/graph.html</code> (fuera del bundle). Para
            consultarlo sin leer código:
            {GRAPH_COMMANDS.map(c => (
              <div key={c}>
                <code style={{ color: 'var(--cyan)' }}>{c}</code>
              </div>
            ))}
          </div>
        </details>
      </div>
    </div>
  );
}

const TYPE_COLOR: Record<string, string> = {
  external: '#f59e0b',
  frontend: '#8b5cf6',
  backend: '#06b6d4',
  database: '#10b981',
};

export function ArchitectureModal({ onClose }: { onClose: () => void }) {
  const byId = new Map(ARCH_COMPONENTS.map(c => [c.id, c]));
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div role="dialog" aria-label="Arquitectura del sistema" onClick={e => e.stopPropagation()} style={shell}>
        <div style={h}>
          <strong>🏗 Arquitectura (Archify)</strong>
          <Close onClose={onClose} />
        </div>
        <div style={sub}>{ARCH_META.subtitle}</div>

        {ARCH_BOUNDARIES.map(b => (
          <div key={b.label} style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', marginBottom: 6 }}>
              {b.label}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {b.wraps.map(id => {
                const c = byId.get(id);
                if (!c) return null;
                return (
                  <span
                    key={id}
                    title={c.sublabel}
                    style={{ ...chip, borderColor: TYPE_COLOR[c.type] ?? 'var(--border)', color: 'var(--text)' }}
                  >
                    {c.label}
                  </span>
                );
              })}
            </div>
          </div>
        ))}

        <div style={sectionTitle}>Flujo de datos</div>
        <ol style={{ fontSize: 12, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 4 }}>
          {ARCH_CONNECTIONS.map(c => (
            <li key={`${c.from}-${c.to}`}>
              <strong>{c.from}</strong> → {c.to} <span style={{ color: 'var(--text-muted)' }}>({c.label})</span>
            </li>
          ))}
        </ol>

        <div style={sectionTitle}>Contratos clave</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {ARCH_CARDS.map(card => (
            <div key={card.title} style={{ background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 8, padding: 10 }}>
              <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>
                <span style={{ color: card.dot }}>●</span> {card.title}
              </div>
              <ul style={{ fontSize: 12, color: 'var(--text-dim)', paddingLeft: 18, margin: 0 }}>
                {card.items.map(i => (
                  <li key={i}>{i}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div style={{ ...sub, marginTop: 12, marginBottom: 0 }}>
          Diagrama original: <code>docs/architecture-terramind.html</code> y <code>.png</code> en el repo.
        </div>
      </div>
    </div>
  );
}
