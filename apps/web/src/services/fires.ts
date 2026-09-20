/**
 * Focos de incendio REALES vía NASA FIRMS (VIIRS NRT, ~3h de latencia).
 *
 * Suomi NPP cesa el 1-nov-2026: se usa NOAA-21 (primario) + NOAA-20 (respaldo).
 * Requiere key gratuita: https://firms.modaps.eosdis.nasa.gov/api/map_key/
 * configurada como VITE_FIRMS_MAP_KEY. Sin key (o si falla la red/CORS)
 * devuelve null y la app usa demoSmokeFoci() etiquetado como demo.
 */
import type { SmokeFocus } from './intelligence';

const MAP_KEY = ((import.meta.env.VITE_FIRMS_MAP_KEY as string | undefined) ?? '').trim();

// Valle de Aburrá + Oriente cercano (oeste,sur,este,norte)
const BBOX = '-75.9,5.9,-75.0,6.6';
// NOAA-21 primario oficial FIRMS tras retiro Suomi NPP (1-nov-2026), NOAA-20 respaldo.
const SOURCES = ['VIIRS_NOAA21_NRT', 'VIIRS_NOAA20_NRT'];
const DAY_RANGE = 2;
const MAX_FOCI = 40;

export function firmsConfigured(): boolean {
  return MAP_KEY.length > 0;
}

function confidenceOf(raw: string): 'alta' | 'media' | 'baja' {
  const c = raw.trim().toLowerCase();
  if (c === 'h') return 'alta';
  if (c === 'n') return 'media';
  return 'baja';
}

/** Parsea el CSV de FIRMS por cabecera (VIIRS usa bright_ti4/ti5, MODIS bright_t31). */
export function parseFirmsCsv(text: string): SmokeFocus[] {
  const lines = text.trim().split('\n');
  if (lines.length < 2) return [];
  const head = lines[0].split(',').map(h => h.trim().toLowerCase());
  const col = (name: string) => head.indexOf(name);
  const iLat = col('latitude');
  const iLon = col('longitude');
  const iFrp = col('frp');
  const iConf = col('confidence');
  const iSat = col('satellite');
  const iDate = col('acq_date');
  if (iLat < 0 || iLon < 0) return [];
  const out: SmokeFocus[] = [];
  for (const line of lines.slice(1, MAX_FOCI + 1)) {
    const cells = line.split(',');
    const lat = Number(cells[iLat]);
    const lon = Number(cells[iLon]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const frp = iFrp >= 0 ? Number(cells[iFrp]) : NaN;
    const sat = iSat >= 0 ? cells[iSat].trim() : 'VIIRS';
    const date = iDate >= 0 ? cells[iDate].trim() : '';
    out.push({
      id: `firms-${lat.toFixed(3)}-${lon.toFixed(3)}`,
      name: `Incendio FIRMS ${sat}${date ? ` ${date}` : ''}`,
      lat: Math.round(lat * 10000) / 10000,
      lon: Math.round(lon * 10000) / 10000,
      frp: Number.isFinite(frp) ? Math.round(frp * 10) / 10 : 0,
      confidence: iConf >= 0 ? confidenceOf(cells[iConf]) : 'media',
      simulated: false,
    });
  }
  return out;
}

async function fetchText(url: string, timeoutMs: number): Promise<string> {
  const ctrl = new AbortController();
  const t = window.setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`FIRMS ${res.status}`);
    return await res.text();
  } finally {
    window.clearTimeout(t);
  }
}

/**
 * Focos reales o null (sin key / sin red / respuesta inválida).
 * Lista vacía = real, sin incendios en la ventana (no es fallo).
 */
export async function loadFireFoci(): Promise<SmokeFocus[] | null> {
  if (!MAP_KEY) return null;
  // NOAA-21 primero, NOAA-20 después; proxy mismo-origen (evita CORS), directo como respaldo.
  const seen = new Set<string>();
  const merged: SmokeFocus[] = [];
  let ok = false;
  for (const src of SOURCES) {
    const remote = `/api/area/csv/${MAP_KEY}/${src}/${BBOX}/${DAY_RANGE}`;
    const urls = [`/api/firms${remote}`, `https://firms.modaps.eosdis.nasa.gov${remote}`];
    for (const url of urls) {
      try {
        const foci = parseFirmsCsv(await fetchText(url, 25000));
        ok = true;
        for (const f of foci) {
          if (seen.has(f.id)) continue;
          seen.add(f.id);
          merged.push(f);
          if (merged.length >= MAX_FOCI) break;
        }
        break; // fuente OK, pasa a la siguiente fuente
      } catch {
        // prueba siguiente vía/fuente
      }
    }
  }
  return ok ? merged : null;
}
