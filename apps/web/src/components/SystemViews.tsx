/**
 * Vistas de sistema: los diagramas REALES embebidos por iframe.
 * - /system/graph.html → interactivo Graphify (vis-network por CDN)
 * - /system/architecture.html → diagrama Archify autocontenido
 * Se sirven como estáticos (ver vercel.json: /system/* fuera del fallback SPA).
 */

function FrameModal({ title, src, onClose }: { title: string; src: string; onClose: () => void }) {
  return (
    <div className="frame-overlay" onClick={onClose}>
      <div className="frame-bar" onClick={e => e.stopPropagation()}>
        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</span>
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
      <iframe src={src} title={title} className="frame-view" />
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
