/**
 * Panel de alertas de calidad del aire (umbral ICA + notificaciones).
 * Sin backend: evalua los datos en pantalla, indicando si son reales o demo.
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

export default function AlertsPanel({ open, onClose, avgAqi, stations, source, dataDate }: Props) {
  const [cfg, setCfg] = useState<AlertConfig>({ ...DEFAULT_ALERTS });
  const [perm, setPerm] = useState<string>(
    typeof Notification !== 'undefined' ? Notification.permission : 'unsupported',
  );
  const [saved, setSaved] = useState(false);
  // Cuenta opcional: solo personaliza las alertas, no bloquea nada.
  const [profile, setProfile] = useState<AuthProfile | null>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [authMsg, setAuthMsg] = useState('');

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

  const saveProfile = () => {
    if (!isValidEmail(email)) {
      setAuthMsg('Escribe un email válido para guardar tu cuenta.');
      return;
    }
    const p = saveAuth({
      displayName: name,
      email,
      wantsAlerts: true,
      createdAt: profile?.createdAt,
    });
    setProfile(p);
    setAuthMsg(`✓ Cuenta guardada: avisaremos a ${p.email}.`);
  };

  const clearProfile = () => {
    clearAuth();
    setProfile(null);
    setName('');
    setEmail('');
    setAuthMsg('Cuenta eliminada de este navegador.');
  };

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

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        role="dialog"
        aria-label="Configurar alertas"
        onClick={e => e.stopPropagation()}
        style={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 12, padding: 20, width: 'min(440px, 92vw)', color: 'var(--text)' }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <strong>🔔 Alertas de calidad del aire</strong>
          <button className="btn icon" onClick={onClose} aria-label="Cerrar alertas">×</button>
        </div>

        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
          Datos actuales: AQI {avgAqi} · Fuente: {source} ({dataDate})
          {isDemo && <div style={{ color: '#facc15' }}>⚠ Estás viendo datos demo: las alertas se evalúan sobre simulación.</div>}
        </div>

        <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, marginBottom: 10 }}>
          <input type="checkbox" checked={cfg.enabled} onChange={toggle} />
          Activar alertas {cfg.enabled ? '(activas)' : '(apagadas)'}
        </label>

        <label style={{ display: 'block', fontSize: 13, marginBottom: 10 }}>
          Umbral ICA
          <select
            value={cfg.threshold}
            onChange={e => change({ threshold: Number(e.target.value) })}
            style={{ display: 'block', width: '100%', marginTop: 4 }}
          >
            {OPTIONS.map(o => (
              <option key={o} value={o}>{thresholdLabel(o)}</option>
            ))}
          </select>
        </label>

        <label style={{ display: 'block', fontSize: 13, marginBottom: 10 }}>
          Alcance
          <select
            value={cfg.scope}
            onChange={e => change({ scope: e.target.value as AlertConfig['scope'] })}
            style={{ display: 'block', width: '100%', marginTop: 4 }}
          >
            <option value="valle">Promedio del Valle</option>
            <option value="peor-estacion">Peor estación</option>
          </select>
        </label>

        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>
          Notificaciones del navegador: <strong>{perm}</strong>
          {perm !== 'granted' && perm !== 'unsupported' && ' (se piden al activar)'}
        </div>

        <div className="mac-pop" style={{ background: 'linear-gradient(180deg, #1e1e22 0%, #0e0e10 100%)', border: '0.5px solid rgba(255,255,255,0.14)', borderRadius: 16, marginTop: 12, padding: 16, marginBottom: 4, boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.1)', fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', system-ui, sans-serif" }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <div style={{ width: 34, height: 34, borderRadius: '50%', background: 'linear-gradient(180deg, #5e5ce6 0%, #0a84ff 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, boxShadow: '0 4px 14px rgba(10,132,255,0.4), inset 0 1px 0 rgba(255,255,255,0.35)', flexShrink: 0 }}>
              {profile ? (profile.displayName || profile.email).charAt(0).toUpperCase() : '👤'}
            </div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#f5f5f7', letterSpacing: '-0.01em' }}>
                {profile ? (profile.displayName || 'Cuenta registrada') : 'Cuenta (opcional)'}
              </div>
              <div style={{ fontSize: 11.5, color: '#8e8e93' }}>
                {profile ? profile.email : 'Recibe las alertas en tu email'}
              </div>
            </div>
          </div>
          {!profile && (
            <div style={{ fontSize: 12, lineHeight: 1.6, color: '#a1a1a6', margin: '2px 0 10px' }}>
              Sin cuenta todo sigue funcionando.
            </div>
          )}
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Tu nombre"
            aria-label="Nombre"
            className="mac-input"
            style={{ display: profile ? 'none' : 'block', width: '100%', marginBottom: 8, padding: '10px 12px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, color: '#f5f5f7', fontSize: 13, outline: 'none', fontFamily: 'inherit' }}
          />
          <input
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="tu@email.com"
            inputMode="email"
            aria-label="Email para alertas"
            className="mac-input"
            style={{ display: profile ? 'none' : 'block', width: '100%', marginBottom: 10, padding: '10px 12px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, color: '#f5f5f7', fontSize: 13, outline: 'none', fontFamily: 'inherit' }}
          />
          <div style={{ display: 'flex', gap: 8 }}>
            {!profile && (
              <button onClick={saveProfile} className="mac-btn-primary" style={{ flex: 1, padding: '10px 14px', background: '#f5f5f7', border: 'none', borderRadius: 10, color: '#0d0d0f', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                💾 Guardar cuenta
              </button>
            )}
            {profile && (
              <button onClick={clearProfile} className="mac-btn-ghost" title="Borra tu cuenta de este navegador" style={{ flex: 1, padding: '10px 14px', background: 'transparent', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, color: '#a1a1a6', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
                🗑 Cerrar sesión
              </button>
            )}
          </div>
          {authMsg && <div style={{ fontSize: 12, color: '#a1a1a6', marginTop: 8 }}>{authMsg}</div>}
        </div>

        <div style={{ fontSize: 13, marginTop: 8 }}>
          <strong>Estado ahora:</strong>{' '}
          {hits.length === 0
            ? 'sin superaciones del umbral.'
            : hits.map(h => `${h.label}: ${h.detail}`).join(' · ')}
        </div>

        {saved && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>✓ Configuración guardada en este navegador.</div>}
      </div>
    </div>
  );
}
