/**
 * Sugerencia de registro al entrar: negro mate, bordes suaves estilo Mac.
 * Se muestra una sola vez (terramind.auth.prompted.v1) y se puede omitir.
 */
import { markAuthPromptSeen } from '../services/auth';

interface Props {
  onRegister: () => void;
  onDismiss: () => void;
}

const backdrop: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 960,
  background: 'rgba(0, 0, 0, 0.55)',
  backdropFilter: 'blur(10px)',
  WebkitBackdropFilter: 'blur(10px)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 20,
};

const card: React.CSSProperties = {
  width: 'min(380px, 92vw)',
  background: '#0d0d0f',
  border: '1px solid rgba(255, 255, 255, 0.09)',
  borderRadius: 20,
  padding: '28px 24px 22px',
  textAlign: 'center',
  color: '#f5f5f7',
  fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', system-ui, sans-serif",
  boxShadow: '0 24px 80px rgba(0, 0, 0, 0.65), inset 0 1px 0 rgba(255, 255, 255, 0.06)',
};

const primary: React.CSSProperties = {
  width: '100%',
  padding: '11px 16px',
  background: '#f5f5f7',
  border: 'none',
  borderRadius: 12,
  color: '#0d0d0f',
  fontSize: 14,
  fontWeight: 600,
  cursor: 'pointer',
  fontFamily: 'inherit',
};

const ghost: React.CSSProperties = {
  width: '100%',
  marginTop: 8,
  padding: '11px 16px',
  background: 'transparent',
  border: '1px solid rgba(255, 255, 255, 0.12)',
  borderRadius: 12,
  color: '#a1a1a6',
  fontSize: 14,
  cursor: 'pointer',
  fontFamily: 'inherit',
};

export default function AuthPrompt({ onRegister, onDismiss }: Props) {
  const close = (fn: () => void) => () => {
    markAuthPromptSeen();
    fn();
  };

  return (
    <div style={backdrop} onClick={close(onDismiss)}>
      <div role="dialog" aria-label="Sugerencia de registro" onClick={e => e.stopPropagation()} style={card}>
        <div style={{ fontSize: 34, marginBottom: 10 }}>🔔</div>
        <div style={{ fontSize: 17, fontWeight: 700, letterSpacing: '-0.01em', marginBottom: 8 }}>
          ¿Quieres recibir notificaciones y alertas?
        </div>
        <div style={{ fontSize: 13, lineHeight: 1.6, color: '#a1a1a6', marginBottom: 20 }}>
          Regístrate con tu email y te avisamos cuando la calidad del aire supere tu umbral. Sin
          cuenta todo sigue funcionando.
        </div>
        <button style={primary} onClick={close(onRegister)}>
          Registrarme
        </button>
        <button style={ghost} onClick={close(onDismiss)}>
          Omitir
        </button>
      </div>
    </div>
  );
}
