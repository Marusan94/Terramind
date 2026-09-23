/**
 * Panel de alertas de calidad del aire — estilo DataFlow split:
 * formulario opaco + foto del Valle. Sin backend: evalúa los datos
 * en pantalla, indicando si son reales o demo.
 */
import { useEffect, useState } from 'react';
import {
  AlertConfig,
  DEFAULT_ALERTS,
  StationLike,
  evaluateAlerts,
  loadAlerts,
  maybeNotify,
  requestNotifyPermission,
  saveAlerts,
  thresholdLabel,
} from '../services/alerts';
import { clearAuth, isValidEmail, loadAuth, saveAuth, type AuthProfile } from '../services/auth';

interface Props {
  open: boolean;
  onClose: () => void;
  avgAqi: number;
  stations: StationLike[];
  source: string;
  dataDate: string;
}

const OPTIONS = [51, 101, 151];
const VALLE_PHOTO = '/valle.jpg';
const VALLE_PHOTO_FALLBACK = 'https://upload.wikimedia.org/wikipedia/commons/8/88/Panoramica_Centro_De_Medellin.jpg';

const shell: React.CSSProperties = {
  display: 'flex',
  width: 'min(880px, 94vw)',
  maxHeight: '92dvh',
  overflow: 'hidden auto',
  background: '#0f0f12',
  border: '1px solid rgba(255, 255, 255, 0.1)',
  borderRadius: 18,
  color: '#f5f5f7',
  fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', system-ui, sans-serif",
  boxShadow: '0 32px 96px rgba(0, 0, 0, 0.7)',
};

const formSide: React.CSSProperties = {
  flex: '1 1 52%',
  minWidth: 0,
  padding: '24px 24px 20px',
  background: '#0f0f12',
};

const label: React.CSSProperties = { display: 'block', fontSize: 12.5, color: '#c7c7cc', margin: '0 0 6px' };

const field: React.CSSProperties = {
  display: 'block',
  width: '100%',
  padding: '10px 12px',
  background: '#1b1b1f',
  border: '1px solid rgba(255, 255, 255, 0.12)',
  borderRadius: 9,
  color: '#f5f5f7',
  fontSize: 13.5,
  outline: 'none',
  fontFamily: 'inherit',
  marginBottom: 12,
};

const cream: React.CSSProperties = {
  width: '100%',
  padding: '11px 14px',
  background: '#f2ede3',
  border: 'none',
  borderRadius: 9,
  color: '#141414',
  fontSize: 14,
  fontWeight: 600,
  cursor: 'pointer',
  fontFamily: 'inherit',
};

export default function AlertsPanel({ open, onClose, avgAqi, stations, source, dataDate }: Props) {
  const [cfg, setCfg] = useState<AlertConfig>({ ...DEFAULT_ALERTS });
  const [perm, setPerm] = useState<string>(
    typeof Notification !== 'undefined' ? Notification.permission : 'unsupported',
  );
  const [saved, setSaved] = useState(false);
  const [profile, setProfile] = useState<AuthProfile | null>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [authMsg, setAuthMsg] = useState('');
  const [photoSrc, setPhotoSrc] = useState(VALLE_PHOTO);
  const [photoOk, setPhotoOk] = useState(true);

  useEffect(() => {
    if (open) {
      setCfg(loadAlerts());
      setSaved(false);
      const p = loadAuth();
      setProfile(p);
      setName(p?.displayName ?? '');
      setEmail(p?.email ?? '');
      setAuthMsg('');
      if (typeof Notification !== 'undefined') setPerm(Notification.permission);
    }
  }, [open ]);

  useEffect(() => {
    if (typeof Notification !== 'undefined') setPerm(Notification.permission);
  }, []);

  if (!open) return null;

  const isDemo = /simulado|demo/i.test(source);
  const hits = evaluateAlerts(stations, avgAqi, { ...cfg, enabled: true });

  const toggle = async () => {
    const next = { ...cfg, enabled: !cfg.enabled };
    if (next.enabled && next.browser) {
      const ok = await requestNotifyPermission();
      setPerm(typeof Notification !== 'undefined' ? Notification.permission : 'unsupported');
      if (!ok) {
        next.browser = false;
      } else {
        await maybeNotify(
          evaluateAlerts(stations, avgAqi, next),
          next,
        );
      }
    }
    setCfg(next);
    saveAlerts(next);
    setSaved(true);
  };

  const change = (patch: Partial<AlertConfig>) => {
    const next = { ...cfg, ...patch };
    setCfg(next);
    saveAlerts(next);
    setSaved(true);
  };

  const saveProfile = () => {
    if (!isValidEmail(email)) {
      setAuthMsg('Escribe un email válido para registrarte.');
      return;
    }
    const p = saveAuth({
      displayName: name,
      email,
      wantsAlerts: true,
      createdAt: profile?.createdAt,
    });
    setProfile(p);
    setAuthMsg(`Listo: te avisaremos en ${p.email}.`);
  };

  const clearProfile = () => {
    clearAuth();
    setProfile(null);
    setName('');
    setEmail('');
    setAuthMsg('Cuenta eliminada de este navegador.');
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div role="dialog" aria-label="Configurar alertas" onClick={e => e.stopPropagation()} style={shell} className="mac-pop auth-split">
        {/* Formulario */}
        <div style={formSide}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
            <strong style={{ fontSize: 19, letterSpacing: '-0.02em' }}>Alertas de calidad del aire</strong>
            <button
              onClick={onClose}
              aria-label="Cerrar alertas"
              className="mac-btn-ghost"
              style={{ width: 30, height: 30, borderRadius: '50%', background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)', color: '#c7c7cc', fontSize: 16, cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 }}
            >
              ×
            </button>
          </div>
          <div style={{ fontSize: 12.5, color: '#a1a1a6', marginBottom: 4 }}>
            Datos actuales: AQI {avgAqi} · Fuente: {source} ({dataDate})
          </div>
          {isDemo && <div style={{ fontSize: 12.5, color: '#ff9f0a', marginBottom: 10 }}>Estás viendo datos demo: las alertas se evalúan sobre simulación.</div>}

          <label style={{ display: 'flex', gap: 9, alignItems: 'center', fontSize: 13.5, margin: '12px 0', cursor: 'pointer' }}>
            <input type="checkbox" checked={cfg.enabled} onChange={toggle} style={{ width: 16, height: 16, accentColor: '#0a84ff' }} />
            Activar alertas {cfg.enabled ? '(activas)' : '(apagadas)'}
          </label>

          <label style={label}>Umbral ICA</label>
          <select value={cfg.threshold} onChange={e => change({ threshold: Number(e.target.value) })} className="mac-input" style={field}>
            {OPTIONS.map(o => (
              <option key={o} value={o}>{thresholdLabel(o)}</option>
            ))}
          </select>

          <label style={label}>Alcance</label>
          <select value={cfg.scope} onChange={e => change({ scope: e.target.value as AlertConfig['scope'] })} className="mac-input" style={field}>
            <option value="valle">Promedio del Valle</option>
            <option value="peor-estacion">Peor estación</option>
          </select>

          <div style={{ fontSize: 12, color: '#8e8e93', marginBottom: 4 }}>
            Notificaciones del navegador: <strong style={{ color: '#c7c7cc' }}>{perm}</strong>
            {perm !== 'granted' && perm !== 'unsupported' && ' (se piden al activar)'}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '14px 0 12px', color: '#636366', fontSize: 12 }}>
            <span style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.1)' }} />
            o
            <span style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.1)' }} />
          </div>

          {/* Registro */}
          <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: '-0.01em', marginBottom: 4 }}>
            {profile ? `Hola, ${profile.displayName || 'cuenta lista'}` : '¿Quieres recibir las alertas? Regístrate'}
          </div>
          <div style={{ fontSize: 12.5, color: '#a1a1a6', marginBottom: 10, lineHeight: 1.55 }}>
            {profile
              ? `Te avisaremos en ${profile.email} cuando se supere tu umbral.`
              : 'Te avisamos en tu email cuando el aire supere tu umbral. Sin cuenta todo sigue funcionando.'}
          </div>
          {!profile && (
            <>
              <input value={name} onChange={e => setName(e.target.value)} placeholder="Tu nombre" aria-label="Nombre" className="mac-input" style={field} />
              <input value={email} onChange={e => setEmail(e.target.value)} placeholder="tu@email.com" inputMode="email" aria-label="Email para alertas" className="mac-input" style={field} />
              <button onClick={saveProfile} className="mac-btn-primary" style={cream}>
                Crear cuenta
              </button>
            </>
          )}
          {profile && (
            <button onClick={clearProfile} className="mac-btn-ghost" title="Borra tu cuenta de este navegador" style={{ width: '100%', padding: '10px 14px', background: 'transparent', border: '1px solid rgba(255,255,255,0.14)', borderRadius: 9, color: '#c7c7cc', fontSize: 13.5, cursor: 'pointer', fontFamily: 'inherit' }}>
              Cerrar sesión
            </button>
          )}
          {authMsg && <div style={{ fontSize: 12.5, color: '#a1a1a6', marginTop: 8 }}>{authMsg}</div>}

          <div style={{ fontSize: 12.5, color: '#8e8e93', marginTop: 12 }}>
            <strong style={{ color: '#c7c7cc' }}>Estado ahora:</strong>{' '}
            {hits.length === 0
              ? 'sin superaciones del umbral.'
              : hits.map(h => `${h.label}: ${h.detail}`).join(' · ')}
          </div>

          {saved && <div style={{ fontSize: 12, color: '#636366', marginTop: 6 }}>Configuración guardada en este navegador.</div>}
        </div>

        {/* Foto del Valle */}
        <div className="auth-photo" style={{ position: 'relative', flex: '1 1 48%', background: 'linear-gradient(160deg, #1a2233 0%, #0b0e14 60%, #05070a 100%)' }}>
          {photoOk && (
            <img
              src={photoSrc}
              alt="Panorámica del Valle de Aburrá, Medellín"
              onError={() => {
                if (photoSrc === VALLE_PHOTO) setPhotoSrc(VALLE_PHOTO_FALLBACK);
                else setPhotoOk(false);
              }}
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
            />
          )}
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(0,0,0,0.2) 0%, transparent 35%, transparent 60%, rgba(0,0,0,0.6) 100%)' }} />
          <div style={{ position: 'absolute', left: 18, right: 18, bottom: 14, fontSize: 11.5, color: 'rgba(255,255,255,0.8)', textShadow: '0 1px 8px rgba(0,0,0,0.7)', lineHeight: 1.5 }}>
            Valle de Aburrá · Medellín, Colombia
            <br />
            <span style={{ opacity: 0.7 }}>Foto: DAIRO CORREA / Wikimedia Commons (CC BY-SA)</span>
          </div>
        </div>
      </div>
    </div>
  );
}
