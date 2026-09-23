/**
 * Vistas de sistema: los diagramas REALES embebidos por iframe.
 * - /system/graph.html → interactivo Graphify (vis-network por CDN)
 * - /system/architecture.html → diagrama Archify autocontenido
 * Se sirven como estáticos (ver vercel.json: /system/* fuera del fallback SPA
 * y con X-Frame-Options SAMEORIGIN para permitir el iframe propio).
 */
import { useEffect, useRef, useState } from 'react';

function FrameModal({ title, src, onClose }: { title: string; src: string; onClose: () => void }) {
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [nonce, setNonce] = useState(0);
  const timer = useRef<number | null>(null);

  // Si en 12s no cargó (red lenta, CDN caído), ofrece abrir/reintentar.
  useEffect(() => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      setState(prev => (prev === 'loading' ? 'error' : prev));
    }, 12000);
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [src, nonce]);

  const retry = () => {
    setState('loading');
    setNonce(n => n + 1);
  };

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
      {state === 'loading' && (
        <div className="frame-view" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 10, color: 'var(--text-dim)', fontSize: 13 }}>
          <div className="loading-dots" style={{ display: 'flex', gap: 6 }}>
            <div className="loading-dot" />
            <div className="loading-dot" />
            <div className="loading-dot" />
          </div>
          Cargando diagrama…
        </div>
      )}
      {state === 'error' && (
        <div className="frame-view" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 10, color: 'var(--text-dim)', fontSize: 13, textAlign: 'center', padding: 24 }}>
          <div style={{ fontSize: 30 }}>⚠️</div>
          <div>No se pudo cargar el diagrama embebido (red lenta o bloqueada).</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <a href={src} target="_blank" rel="noreferrer" className="btn primary" style={{ textDecoration: 'none' }}>
              ↗ Abrir en pestaña
            </a>
            <button className="btn" onClick={retry}>
              ↻ Reintentar
            </button>
          </div>
        </div>
      )}
      <iframe
        key={nonce}
        src={src}
        title={title}
        className="frame-view"
        style={state === 'ready' ? undefined : { display: 'none' }}
        onLoad={() => setState('ready')}
      />
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
