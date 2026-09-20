/**
 * Niveles de quebradas y río en vivo — Geoportal SIATA (sin llave).
 *
 * Endpoints públicos (descubiertos en el bundle del Geoportal):
 *   GET /fastgeoapi/geodata/geodataJson/2/niveles        -> GeoJSON, todas las estaciones
 *   GET /fastgeoapi/geodata/geographJson/3/nivel/<cod>   -> detalle: nivel (m),
 *      umbrales oficiales (seguro/precaución/inundación), serie 72h
 *
 * En dev se sirve por el proxy de Vite (/api/geoportal) para evitar CORS.
 * Sin red o sin estaciones: lanza error y quien llama muestra vacío honesto.
 */

export interface HydroGauge {
  id: string; // hq-<codigo>
  codigo: number;
  name: string; // sitio ("Parque 3 Aguas")
  river: string; // cauce ("Río Medellín")
  municipality: string;
  lat: number;
  lon: number;
  level: number; // m, del detalle oficial
  precaution: number | null; // m, umbral oficial
  trend: 'up' | 'down' | 'stable';
  alert: boolean; // nivel >= precaución oficial
  updatedAt: string; // fechaUltimoDato SIATA
}

export interface HydroResult {
  gauges: HydroGauge[];
  updatedAt: number; // epoch ms del dato más reciente
}

const GEO_BASE =
  typeof window !== 'undefined' && window.location.port === '3000'
    ? '/api/geoportal'
    : 'https://geoportal.siata.gov.co';

// Río Medellín de sur a norte + 1 quebrada representativa (Q. La Iguana).
const FEATURED = [106, 520, 331, 238];

async function fetchJson(url: string, timeoutMs = 25000): Promise<any> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`SIATA hidro ${res.status}`);
    return (await res.json()) as any;
  } finally {
    clearTimeout(t);
  }
}

function parseName(nombre: string): { river: string; site: string } {
  const [head, ...rest] = nombre.split(' - ');
  const site = rest.join(' - ').trim() || nombre.trim();
  const h = head.trim();
  if (/^R\.\s*/i.test(h)) return { river: `Río ${h.replace(/^R\.\s*/i, '')}`, site };
  if (/^Q\.\s*/i.test(h)) return { river: `Qda. ${h.replace(/^Q\.\s*/i, '')}`, site };
  return { river: h, site };
}

function trendOf(y: unknown): 'up' | 'down' | 'stable' {
  if (!Array.isArray(y)) return 'stable';
  const vals = y.filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
  if (vals.length < 14) return 'stable';
  const diff = vals[vals.length - 1] - vals[vals.length - 13];
  if (diff > 0.01) return 'up';
  if (diff < -0.01) return 'down';
  return 'stable';
}

/** Niveles en vivo de las estaciones destacadas. Lanza si no hay datos. */
export async function loadHydroGauges(): Promise<HydroResult> {
  const col = await fetchJson(`${GEO_BASE}/fastgeoapi/geodata/geodataJson/2/niveles`);
  const feats: any[] = Array.isArray(col?.features) ? col.features : [];
  const byCode = new Map<number, any>();
  for (const f of feats) {
    const code = Number(f?.properties?.codigo);
    if (FEATURED.includes(code)) byCode.set(code, f);
  }

  const gauges: HydroGauge[] = [];
  let latest = 0;
  await Promise.all(
    FEATURED.map(async codigo => {
      const f = byCode.get(codigo);
      if (!f) return;
      const det = await fetchJson(
        `${GEO_BASE}/fastgeoapi/geodata/geographJson/3/nivel/${codigo}`,
      ).catch(() => null);
      const info = det?.info;
      if (!info || typeof info.nivelActual !== 'number') return;
      const coords = f.geometry?.coordinates;
      const lon = Number(coords?.[0]);
      const lat = Number(coords?.[1]);
      if (!Number.isFinite(lon) || !Number.isFinite(lat)) return;
      const { river, site } = parseName(String(f.properties?.nombreEstacion ?? ''));
      const precaution =
        typeof info.nivelPrecaucion === 'number' ? info.nivelPrecaucion : null;
      gauges.push({
        id: `hq-${codigo}`,
        codigo,
        name: site || String(f.properties?.nombreEstacion ?? `Estación ${codigo}`),
        river,
        municipality: String(f.properties?.municipio ?? ''),
        lat,
        lon,
        level: info.nivelActual,
        precaution,
        trend: trendOf(info?.nivelUltimosDatos?.y),
        alert: precaution !== null ? info.nivelActual >= precaution : false,
        updatedAt: String(info.fechaUltimoDato ?? ''),
      });
      const t = Date.parse(info.fechaUltimoDato ?? '');
      if (Number.isFinite(t)) latest = Math.max(latest, t);
    }),
  );
  if (!gauges.length) throw new Error('SIATA hidro sin medidores');
  gauges.sort((a, b) => a.codigo - b.codigo);
  return { gauges, updatedAt: latest || Date.now() };
}
