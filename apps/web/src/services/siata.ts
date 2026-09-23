/**
 * Cliente SIATA — red oficial de monitoreo del Valle de Aburrá.
 *
 * Endpoints JSON públicos (documentados por SIATA en su integración OpenAQ):
 *   https://siata.gov.co/EntregaData1/Datos_SIATA_Aire_AQ_{pm25,pm10,ozono,no2,...}_Last.json
 *
 * Estado conocido (verificado 2026-09-07): los dumps "_Last" están congelados
 * en septiembre de 2024 (el dato en vivo migró al Geoportal/App SIATA).
 * Se usan como HISTÓRICO REAL con banderas de calidad; el "ahora" real
 * viene de Open-Meteo CAMS y el respaldo es simulado. La fuente SIEMPRE
 * se muestra en la UI tal cual es.
 *
 * Reglas de calidad SIATA: valor -9999 = faltante o mala calidad.
 * En el dump histórico grande usan flag numérico: calidad <= 2.5 = bueno.
 */

export type QualityFlag = 'VALID' | 'MISSING' | 'SIMULATED';

export interface SiataMeasurement {
  station: string; // "MED-VILL - Medellín, Villahermosa - ..."
  parameter: 'pm25' | 'pm10' | 'o3' | 'no2';
  value: number;
  unit: string;
  utc: string;
  lat: number;
  lon: number;
}

export interface SiataStation {
  id: string; // código, ej. "MED-VILL"
  name: string; // nombre legible
  district: string; // municipio
  lat: number;
  lon: number;
}

export interface SiataSample {
  t: number; // epoch ms
  value: number | null;
  flag: QualityFlag;
}

const SIATA_PARAMS: Record<string, 'pm25' | 'pm10' | 'o3' | 'no2'> = {
  pm25: 'pm25',
  pm10: 'pm10',
  ozono: 'o3',
  no2: 'no2',
};

// Proxy mismo-origen primero (Vite en dev, Vercel en prod), directo después.
const SIATA_BASES = ['/api/siata/EntregaData1', 'https://siata.gov.co/EntregaData1'];

const MUNICIPALITIES = [
  'Girardota', 'Barbosa', 'Copacabana', 'Bello', 'Medellín', 'Medellin',
  'Itagüí', 'Itagui', 'Envigado', 'Sabaneta', 'La Estrella', 'Caldas',
];

function normalize(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

export function municipalityOf(location: string): string {
  const n = normalize(location);
  for (const m of MUNICIPALITIES) {
    if (n.includes(normalize(m))) {
      return m === 'Medellin' ? 'Medellín' : m === 'Itagui' ? 'Itagüí' : m;
    }
  }
  return 'Medellín';
}

function stationCode(location: string): string {
  const m = location.match(/^([A-Z]{3}-[A-Z0-9]+)/);
  return m ? m[1] : location.slice(0, 12);
}

async function fetchJson(url: string, timeoutMs = 25000): Promise<any> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`SIATA HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

/** Descarga el dump "_Last" (últimas ~24-48h) de un contaminante. */
export async function fetchSiataLast(param: keyof typeof SIATA_PARAMS): Promise<SiataMeasurement[]> {
  const key = SIATA_PARAMS[param];
  let last: unknown = null;
  for (const base of SIATA_BASES) {
    try {
      const json = await fetchJson(`${base}/Datos_SIATA_Aire_AQ_${param}_Last.json`);
      const list = Array.isArray(json?.measurements) ? json.measurements : [];
      return list.map((m: any) => ({
        station: String(m.location ?? 'desconocida'),
        parameter: key,
        value: typeof m.value === 'number' ? m.value : -9999,
        unit: String(m.unit ?? 'µg/m³'),
        utc: String(m.date?.utc ?? ''),
        lat: Number(m.coordinates?.latitude ?? 0),
        lon: Number(m.coordinates?.longitude ?? 0),
      }));
    } catch (e) {
      last = e;
    }
  }
  throw last instanceof Error ? last : new Error('SIATA sin respuesta');
}

export interface SiataDataset {
  stations: SiataStation[];
  /** series por código de estación: { pm25: [...], pm10: [...], o3: [...], no2: [...] } */
  series: Record<string, Record<'pm25' | 'pm10' | 'o3' | 'no2', SiataSample[]>>;
  updatedAt: number;
  validCount: number;
  missingCount: number;
}

/** Descarga pm25/pm10/o3/no2 en paralelo y los fusiona por estación. */
export async function loadSiataDataset(): Promise<SiataDataset> {
  const params = Object.keys(SIATA_PARAMS) as (keyof typeof SIATA_PARAMS)[];
  const results = await Promise.all(params.map(p => fetchSiataLast(p).catch(() => [] as SiataMeasurement[])));

  const stationMeta = new Map<string, SiataStation>();
  const series: SiataDataset['series'] = {};
  let updatedAt = 0;
  let validCount = 0;
  let missingCount = 0;

  const ensure = (code: string, m: SiataMeasurement) => {
    if (!stationMeta.has(code)) {
      const short = m.station.split(' - ')[1] || m.station;
      stationMeta.set(code, {
        id: code,
        name: short.replace(/^_OFF-/, '').trim(),
        district: municipalityOf(m.station),
        lat: m.lat,
        lon: m.lon,
      });
      series[code] = { pm25: [], pm10: [], o3: [], no2: [] };
    }
  };

  results.flat().forEach(m => {
    if (!m.lat || !m.lon) return;
    const code = stationCode(m.station);
    ensure(code, m);
    const t = Date.parse(m.utc);
    if (!Number.isNaN(t) && t > updatedAt) updatedAt = t;
    if (m.value === -9999 || Number.isNaN(m.value)) {
      missingCount++;
      series[code][m.parameter].push({ t: Number.isNaN(t) ? 0 : t, value: null, flag: 'MISSING' });
    } else {
      validCount++;
      series[code][m.parameter].push({ t: Number.isNaN(t) ? 0 : t, value: m.value, flag: 'VALID' });
    }
  });

  Object.values(series).forEach(per =>
    (Object.keys(per) as ('pm25' | 'pm10' | 'o3' | 'no2')[]).forEach(k =>
      per[k].sort((a, b) => a.t - b.t)
    )
  );

  return { stations: [...stationMeta.values()], series, updatedAt, validCount, missingCount };
}
