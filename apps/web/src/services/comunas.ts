/**
 * Comunas de Medellín — polígonos OFICIALES (Alcaldía, ArcGIS REST, sin llave)
 * + temperatura real por centroide (Open-Meteo, sin llave).
 *
 * Servicio: https://www.medellin.gov.co/servidormapas/rest/services/
 *   mapas_nacionales/VC_Limite_Politico_Admtivo/MapServer/1
 * Capa "Comunas y Corregimientos" (subtipo 1 = comuna), salida GeoJSON.
 * En dev se usa el proxy de Vite (/api/medellin) para evitar CORS.
 */

export interface ComunaFeature {
  id: string;
  name: string;
  polygon: Array<Array<[number, number]>>; // anillos [lon, lat]
  centroid: { lat: number; lon: number };
}

export type AqiOrigin = 'inside' | 'nearest' | 'none';

export interface ComunaInfo extends ComunaFeature {
  temp: number | null; // °C real Open-Meteo (null sin red)
  aqi: number | null; // AQI asignado (null = nadie cerca)
  aqiOrigin: AqiOrigin;
  stationName: string | null;
  distKm: number | null;
}

export interface MiniStation {
  name: string;
  district: string;
  lat: number;
  lon: number;
  aqi: number;
  color: string;
  quality: 'VALID' | 'MISSING' | 'SIMULATED';
}

// Proxy mismo-origen primero (Vite en dev, Vercel en prod), directo después.
// El directo falla por CORS en el navegador; el proxy es server-side.
const GEO_BASE = '/api/medellin';

const QUERY =
  '/rest/services/mapas_nacionales/VC_Limite_Politico_Admtivo/MapServer/1/query' +
  '?where=subtipo_comunacorregimiento%3D1' +
  '&outFields=codigo%2Cnombre&returnGeometry=true&outSR=4326' +
  '&geometryPrecision=5&maxAllowableOffset=0.0005&f=geojson';

async function fetchJson(url: string, timeoutMs = 25000): Promise<any> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`Comunas HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

/** Centroide honesto: promedio del bbox del anillo exterior. */
export function ringCentroid(ring: Array<[number, number]>): { lat: number; lon: number } {
  let minLon = Infinity, maxLon = -Infinity, minLat = Infinity, maxLat = -Infinity;
  for (const [lon, lat] of ring) {
    if (lon < minLon) minLon = lon;
    if (lon > maxLon) maxLon = lon;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
  }
  return { lat: (minLat + maxLat) / 2, lon: (minLon + maxLon) / 2 };
}

/** Ray casting sobre el anillo exterior. Exportado para tests. */
export function pointInRing(lon: number, lat: number, ring: Array<[number, number]>): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

export function parseComunas(json: any): ComunaFeature[] {
  const feats: any[] = Array.isArray(json?.features) ? json.features : [];
  const out: ComunaFeature[] = [];
  for (const f of feats) {
    const name = String(f?.properties?.nombre ?? '').trim();
    const code = String(f?.properties?.codigo ?? '').trim();
    const geom = f?.geometry;
    if (!name || !geom) continue;
    // Polygon o MultiPolygon → lista de anillos exteriores
    const rings: Array<Array<[number, number]>> =
      geom.type === 'Polygon'
        ? [geom.coordinates?.[0] ?? []]
        : geom.type === 'MultiPolygon'
          ? (geom.coordinates ?? []).map((p: any) => p?.[0] ?? [])
          : [];
    const outer = rings.find(r => r.length >= 4);
    if (!outer) continue;
    out.push({ id: `comuna-${code || name}`, name, polygon: rings, centroid: ringCentroid(outer) });
  }
  return out;
}

/** Polígonos oficiales o null (sin red / servicio caído). */
export async function loadComunas(): Promise<ComunaFeature[] | null> {
  const urls = [`${GEO_BASE}${QUERY}`, `https://www.medellin.gov.co/servidormapas${QUERY}`];
  for (const url of urls) {
    try {
      const list = parseComunas(await fetchJson(url));
      if (list.length) return list;
    } catch {
      // siguiente vía
    }
  }
  return null;
}

function havKm(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const r = (d: number) => (d * Math.PI) / 180;
  const h =
    Math.sin(r(bLat - aLat) / 2) ** 2 +
    Math.cos(r(aLat)) * Math.cos(r(bLat)) * Math.sin(r(bLon - aLon) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

/** Asigna AQI: estaciones válidas DENTRO del polígono; si no hay, la más
 *  cercana ≤12 km como ESTIMADO; si no, none. Nunca inventa valores. */
export function assignComunaAqi(c: ComunaFeature, stations: MiniStation[]): {
  aqi: number | null; origin: AqiOrigin; stationName: string | null; distKm: number | null; color: string;
} {
  const valid = stations.filter(s => s.quality !== 'MISSING');
  const outer = c.polygon[0] ?? [];
  const inside = valid.filter(s => pointInRing(s.lon, s.lat, outer));
  if (inside.length) {
    const aqi = Math.round(inside.reduce((a, s) => a + s.aqi, 0) / inside.length);
    return { aqi, origin: 'inside', stationName: inside.map(s => s.name).join(', '), distKm: 0, color: inside[0].color };
  }
  let best: MiniStation | null = null;
  let bestD = Infinity;
  for (const s of valid) {
    const d = havKm(c.centroid.lat, c.centroid.lon, s.lat, s.lon);
    if (d < bestD) { bestD = d; best = s; }
  }
  if (best && bestD <= 12) {
    return { aqi: best.aqi, origin: 'nearest', stationName: best.name, distKm: Math.round(bestD * 10) / 10, color: best.color };
  }
  return { aqi: null, origin: 'none', stationName: null, distKm: null, color: '#6b7280' };
}

/** Mapea la respuesta multi-coordenada de Open-Meteo a temps por índice. */
export function mapComunaTemps(json: any, n: number): Array<number | null> {
  const arr = Array.isArray(json) ? json : [json];
  return Array.from({ length: n }, (_, i) => {
    const t = arr[i]?.current?.temperature_2m;
    return typeof t === 'number' && Number.isFinite(t) ? Math.round(t * 10) / 10 : null;
  });
}

/** Temperatura real por centroide en UNA sola petición (coords múltiples). */
export async function loadComunaTemps(centroids: Array<{ lat: number; lon: number }>): Promise<Array<number | null>> {
  if (!centroids.length) return [];
  const params = new URLSearchParams({
    latitude: centroids.map(c => c.lat.toFixed(4)).join(','),
    longitude: centroids.map(c => c.lon.toFixed(4)).join(','),
    current: 'temperature_2m',
    timezone: 'America/Bogota',
  });
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 25000);
  try {
    const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`Open-Meteo ${res.status}`);
    return mapComunaTemps(await res.json(), centroids.length);
  } catch {
    return centroids.map(() => null);
  } finally {
    clearTimeout(t);
  }
}
