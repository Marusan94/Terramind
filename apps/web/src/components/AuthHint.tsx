/**
 * Aviso pequeño al entrar: solo el mensaje + Regístrate.
 * Al tocarlo abre el auth completo; al cerrarlo no vuelve a salir.
 */
import { markAuthPromptSeen } from '../services/auth';

interface Props {
  onRegister: () => void;
  onDismiss: () => void;
}

export default function AuthHint({ onRegister, onDismiss }: Props) {
  const dismiss = () => {
    markAuthPromptSeen();
    onDismiss();
  };

  return (
    <div
      role="status"
      aria-label="Aviso de alertas"
      className="mac-pop"
      style={{
        position: 'fixed',
        left: '50%',
        transform: 'translateX(-50%)',
        bottom: 'calc(20px + env(safe-area-inset-bottom, 0px))',
        zIndex: 940,
        width: 'min(430px, calc(100vw - 24px))',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        background: '#0f0f12',
        border: '1px solid rgba(255, 255, 255, 0.12)',
        borderRadius: 14,
        padding: '11px 12px 11px 14px',
        color: '#f5f5f7',
        fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', system-ui, sans-serif",
        boxShadow: '0 16px 48px rgba(0, 0, 0, 0.6), inset 0 1px 0 rgba(255, 255, 255, 0.07)',
      }}
    >
      <div style={{
        width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
        background: 'linear-gradient(180deg, #5e5ce6 0%, #0a84ff 100%)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15,
        boxShadow: '0 4px 14px rgba(10,132,255,0.4)',
      }}>
        🔔
      </div>
      <div style={{ flex: 1, minWidth: 0, fontSize: 12.5, lineHeight: 1.45 }}>
        ¿Quieres recibir alertas de Terramind a tu correo?{' '}
        <button
          onClick={onRegister}
          style={{
            background: 'none', border: 'none', padding: 0, cursor: 'pointer',
            color: '#f2ede3', fontSize: 12.5, fontWeight: 700, fontFamily: 'inherit',
            textDecoration: 'underline', textUnderlineOffset: 2,
          }}
        >
          Regístrate
        </button>
      </div>
      <button
        onClick={dismiss}
        aria-label="Descartar aviso"
        className="mac-btn-ghost"
        style={{
          width: 26, height: 26, borderRadius: '50%', flexShrink: 0,
          background: 'rgba(255,255,255,0.07)', border: 'none',
          color: '#a1a1a6', fontSize: 14, cursor: 'pointer', fontFamily: 'inherit',
        }}
      >
        ×
      </button>
    </div>
  );
}
