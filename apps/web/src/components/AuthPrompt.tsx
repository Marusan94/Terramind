/**
 * Sugerencia de registro al entrar — diseño Mac: frosted, negro mate,
 * tipografía SF, entrada con pop. Una sola vez; se puede omitir o cerrar.
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
  background: 'rgba(0, 0, 0, 0.5)',
  backdropFilter: 'blur(20px) saturate(1.4)',
  WebkitBackdropFilter: 'blur(20px) saturate(1.4)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 20,
};

const card: React.CSSProperties = {
  position: 'relative',
  width: 'min(400px, 92vw)',
  background: 'linear-gradient(180deg, #1e1e22 0%, #0e0e10 100%)',
  border: '0.5px solid rgba(255, 255, 255, 0.14)',
  borderRadius: 22,
  padding: '30px 26px 22px',
  textAlign: 'center',
  color: '#f5f5f7',
  fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', system-ui, sans-serif",
  boxShadow:
    '0 32px 96px rgba(0, 0, 0, 0.7), 0 0 0 0.5px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255, 255, 255, 0.1)',
};

const bell: React.CSSProperties = {
  width: 58,
  height: 58,
  margin: '0 auto 14px',
  borderRadius: '50%',
  background: 'linear-gradient(180deg, #5e5ce6 0%, #0a84ff 100%)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: 26,
  boxShadow: '0 8px 28px rgba(10, 132, 255, 0.45), inset 0 1px 0 rgba(255,255,255,0.35)',
};

const pill: React.CSSProperties = {
  flex: 1,
  background: 'rgba(255, 255, 255, 0.05)',
  border: '0.5px solid rgba(255, 255, 255, 0.09)',
  borderRadius: 12,
  padding: '8px 4px',
  fontSize: 10.5,
  lineHeight: 1.5,
  color: '#c7c7cc',
};

const closeBtn: React.CSSProperties = {
  position: 'absolute',
  top: 12,
  right: 12,
  width: 28,
  height: 28,
  borderRadius: '50%',
  background: 'rgba(255, 255, 255, 0.08)',
  border: 'none',
  color: '#a1a1a6',
  fontSize: 15,
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontFamily: 'inherit',
};

export default function AuthPrompt({ onRegister, onDismiss }: Props) {
  const close = (fn: () => void) => () => {
    markAuthPromptSeen();
    fn();
  };

  return (
    <div style={backdrop} onClick={close(onDismiss)}>
      <div role="dialog" aria-label="Sugerencia de registro" onClick={e => e.stopPropagation()} style={card} className="mac-pop">
        <button style={closeBtn} className="mac-btn-ghost" onClick={close(onDismiss)} aria-label="Cerrar">
          ×
        </button>
        <div style={bell}>🔔</div>
        <div style={{ fontSize: 19, fontWeight: 700, letterSpacing: '-0.02em', marginBottom: 8 }}>
          ¿Quieres recibir notificaciones y alertas?
        </div>
        <div style={{ fontSize: 13.5, lineHeight: 1.6, color: '#a1a1a6', marginBottom: 16 }}>
          Regístrate con tu email y te avisamos cuando el aire supere tu umbral.
        </div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
          <div style={pill}>🎚️<br />Tu umbral</div>
          <div style={pill}>📍<br />Tu comuna</div>
          <div style={pill}>📧<br />Tu email</div>
        </div>
        <button className="mac-btn-primary" onClick={close(onRegister)} style={{
          width: '100%', padding: '12px 16px', background: '#f5f5f7', border: 'none',
          borderRadius: 12, color: '#0d0d0f', fontSize: 15, fontWeight: 600, cursor: 'pointer',
          fontFamily: 'inherit',
        }}>
          Registrarme
        </button>
        <button className="mac-btn-ghost" onClick={close(onDismiss)} style={{
          width: '100%', marginTop: 4, padding: '10px 16px', background: 'transparent',
          border: 'none', borderRadius: 12, color: '#8e8e93', fontSize: 13.5, cursor: 'pointer',
          fontFamily: 'inherit',
        }}>
          Omitir por ahora
        </button>
        <div style={{ fontSize: 11, color: '#636366', marginTop: 10 }}>
          Sin cuenta todo sigue funcionando · Registro desde 🔔 Configurar Alertas
        </div>
      </div>
    </div>
  );
}
