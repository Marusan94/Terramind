import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

interface BoundaryState {
  error: string | null;
}

/**
 * Red de seguridad: sin esto, cualquier error (WebGL ausente en un móvil
 * viejo, localStorage bloqueado, bundle a medias) deja la pantalla en
 * blanco sin explicación. Muestra reintento + limpieza del Service Worker.
 */
class RootErrorBoundary extends React.Component<React.PropsWithChildren, BoundaryState> {
  state: BoundaryState = { error: null };

  static getDerivedStateFromError(e: unknown): BoundaryState {
    return { error: e instanceof Error ? e.message : 'Error desconocido' };
  }

  private readonly reset = () => {
    // Limpia SW + cachés viejas (causa típica de blanco tras deploy) y recarga.
    try {
      if ('serviceWorker' in navigator) {
        void navigator.serviceWorker.getRegistrations().then((regs) => {
          regs.forEach((r) => void r.unregister());
        });
      }
      if ('caches' in window) {
        void caches.keys().then((keys) => keys.forEach((k) => void caches.delete(k)));
      }
    } finally {
      window.location.reload();
    }
  };

  render() {
    if (this.state.error) {
      return (
        <div
          style={{
            minHeight: '100dvh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#0a0a0a',
            color: '#e0e0e0',
            padding: 24,
            fontFamily: 'system-ui, sans-serif',
          }}
        >
          <div style={{ maxWidth: 420, textAlign: 'center' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>🌫️</div>
            <h1 style={{ fontSize: 18, marginBottom: 8 }}>Terramind no pudo iniciar</h1>
            <p style={{ fontSize: 13, color: '#888', marginBottom: 16 }}>
              {this.state.error} — suele deberse a caché vieja o a un navegador sin WebGL.
            </p>
            <button
              onClick={this.reset}
              style={{
                padding: '10px 20px',
                background: '#8b5cf6',
                border: 'none',
                borderRadius: 6,
                color: 'white',
                fontSize: 14,
                cursor: 'pointer',
              }}
            >
              ↻ Limpiar caché y reintentar
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <RootErrorBoundary>
      <App />
    </RootErrorBoundary>
  </React.StrictMode>,
)
