/**
 * Radar de lluvia RainViewer (tiles libres, sin key).
 * https://www.rainviewer.com/api.html
 */

/** Construye el template de tiles del frame más reciente. null si no hay datos. */
export function latestRadarTileUrl(meta: unknown): string | null {
  if (typeof meta !== 'object' || meta === null) return null;
  const m = meta as { host?: unknown; radar?: { past?: unknown } };
  if (typeof m.host !== 'string' || !m.host) return null;
  const past = m.radar?.past;
  if (!Array.isArray(past) || past.length === 0) return null;
  const last = past[past.length - 1] as { path?: unknown };
  if (typeof last?.path !== 'string' || !last.path) return null;
  return `${m.host}${last.path}/256/{z}/{x}/{y}/2/1_1.png`;
}
