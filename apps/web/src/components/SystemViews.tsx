/**
 * Vistas de sistema: los diagramas REALES embebidos por iframe.
 * - /system/graph.html → interactivo Graphify (vis-network por CDN)
 * - /system/architecture.html → diagrama Archify autocontenido
 * Se sirven como estáticos (ver vercel.json: /system/* fuera del fallback SPA).
 */

const overlay: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 950,
  background: 'rgba(0, 0, 0, 0.8)',
  backdropFilter: 'blur(6px)',
  display: 'flex',
  flexDirection: 'column',
  padding: '12px',
};

const bar: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  marginBottom: 10,
  color: 'var(--text)',
  fontSize: 14,
  fontWeight: 600,
};

const frame: React.CSSProperties = {
  flex: 1,
  width: '100%',
  minHeight: 0,
  border: '1px solid var(--border)',
  borderRadius: 12,
  background: '#0a0a0a',
};

function FrameModal({ title, src, onClose }: { title: string; src: string; onClose: () => void }) {
  return (
    <div className="modal-overlay" style={overlay} onClick={onClose}>
      <div style={bar} onClick={e => e.stopPropagation()}>
        <span style={{ flex: 1 }}>{title}</span>
        <a
          href={src}
          target="_blank"
          rel="noreferrer"
          onClick={e => e.stopPropagation()}
          className="btn"
          style={{ textDecoration: 'none' }}
          title="Abrir en pestaña nueva"
        >
          ↗ Abrir
        </a>
        <button className="btn primary" onClick={onClose} aria-label="Cerrar">
          × Cerrar
        </button>
      </div>
      <iframe src={src} title={title} style={frame} onClick={e => e.stopPropagation()} />
    </div>
  );
}

export function GraphModal({ onClose }: { onClose: () => void }) {
  return (
    <FrameModal
      title="🧠 Grafo de conocimiento — 861 nodos · 1570 relaciones · 64 comunidades"
      src="/system/graph.html"
      onClose={onClose}
    />
  );
}

export function ArchitectureModal({ onClose }: { onClose: () => void }) {
  return (
    <FrameModal
      title="🏗 Arquitectura — External APIs → valley.ts → Frontend → Backend → PostGIS"
      src="/system/architecture.html"
      onClose={onClose}
    />
  );
}
