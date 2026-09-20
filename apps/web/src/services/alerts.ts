/**
 * Alertas de calidad del aire: el usuario define un umbral ICA y Terramind
 * avisa (notificacion del navegador) cuando el promedio del Valle o la peor
 * estacion lo supera. Configuracion en localStorage. Sin backend: funciona
 * con los datos en pantalla, reales o demo (se indica cual).
 */

export type AlertScope = 'valle' | 'peor-estacion';

export interface AlertConfig {
  enabled: boolean;
  /** Umbral ICA: 51 supera "Buena", 101 "Moderada", 151 "Dañina sensibles". */
  threshold: number;
  scope: AlertScope;
  browser: boolean;
}

export interface StationLike {
  name: string;
  district: string;
  aqi: number;
}

export interface AlertHit {
  label: string;
  aqi: number;
  detail: string;
}

const KEY = 'terramind.alerts.v1';

export const DEFAULT_ALERTS: AlertConfig = {
  enabled: false,
  threshold: 101,
  scope: 'valle',
  browser: true,
};

export function loadAlerts(): AlertConfig {
  try {
    if (typeof localStorage === 'undefined') return { ...DEFAULT_ALERTS };
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_ALERTS };
    const p = JSON.parse(raw) as Partial<AlertConfig>;
    return {
      enabled: p.enabled === true,
      threshold: typeof p.threshold === 'number' ? p.threshold : DEFAULT_ALERTS.threshold,
      scope: p.scope === 'peor-estacion' ? 'peor-estacion' : 'valle',
      browser: p.browser !== false,
    };
  } catch {
    return { ...DEFAULT_ALERTS };
  }
}

export function saveAlerts(c: AlertConfig): void {
  try {
    localStorage?.setItem(KEY, JSON.stringify(c));
  } catch {
    // almacenamiento no disponible: la config vive solo en memoria
  }
}

export function thresholdLabel(t: number): string {
  if (t <= 100) return 'Supera "Buena" (ICA > 50)';
  if (t <= 150) return 'Supera "Moderada" (ICA > 100)';
  if (t <= 200) return 'Grupos sensibles (ICA > 150)';
  return `ICA > ${t}`;
}

/** Evalua el umbral contra el promedio o la peor estacion. */
export function evaluateAlerts(
  stations: StationLike[],
  avgAqi: number,
  cfg: AlertConfig,
): AlertHit[] {
  if (!cfg.enabled) return [];
  if (cfg.scope === 'peor-estacion') {
    const worst = [...stations].sort((a, b) => b.aqi - a.aqi)[0];
    if (worst && worst.aqi >= cfg.threshold) {
      return [{
        label: `${worst.name} (${worst.district})`,
        aqi: worst.aqi,
        detail: `ICA ${worst.aqi} ≥ umbral ${cfg.threshold}`,
      }];
    }
    return [];
  }
  if (avgAqi >= cfg.threshold) {
    return [{
      label: 'Promedio Valle de Aburrá',
      aqi: avgAqi,
      detail: `ICA ${avgAqi} ≥ umbral ${cfg.threshold}`,
    }];
  }
  return [];
}

function canNotify(cfg: AlertConfig): boolean {
  return (
    cfg.enabled &&
    cfg.browser &&
    typeof Notification !== 'undefined' &&
    Notification.permission === 'granted'
  );
}

/** Pide permiso de notificaciones (llamar desde un gesto del usuario). */
export async function requestNotifyPermission(): Promise<boolean> {
  try {
    if (typeof Notification === 'undefined') return false;
    if (Notification.permission === 'granted') return true;
    return (await Notification.requestPermission()) === 'granted';
  } catch {
    return false;
  }
}

/** Emite una notificacion por hit. Devuelve cuantas se mostraron. */
export async function maybeNotify(hits: AlertHit[], cfg: AlertConfig): Promise<number> {
  if (!canNotify(cfg)) return 0;
  let n = 0;
  for (const h of hits) {
    try {
      new Notification(`⚠️ Alerta aire: ${h.label}`, { body: `${h.detail}. Abre Terramind para ver el mapa.` });
      n += 1;
    } catch {
      break;
    }
  }
  return n;
}
