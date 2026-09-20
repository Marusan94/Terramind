/**
 * Terramind environmental intelligence engine.
 *
 * PURE and DETERMINISTIC functions (no Math.random): same input,
 * same output. Anything not coming from a real sensor is labeled as
 * estimated/simulated in the UI via the `method` / `simulated` fields.
 *
 * Scientific basis:
 *  - WHO 2021 global air quality guidelines: PM2.5 15, PM10 45,
 *    O3 60 (seasonal 8h peak, used here as a 24h reference), NO2 25 ug/m3.
 *  - US EPA AQI for categories (see data/stations.ts:calculateAQI).
 *  - POECA (AMVA operational plan for pollution episodes): prevention /
 *    alert levels for PM2.5. Thresholds here are a DOCUMENTED heuristic
 *    inspired by POECA, not the official protocol.
 *  - Thermal inversion / mixing layer: Valle de Aburra suffers almost
 *    permanent night stability in March (SIATA, UdeA/UNAL theses). The
 *    diurnal curve here is an estimated proxy, not ceilometer data.
 */

export interface StationReading {
  id: string;
  district: string;
  pm25: number;
  pm10: number;
  o3: number;
  no2: number;
  elevation: number;
}

/** WHO 2021 reference limits (ug/m3, 24h means). */
export const WHO_2021 = { pm25: 15, pm10: 45, o3: 60, no2: 25 } as const;

export type PollutantKey = keyof typeof WHO_2021;

export const POLLUTANT_LABEL: Record<PollutantKey, string> = {
  pm25: 'PM2.5',
  pm10: 'PM10',
  o3: 'O3',
  no2: 'NO2',
};

export interface WhoVerdict {
  pollutant: PollutantKey;
  value: number;
  limit: number;
  /** value / limit. 1 = exactly at the WHO limit. */
  ratio: number;
  exceeds: boolean;
  label: string;
}

/** Compares a measurement against the WHO limit, labeled in Spanish. */
export function whoVerdict(pollutant: PollutantKey, value: number): WhoVerdict {
  const limit = WHO_2021[pollutant];
  const ratio = limit > 0 ? value / limit : 0;
  const exceeds = value > limit;
  const rounded = Math.round(ratio * 10) / 10;
  const label = !exceeds ? 'Cumple OMS' : 'Supera OMS x' + rounded.toFixed(1);
  return { pollutant, value, limit, ratio: Math.round(ratio * 100) / 100, exceeds, label };
}

export interface RankedDistrict {
  district: string;
  pm25: number;
  pm10: number;
  o3: number;
  no2: number;
  aqi: number;
  /** Times the WHO PM2.5 limit. */
  ratioVsWho: number;
  exceedsWho: boolean;
  elevation: number;
}

/**
 * District ranking, worst first, by PM2.5 relative to WHO.
 * Empty input -> empty list (UI shows an empty state, not fake zeros).
 */
export function rankDistrictsByWho(
  readings: StationReading[],
  aqiOf: (pm25: number) => number,
): RankedDistrict[] {
  return readings
    .filter(r => Number.isFinite(r.pm25))
    .map(r => {
      const v = whoVerdict('pm25', r.pm25);
      return {
        district: r.district,
        pm25: r.pm25,
        pm10: r.pm10,
        o3: r.o3,
        no2: r.no2,
        aqi: aqiOf(r.pm25),
        ratioVsWho: v.ratio,
        exceedsWho: v.exceeds,
        elevation: r.elevation,
      };
    })
    .sort((a, b) => b.ratioVsWho - a.ratioVsWho);
}

export type PreventionLevel = 'verde' | 'amarillo' | 'naranja';

export interface PreventionStatus {
  level: PreventionLevel;
  /** Rule that triggered the level, in citizen language. */
  rule: string;
  /** Estimated episode probability in 24-48h (0-1). */
  probability: number;
  explanation: string;
  worst: RankedDistrict | null;
  method: string;
}

const PREVENTION_METHOD =
  'Heuristic inspired by POECA/AMVA with station data + local forecast. Not an official declaration.';

/**
 * Prevention semaphore. Documented thresholds:
 *  - NARANJA if worst PM2.5 >= 55.5 (EPA "unhealthy for sensitive") or P(episode) >= 0.6.
 *  - AMARILLO if worst PM2.5 >= 35.5 (above EPA "moderate") or P(episode) >= 0.4.
 *  - VERDE otherwise.
 */
export function preventionStatus(
  ranked: RankedDistrict[],
  exceedanceProb: number,
): PreventionStatus {
  const worst = ranked.length ? ranked[0] : null;
  const peak = worst ? worst.pm25 : 0;
  const p = Math.min(1, Math.max(0, exceedanceProb));
  if (worst && (peak >= 55.5 || p >= 0.6)) {
    return {
      level: 'naranja',
      rule: peak >= 55.5
        ? worst.district + ' registra ' + worst.pm25 + ' ug/m3 (>= 55.5, nivel insalubre para sensibles)'
        : 'Probabilidad de episodio del ' + Math.round(p * 100) + '% en 24-48h',
      probability: Math.round(p * 100) / 100,
      explanation: 'Se recomienda reducir ejercicio al aire libre, cerrar ventanas en hora pico y seguir canales SIATA/AMVA.',
      worst,
      method: PREVENTION_METHOD,
    };
  }
  if (worst && (peak >= 35.5 || p >= 0.4)) {
    return {
      level: 'amarillo',
      rule: peak >= 35.5
        ? worst.district + ' registra ' + worst.pm25 + ' ug/m3 (>= 35.5, sobre el rango moderado)'
        : 'Probabilidad de episodio del ' + Math.round(p * 100) + '% en 24-48h',
      probability: Math.round(p * 100) / 100,
      explanation: 'Grupos sensibles (ninez, adulto mayor, gestantes, asma) limitan exposicion prolongada en hora pico.',
      worst,
      method: PREVENTION_METHOD,
    };
  }
  return {
    level: 'verde',
    rule: worst
      ? 'Pico de ' + worst.pm25 + ' ug/m3 en ' + worst.district + ', dentro del rango aceptable'
      : 'Sin estaciones con datos suficientes',
    probability: Math.round(p * 100) / 100,
    explanation: 'Condiciones aceptables. Buen momento para actividad al aire libre.',
    worst,
    method: PREVENTION_METHOD,
  };
}

/**
 * Estimated mixing-layer height ("invisible ceiling", meters).
 * Deterministic proxy: low at dawn (thermal inversion), high in the
 * early afternoon, modulated by wind (more wind = more mixing).
 * Typical tropical mountain valley range: 150-1800 m.
 */
export function estimateMixingHeightM(hour: number, windSpeedMs: number): number {
  const h = ((Math.round(hour) % 24) + 24) % 24;
  const w = Math.min(12, Math.max(0, windSpeedMs));
  // Diurnal curve: peak at 14h, valley at 4h.
  const diurnal = 0.5 - 0.5 * Math.cos(((h - 4) / 24) * 2 * Math.PI);
  const base = 180 + diurnal * 1250;
  const windBonus = Math.min(350, w * 45);
  return Math.round(Math.min(1800, Math.max(150, base + windBonus)));
}

export type MixingStateKey = 'tapado' | 'transicion' | 'ventilando';

export interface MixingState {
  state: MixingStateKey;
  label: string;
  color: string;
  advice: string;
}

/** Translates ceiling height into a valley state. */
export function mixingState(heightM: number): MixingState {
  if (heightM < 450) {
    return {
      state: 'tapado',
      label: 'Valle tapado',
      color: '#f97316',
      advice: 'Techo bajo: lo que se emite se queda. Evita ejercicio 6-9am.',
    };
  }
  if (heightM < 900) {
    return {
      state: 'transicion',
      label: 'Ventilando',
      color: '#eab308',
      advice: 'El techo sube: la manana mejora hacia las 10-11am.',
    };
  }
  return {
    state: 'ventilando',
    label: 'Valle ventilado',
    color: '#22c55e',
    advice: 'Techo alto: buena dispersion. Ideal para salir.',
  };
}

export interface SourceShare {
  /** 0-1 share of PM2.5 from traffic. */
  traffic: number;
  /** 0-1 share from industry. */
  industrial: number;
  /** 0-1 share of transported regional smoke. */
  regional: number;
  method: string;
}

const INDUSTRIAL_DISTRICTS = new Set(['Itagui', 'Bello', 'La Candelaria', 'Girardota']);

function isRushHour(hour: number): boolean {
  return (hour >= 6 && hour <= 9) || (hour >= 17 && hour <= 20);
}

function sameDistrict(a: string, b: string): boolean {
  const norm = (s: string): string =>
    s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  return norm(a) === norm(b);
}

/**
 * Source attribution (documented heuristic, shares sum to 1).
 * Logic: rush hour => more traffic; industrial district => more industry;
 * strong east wind + active smoke => more regional share.
 * Accent-insensitive so 'Itagui' matches 'Itagüí'.
 */
export function attributeSources(input: {
  hour: number;
  district: string;
  windSpeedMs: number;
  regionalSmoke: boolean;
}): SourceShare {
  const rush = isRushHour(input.hour) ? 0.62 : 0.34;
  const isIndustrial = [...INDUSTRIAL_DISTRICTS].some(d => sameDistrict(d, input.district));
  const industrial = isIndustrial ? 0.3 : 0.14;
  let regional = 0.12;
  if (input.regionalSmoke && input.windSpeedMs >= 2) regional = 0.3;
  else if (input.regionalSmoke) regional = 0.2;
  const traffic = Math.max(0.1, rush - regional * 0.3);
  const total = traffic + industrial + regional;
  const round2 = (n: number): number => Math.round((n / total) * 100) / 100;
  const t = round2(traffic);
  const ind = round2(industrial);
  return {
    traffic: t,
    industrial: ind,
    regional: Math.round((1 - t - ind) * 100) / 100,
    method: 'Heuristica hora pico + tipo de distrito + viento/humo. Estimacion didactica, no inventario de emisiones.',
  };
}

/** Least-squares slope (y per unit of x). */
export function leastSquaresSlope(xs: number[], ys: number[]): number {
  const n = Math.min(xs.length, ys.length);
  if (n < 2) return 0;
  let sx = 0;
  let sy = 0;
  for (let i = 0; i < n; i++) { sx += xs[i]; sy += ys[i]; }
  const mx = sx / n;
  const my = sy / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - mx) * (ys[i] - my);
    den += (xs[i] - mx) * (xs[i] - mx);
  }
  return den === 0 ? 0 : num / den;
}

/** Diurnal PM2.5 factor (valley rush-hour pattern). 24h mean ~= 1. */
function diurnalFactor(hour: number): number {
  const h = ((Math.round(hour) % 24) + 24) % 24;
  if (h >= 7 && h <= 9) return 1.35;
  if (h >= 17 && h <= 20) return 1.45;
  if (h >= 10 && h <= 16) return 1.05;
  if (h >= 0 && h <= 5) return 0.65;
  return 0.9;
}

const DIURNAL_MEAN = (() => {
  let s = 0;
  for (let h = 0; h < 24; h++) s += diurnalFactor(h);
  return s / 24;
})();

export interface ForecastPoint {
  t: number;
  hour: number;
  pm25: number;
  pm25Min: number;
  pm25Max: number;
  /** 0-1, decays with horizon. */
  confidence: number;
}

/**
 * N-hour PM2.5 forecast: damped trend + diurnal pattern,
 * 95% confidence interval from residuals. Deterministic.
 * With <3 valid points it returns a flat band with low confidence (honest).
 */
export function forecastPM25(
  history: { t: number; pm25: number | null }[],
  hours = 48,
): ForecastPoint[] {
  const pts = history.filter(
    (p): p is { t: number; pm25: number } => p.pm25 != null && Number.isFinite(p.pm25),
  );
  const anchor = pts.length ? pts[pts.length - 1].t : Date.now();
  if (pts.length < 3) {
    const flat = pts.length ? pts[pts.length - 1].pm25 : 25;
    const out: ForecastPoint[] = [];
    for (let i = 1; i <= hours; i++) {
      const t = anchor + i * 3600_000;
      out.push({
        t,
        hour: new Date(t).getHours(),
        pm25: Math.round(flat * 10) / 10,
        pm25Min: Math.max(0, Math.round(flat * 0.5 * 10) / 10),
        pm25Max: Math.round(flat * 1.6 * 10) / 10,
        confidence: 0.5,
      });
    }
    return out;
  }
  const t0 = pts[0].t;
  const xs = pts.map(p => (p.t - t0) / 3600_000);
  const ys = pts.map(p => p.pm25);
  const rawSlope = leastSquaresSlope(xs, ys);
  const slope = Math.min(2, Math.max(-2, rawSlope));
  const mean = ys.reduce((s, y) => s + y, 0) / ys.length;
  const last = ys[ys.length - 1];
  const variance = ys.reduce((s, y) => s + (y - mean) * (y - mean), 0) / ys.length;
  const sigma = Math.sqrt(variance);
  const lastHour = new Date(pts[pts.length - 1].t).getHours();
  const out: ForecastPoint[] = [];
  for (let i = 1; i <= hours; i++) {
    const t = anchor + i * 3600_000;
    const hour = new Date(t).getHours();
    const trendPart = last + slope * i * 0.5;
    const cyclePart = (diurnalFactor(hour) - diurnalFactor(lastHour)) * mean * 0.6;
    const v = Math.max(0, trendPart + cyclePart / DIURNAL_MEAN);
    const half = 1.96 * sigma * (1 + i * 0.03);
    out.push({
      t,
      hour,
      pm25: Math.round(v * 10) / 10,
      pm25Min: Math.max(0, Math.round((v - half) * 10) / 10),
      pm25Max: Math.round((v + half) * 10) / 10,
      confidence: Math.round(Math.max(0.5, 0.95 - i * 0.008) * 100) / 100,
    });
  }
  return out;
}

/** Standard normal CDF (Abramowitz-Stegun approx, error < 7.5e-8). */
function normCdf(x: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989423 * Math.exp((-x * x) / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return x > 0 ? 1 - p : p;
}

/**
 * P(forecast mean exceeds threshold) assuming gaussian noise with
 * sigma from the mean IC95% width. Documented heuristic.
 */
export function exceedanceProbability(forecast: ForecastPoint[], threshold: number): number {
  if (!forecast.length) return 0;
  const mus = forecast.slice(0, 24);
  const mu = mus.reduce((s, f) => s + f.pm25, 0) / mus.length;
  const sigmas = mus.map(f => Math.max(1, (f.pm25Max - f.pm25Min) / (2 * 1.96)));
  const sigma = sigmas.reduce((s, x) => s + x, 0) / sigmas.length;
  return Math.round((1 - normCdf((threshold - mu) / sigma)) * 100) / 100;
}

/** Median of an array (sorted copy, input untouched). */
function median(values: number[]): number {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/**
 * MAD-based anomalies (median absolute deviation, outlier-robust).
 * Constant series: any deviation is flagged. k=3.5 by default.
 */
export function detectAnomalies(values: number[], k = 3.5): boolean[] {
  if (!values.length) return [];
  const med = median(values);
  const mad = median(values.map(v => Math.abs(v - med)));
  if (mad === 0) return values.map(v => v !== med);
  return values.map(v => (0.6745 * Math.abs(v - med)) / mad > k);
}

export interface BestHour {
  hour: number;
  pm25: number;
}

/**
 * Best hours for outdoor activity: averages the forecast by hour of
 * day and returns the `count` cleanest expected hours.
 */
export function bestHours(forecast: ForecastPoint[], count = 3): BestHour[] {
  const byHour = new Map<number, { sum: number; n: number }>();
  for (const f of forecast) {
    const e = byHour.get(f.hour) ?? { sum: 0, n: 0 };
    e.sum += f.pm25;
    e.n += 1;
    byHour.set(f.hour, e);
  }
  return [...byHour.entries()]
    .map(([hour, e]) => ({ hour, pm25: Math.round((e.sum / e.n) * 10) / 10 }))
    .sort((a, b) => a.pm25 - b.pm25)
    .slice(0, Math.max(1, count));
}

function haversineKm(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const r = 6371;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLon = ((bLon - aLon) * Math.PI) / 180;
  const s1 = Math.sin(dLat / 2);
  const s2 = Math.sin(dLon / 2);
  const a = s1 * s1 + Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * s2 * s2;
  return 2 * r * Math.asin(Math.min(1, Math.sqrt(a)));
}

export interface RouteExposure {
  avgPm25: number;
  /** Estimated dose ug/m3.h (5 min per route leg). */
  dose: number;
  level: string;
  color: string;
  method: string;
}

/**
 * Route exposure: inverse-distance-weighted PM2.5 from stations.
 * Dose assumes ~5 min per route waypoint.
 */
export function routeExposure(
  stations: { lat: number; lon: number; pm25: number }[],
  route: { lat: number; lon: number }[],
): RouteExposure {
  const validStations = stations.filter(s => Number.isFinite(s.pm25));
  if (!validStations.length || !route.length) {
    return { avgPm25: 0, dose: 0, level: 'Sin datos', color: '#71717a', method: 'Sin estaciones o ruta vacia.' };
  }
  let acc = 0;
  for (const p of route) {
    let wsum = 0;
    let wv = 0;
    for (const s of validStations) {
      const d = haversineKm(p.lat, p.lon, s.lat, s.lon);
      const w = 1 / ((d + 0.5) * (d + 0.5));
      wsum += w;
      wv += w * s.pm25;
    }
    acc += wsum > 0 ? wv / wsum : 0;
  }
  const avg = Math.round((acc / route.length) * 10) / 10;
  const dose = Math.round(avg * ((route.length * 5) / 60) * 10) / 10;
  const v = whoVerdict('pm25', avg);
  const level = v.exceeds ? 'Supera OMS x' + v.ratio : 'Dentro de OMS';
  const color = v.ratio <= 1 ? '#22c55e' : v.ratio <= 2 ? '#eab308' : '#f97316';
  return {
    avgPm25: avg,
    dose,
    level,
    color,
    method: 'Ponderacion inversa a la distancia (IDW) a estaciones + 5 min por tramo. Estimacion didactica.',
  };
}

export interface SmokeFocus {
  id: string;
  name: string;
  lat: number;
  lon: number;
  /** Fire radiative power (MW). En demo es ilustrativo; en FIRMS es observado. */
  frp: number;
  confidence: 'alta' | 'media' | 'baja';
  /** false = observado vía NASA FIRMS (ver services/fires.ts). */
  simulated: boolean;
}

/**
 * Regional burning foci (Oriente and Magdalena Medio) in demo mode,
 * clearly flagged as simulated until FIRMS/NASA is integrated.
 */
export function demoSmokeFoci(): SmokeFocus[] {
  return [
    { id: 'smoke-oriente', name: 'Foco Oriente (demo)', lat: 6.32, lon: -75.08, frp: 18.4, confidence: 'media', simulated: true },
    { id: 'smoke-magdalena', name: 'Foco Magdalena Medio (demo)', lat: 5.95, lon: -74.9, frp: 42.1, confidence: 'media', simulated: true },
    { id: 'smoke-suroeste', name: 'Foco Suroeste (demo)', lat: 5.98, lon: -75.62, frp: 9.7, confidence: 'baja', simulated: true },
  ];
}

/**
 * Simple advection trajectory: from the focus, following the wind
 * (FROM direction in degrees, speed m/s), one point per hour.
 * Didactic transport model, not HYSPLIT.
 */
export function trajectory(
  lat: number,
  lon: number,
  windFromDeg: number,
  windSpeedMs: number,
  hours: number,
): { lat: number; lon: number }[] {
  const toRad = (d: number): number => (d * Math.PI) / 180;
  // Wind "from the east (90)" blows TOWARDS the west.
  const toDeg = (windFromDeg + 180) % 360;
  const dx = Math.sin(toRad(toDeg)); // east
  const dy = Math.cos(toRad(toDeg)); // north
  const kmH = Math.max(0, windSpeedMs) * 3.6;
  const pts: { lat: number; lon: number }[] = [];
  let la = lat;
  let lo = lon;
  for (let i = 1; i <= Math.max(1, Math.round(hours)); i++) {
    la += (dy * kmH) / 111;
    lo += (dx * kmH) / (111 * Math.max(0.2, Math.cos(toRad(la))));
    pts.push({ lat: Math.round(la * 10000) / 10000, lon: Math.round(lo * 10000) / 10000 });
  }
  return pts;
}