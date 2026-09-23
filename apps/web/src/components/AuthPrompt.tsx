/**
 * Acceso a Terramind — tarjeta split opaca estilo DataFlow:
 * izquierda formulario sólido, derecha foto del Valle de Aburrá.
 * Aparece una sola vez al entrar; se puede omitir o cerrar.
 */
import { useState } from 'react';
import { isValidEmail, loadAuth, markAuthPromptSeen, saveAuth } from '../services/auth';

interface Props {
  onRegister: () => void;
  onDismiss: () => void;
}

const overlay: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 960,
  background: 'rgba(0, 0, 0, 0.62)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 16,
};

const card: React.CSSProperties = {
  position: 'relative',
  width: 'min(860px, 94vw)',
  maxHeight: '92dvh',
  overflow: 'hidden auto',
  display: 'flex',
  background: '#0f0f12',
  border: '1px solid rgba(255, 255, 255, 0.1)',
  borderRadius: 18,
  color: '#f5f5f7',
  fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', system-ui, sans-serif",
  boxShadow: '0 32px 96px rgba(0, 0, 0, 0.7)',
};

const formSide: React.CSSProperties = {
  flex: '1 1 46%',
  minWidth: 0,
  padding: '30px 30px 24px',
  background: '#0f0f12',
};

const photoSide: React.CSSProperties = {
  position: 'relative',
  flex: '1 1 54%',
  background: 'linear-gradient(160deg, #1a2233 0%, #0b0e14 60%, #05070a 100%)',
};

const label: React.CSSProperties = {
  display: 'block',
  fontSize: 12.5,
  color: '#c7c7cc',
  margin: '0 0 6px',
};

const input: React.CSSProperties = {
  display: 'block',
  width: '100%',
  padding: '11px 13px',
  background: '#1b1b1f',
  border: '1px solid rgba(255, 255, 255, 0.12)',
  borderRadius: 9,
  color: '#f5f5f7',
  fontSize: 14,
  outline: 'none',
  fontFamily: 'inherit',
};

const cream: React.CSSProperties = {
  width: '100%',
  padding: '12px 16px',
  background: '#f2ede3',
  border: 'none',
  borderRadius: 9,
  color: '#141414',
  fontSize: 15,
  fontWeight: 600,
  cursor: 'pointer',
  fontFamily: 'inherit',
};

export default function AuthPrompt({ onRegister, onDismiss }: Props) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [remember, setRemember] = useState(true);
  const [msg, setMsg] = useState('');
  // Foto local primero (rápida y offline); respaldo remoto; degradado si no hay red.
  const [photoSrc, setPhotoSrc] = useState('/valle.jpg');
  const [photoOk, setPhotoOk] = useState(true);

  const close = (fn: () => void) => () => {
    markAuthPromptSeen();
    fn();
  };

  const submit = () => {
    if (!isValidEmail(email)) {
      setMsg('Escribe un email válido para crear tu cuenta.');
      return;
    }
    const prev = loadAuth();
    saveAuth({
      displayName: name,
      email,
      wantsAlerts: remember,
      createdAt: prev?.createdAt,
    });
    markAuthPromptSeen();
    onRegister();
  };

  return (
    <div style={overlay} onClick={close(onDismiss)}>
      <div role="dialog" aria-label="Registro para alertas" onClick={e => e.stopPropagation()} style={card} className="mac-pop auth-split">
        <button
          onClick={close(onDismiss)}
          aria-label="Cerrar"
          className="mac-btn-ghost"
          style={{
            position: 'absolute', top: 12, right: 12, zIndex: 2, width: 30, height: 30,
            borderRadius: '50%', background: 'rgba(0,0,0,0.45)', border: '1px solid rgba(255,255,255,0.14)',
            color: '#e5e5ea', fontSize: 16, cursor: 'pointer', fontFamily: 'inherit',
          }}
        >
          ×
        </button>

        {/* Formulario */}
        <div style={formSide}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 20 }}>
            <div style={{
              width: 30, height: 30, borderRadius: 8,
              background: 'linear-gradient(135deg, #8b5cf6, #06b6d4)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontWeight: 800, fontSize: 14, color: 'white',
            }}>
              T
            </div>
            <span style={{ fontSize: 15, fontWeight: 700, letterSpacing: '-0.01em' }}>Terramind</span>
          </div>

          <div style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-0.02em', marginBottom: 6 }}>
            ¿Quieres recibir alertas de Terramind a tu correo?
          </div>
          <div style={{ fontSize: 13.5, lineHeight: 1.55, color: '#a1a1a6', marginBottom: 20 }}>
            Regístrate y te avisamos cuando la calidad del aire supere tu umbral.
          </div>

          <label style={label} htmlFor="auth-name">Tu nombre</label>
          <input
            id="auth-name"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="¿Cómo te llamas?"
            className="mac-input"
            style={{ ...input, marginBottom: 12 }}
          />
          <label style={label} htmlFor="auth-email">Correo electrónico</label>
          <input
            id="auth-email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="tu@ejemplo.com"
            inputMode="email"
            className="mac-input"
            style={{ ...input, marginBottom: 12 }}
          />

          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: '#c7c7cc', marginBottom: 16, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={remember}
              onChange={e => setRemember(e.target.checked)}
              style={{ width: 15, height: 15, accentColor: '#0a84ff' }}
            />
            Quiero recibir las alertas
          </label>

          <button onClick={submit} className="mac-btn-primary" style={cream}>
            Regístrate
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '14px 0', color: '#636366', fontSize: 12 }}>
            <span style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.1)' }} />
            o
            <span style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.1)' }} />
          </div>

          <button
            onClick={close(onDismiss)}
            className="mac-btn-ghost"
            style={{
              width: '100%', padding: '11px 16px', background: 'transparent',
              border: '1px solid rgba(255,255,255,0.14)', borderRadius: 9,
              color: '#c7c7cc', fontSize: 14, cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            Omitir por ahora
          </button>

          {msg && <div style={{ fontSize: 12.5, color: '#ff9f0a', marginTop: 10 }}>{msg}</div>}
          <div style={{ fontSize: 11.5, color: '#636366', marginTop: 12, lineHeight: 1.6 }}>
            Sin cuenta todo sigue funcionando. Podrás registrarte después desde 🔔 Configurar Alertas.
          </div>
        </div>

        {/* Foto del Valle */}
        <div style={photoSide} className="auth-photo">
          {photoOk && (
            <img
              src={photoSrc}
              alt="Panorámica del Valle de Aburrá, Medellín"
              onError={() => {
                if (photoSrc === '/valle.jpg') {
                  setPhotoSrc('https://upload.wikimedia.org/wikipedia/commons/8/88/Panoramica_Centro_De_Medellin.jpg');
                } else setPhotoOk(false);
              }}
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
            />
          )}
          <div style={{
            position: 'absolute', inset: 0,
            background: 'linear-gradient(180deg, rgba(0,0,0,0.25) 0%, transparent 30%, transparent 55%, rgba(0,0,0,0.55) 100%)',
          }} />
          <button
            onClick={close(onDismiss)}
            style={{
              position: 'absolute', top: 18, right: 54, background: 'none', border: 'none',
              color: '#f5f5f7', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit',
              textShadow: '0 1px 8px rgba(0,0,0,0.6)', whiteSpace: 'nowrap',
            }}
          >
            Vuelve al inicio →
          </button>
          <div style={{
            position: 'absolute', left: 18, right: 18, bottom: 14,
            fontSize: 11, color: 'rgba(255,255,255,0.75)', textShadow: '0 1px 8px rgba(0,0,0,0.7)',
            lineHeight: 1.5,
          }}>
            Valle de Aburrá · Medellín, Colombia
            <br />
            <span style={{ opacity: 0.7 }}>Foto: DAIRO CORREA / Wikimedia Commons (CC BY-SA)</span>
          </div>
        </div>
      </div>
    </div>
  );
}
