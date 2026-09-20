/**
 * Pestaña 🧠 Inteligencia: traduce fenómenos a decisiones.
 * Todo cálculo viene de services/intelligence (puro y determinista);
 * este componente solo presenta. Lo estimado/simlulado va etiquetado.
 */

import { useMemo } from 'react';
import {
  WHO_2021,
  rankDistrictsByWho,
  preventionStatus,
  estimateMixingHeightM,
  mixingState,
  attributeSources,
  forecastPM25,
  exceedanceProbability,
  detectAnomalies,
  bestHours,
  routeExposure,
  demoSmokeFoci,
  trajectory,
} from '../services/intelligence';
import { calculateAQI } from '../data/stations';

export interface IntelStation {
  id: string;
  district: string;
  pm25: number;
  pm10: number;
  o3: number;
  no2: number;
  elevation: number;
  lat: number;
  lon: number;
}

export interface IntelWeather {
  temp: number;
  humidity: number;
  precipProb: number;
  label: string;
  emoji: string;
}

interface IntelligenceTabProps {
  stations: IntelStation[];
  hourly: { t: number; pm25: number | null }[];
  weather: IntelWeather | null;
  source: string;
}

/** Viento estimado del oriente (típico del valle en la mañana). */
const WIND_EST = { fromDeg: 70, speedMs: 2.5 };

const CARD: React.CSSProperties = {
  background: 'rgba(255,255,255,0.03)',
  border: '1px solid var(--border)',
  borderRadius: 8,
  padding: 12,
  marginBottom: 12,
};

const H2: React.CSSProperties = { fontSize: 13, fontWeight: 700, margin: '0 0 8px', color: 'var(--text)' };
const NOTE: React.CSSProperties = { fontSize: 11, color: 'var(--text-muted)', marginTop: 8 };
const LEVEL_COLOR: Record<string, string> = { verde: '#22c55e', amarillo: '#eab308', naranja: '#f97316' };

function fmtHour(h: number): string {
  return `${h}:00`;
}

export default function IntelligenceTab({ stations, hourly, weather, source }: IntelligenceTabProps) {
  const intel = useMemo(() => {
    const ranked = rankDistrictsByWho(stations, pm25 => calculateAQI(pm25, pm25 * 1.5, 45, 20).aqi);
    const forecast = forecastPM25(hourly, 48);
    const pWho = exceedanceProbability(forecast, WHO_2021.pm25);
    const prevention = preventionStatus(ranked, pWho);
    const nowHour = new Date().getHours();
    const mixingM = estimateMixingHeightM(nowHour, WIND_EST.speedMs);
    const mixing = mixingState(mixingM);
    const dayCurve = Array.from({ length: 24 }, (_, h) => estimateMixingHeightM(h, WIND_EST.speedMs));
    const worst = ranked[0] ?? null;
    const sources = worst
      ? attributeSources({ hour: nowHour, district: worst.district, windSpeedMs: WIND_EST.speedMs, regionalSmoke: true })
      : null;
    const best = bestHours(forecast, 3);
    const anomalyFlags = detectAnomalies(hourly.filter(h => h.pm25 != null).map(h => h.pm25 as number));
    const anomalies = anomalyFlags.filter(Boolean).length;
    // Ruta demo: circuito corto junto a la peor estación (5 tramos).
    const route = worst
      ? [
          { lat: worstPmLat(stations, worst.district), lon: worstPmLon(stations, worst.district) },
          { lat: worstPmLat(stations, worst.district) + 0.008, lon: worstPmLon(stations, worst.district) + 0.004 },
          { lat: worstPmLat(stations, worst.district) + 0.012, lon: worstPmLon(stations, worst.district) - 0.004 },
          { lat: worstPmLat(stations, worst.district) + 0.004, lon: worstPmLon(stations, worst.district) - 0.008 },
          { lat: worstPmLat(stations, worst.district), lon: worstPmLon(stations, worst.district) },
        ]
      : [];
    const exposure = routeExposure(
      stations.map(s => ({ lat: s.lat, lon: s.lon, pm25: s.pm25 })),
      route,
    );
    const foci = demoSmokeFoci().map(f => ({
      ...f,
      path: trajectory(f.lat, f.lon, WIND_EST.fromDeg, WIND_EST.speedMs, 12),
    }));
    return {
      ranked, forecast, pWho, prevention, mixingM, mixing, dayCurve,
      worst, sources, best, anomalies, exposure, foci, nowHour,
    };
  }, [stations, hourly]);

  const maxRatio = Math.max(1, ...intel.ranked.map(r => r.ratioVsWho));

  return (
    <div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 12 }}>
        Fuente: {source} · Viento estimado del oriente a {WIND_EST.speedMs} m/s (demo)
        {weather ? ` · ${weather.emoji} ${Math.round(weather.temp)}°C` : ''}
      </div>

      {/* 1. Techo invisible */}
      <div style={CARD}>
        <div style={H2}>🫁 Techo invisible — {intel.mixing.label}</div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span style={{ fontSize: 26, fontWeight: 800, color: intel.mixing.color }}>{intel.mixingM} m</span>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>altura estimada de la capa de mezcla · {intel.nowHour}:00</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 44, marginTop: 8 }}>
          {intel.dayCurve.map((m, h) => (
            <div
              key={h}
              title={`${fmtHour(h)}: ${m} m`}
              style={{
                flex: 1,
                height: `${Math.round((m / 1800) * 100)}%`,
                background: h === intel.nowHour ? '#8b5cf6' : m < 450 ? '#f97316' : m < 900 ? '#eab308' : '#22c55e',
                borderRadius: 2,
                opacity: h === intel.nowHour ? 1 : 0.75,
              }}
            />
          ))}
        </div>
        <div style={{ fontSize: 12, marginTop: 6 }}>{intel.mixing.advice}</div>
        <div style={NOTE}>Proxy diurno estimado (noche baja por inversión térmica, tarde alta). No es ceilómetro real.</div>
      </div>

      {/* 2. OMS por barrio */}
      <div style={CARD}>
        <div style={H2}>🏘️ ¿Qué barrio incumple OMS? (PM2.5 &gt; {WHO_2021.pm25} µg/m³)</div>
        {intel.ranked.slice(0, 6).map(r => (
          <div key={r.district} style={{ marginBottom: 6 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
              <span>{r.district}</span>
              <span style={{ color: r.exceedsWho ? '#f97316' : '#22c55e', fontWeight: 700 }}>
                {r.pm25} µg/m³ · {r.exceedsWho ? `×${r.ratioVsWho}` : 'cumple'}
              </span>
            </div>
            <div style={{ height: 6, background: 'rgba(255,255,255,0.08)', borderRadius: 3, marginTop: 3 }}>
              <div
                style={{
                  width: `${Math.min(100, Math.round((r.ratioVsWho / maxRatio) * 100))}%`,
                  height: '100%',
                  borderRadius: 3,
                  background: r.exceedsWho ? '#f97316' : '#22c55e',
                }}
              />
            </div>
          </div>
        ))}
        <div style={NOTE}>
          {intel.ranked.filter(r => r.exceedsWho).length} de {intel.ranked.length} distritos sobre la guía OMS 2021.
        </div>
      </div>

      {/* 3. Prevención */}
      <div style={{ ...CARD, borderColor: LEVEL_COLOR[intel.prevention.level] }}>
        <div style={H2}>🚦 Prevención: {intel.prevention.level.toUpperCase()}</div>
        <div style={{ fontSize: 12, marginBottom: 4 }}>{intel.prevention.rule}</div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          Probabilidad de episodio 24–48h: <strong style={{ color: 'var(--text)' }}>{Math.round(intel.prevention.probability * 100)}%</strong>
          {' · '}P(supera OMS): <strong style={{ color: 'var(--text)' }}>{Math.round(intel.pWho * 100)}%</strong>
        </div>
        <div style={{ fontSize: 12, marginTop: 6 }}>{intel.prevention.explanation}</div>
        <div style={NOTE}>{intel.prevention.method}</div>
      </div>

      {/* 4. Humo */}
      <div style={CARD}>
        <div style={H2}>🔥 Humo regional — ¿llega al valle?</div>
        {intel.sources && (
          <div style={{ fontSize: 12, marginBottom: 8 }}>
            Aporte estimado en {intel.worst?.district}: 🚗 {Math.round(intel.sources.traffic * 100)}% tráfico
            {' · '}🏭 {Math.round(intel.sources.industrial * 100)}% industria
            {' · '}🌫️ {Math.round(intel.sources.regional * 100)}% regional
          </div>
        )}
        {intel.foci.map(f => (
          <div key={f.id} style={{ fontSize: 12, marginBottom: 4 }}>
            <span style={{ color: '#fb923c' }}>●</span> {f.name} — {f.frp} MW (confianza {f.confidence})
            <span style={{ color: 'var(--text-muted)' }}> · trayectoria 12h hacia el valle dibujada en el mapa</span>
          </div>
        ))}
        <div style={NOTE}>
          Focos y trayectorias en modo demo (simulados) hasta integrar FIRMS/NASA. Método de fuentes: heurística didáctica.
        </div>
      </div>

      {/* 5. Mejor hora + ruta */}
      <div style={CARD}>
        <div style={H2}>🏃 Mejor hora para salir</div>
        <div style={{ display: 'flex', gap: 8 }}>
          {intel.best.map(b => (
            <div
              key={b.hour}
              style={{
                flex: 1,
                textAlign: 'center',
                background: 'rgba(139,92,246,0.12)',
                border: '1px solid var(--border)',
                borderRadius: 6,
                padding: 8,
              }}
            >
              <div style={{ fontSize: 16, fontWeight: 800 }}>{fmtHour(b.hour)}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{b.pm25} µg/m³</div>
            </div>
          ))}
        </div>
        <div style={{ fontSize: 12, marginTop: 8 }}>
          Ruta demo junto a {intel.worst?.district ?? '—'}: promedio{' '}
          <strong style={{ color: intel.exposure.color }}>{intel.exposure.avgPm25} µg/m³</strong>
          {' · '}dosis ~{intel.exposure.dose} µg/m³·h ({intel.exposure.level})
        </div>
        <div style={NOTE}>
          {intel.anomalies > 0
            ? `Se detectaron ${intel.anomalies} horas atípicas en la serie (posible evento externo, no hora pico normal).`
            : 'Sin horas atípicas en la serie actual.'}{' '}
          Fuente: {source}.
        </div>
      </div>
    </div>
  );
}

function worstPmLat(stations: IntelStation[], district: string): number {
  return stations.find(s => s.district === district)?.lat ?? 6.16;
}

function worstPmLon(stations: IntelStation[], district: string): number {
  return stations.find(s => s.district === district)?.lon ?? -75.58;
}