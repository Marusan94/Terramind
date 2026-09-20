/**
 * Air Quality + Environmental Dashboard.
 *
 * Adaptativo: las pestañas visibles dependen de las capas activas en el
 * sidebar. Si solo hay una capa activa, el dashboard muestra solo su info.
 * Datos: estaciones del valle (SIATA real cuando carga, simulado si no),
 * clima Open-Meteo, medidores y parques demo.
 */

import { useState, useEffect } from 'react';
import { AIR_QUALITY_STATIONS, generateRealisticData, calculateAQI } from '../data/stations';
import { generateHistoricalData, predictAQI, predictWeekly, seriesToHistory } from '../services/predictions';
import { LayerState, ALL_LAYERS_ON } from '../layers';
import { ValleyData, ValleyStation } from '../services/valley';
import IntelligenceTab from './IntelligenceTab';
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line,
  ScatterChart, Scatter, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Cell, ReferenceLine,
} from 'recharts';

const TOOLTIP_STYLE = {
  background: '#111111',
  border: '1px solid #2a2a2a',
  borderRadius: 6,
  fontSize: 12,
  color: '#e0e0e0',
};

/** Índice de vulnerabilidad por barrio (adaptación del prototipo Streamlit):
 * combina AQI normalizado, altitud (las zonas bajas atrapan contaminantes)
 * y carácter industrial del distrito. Escala 0-100. */
function vulnerabilityIndex(aqi: number, elevation: number, district: string): number {
  const aqiNorm = Math.min(aqi, 200) / 200;
  const elevFactor = Math.min(1, Math.max(0, (1800 - elevation) / 500));
  const industrial =
    district === 'Itagüí' ? 1 :
    district === 'Bello' ? 0.9 :
    district === 'La Candelaria' ? 0.8 : 0.5;
  return Math.round(100 * (0.55 * aqiNorm + 0.25 * elevFactor + 0.2 * industrial));
}

function vulnerabilityLabel(v: number): { label: string; color: string } {
  if (v < 30) return { label: 'Baja', color: '#22c55e' };
  if (v < 55) return { label: 'Moderada', color: '#eab308' };
  if (v < 75) return { label: 'Alta', color: '#f97316' };
  return { label: 'Muy alta', color: '#ef4444' };
}

type TabKey =
  | 'overview' | 'intel' | 'territory' | 'forecast' | 'stations' | 'science'
  | 'weather' | 'water' | 'vegetation' | 'explorer' | 'quality' | 'method';

interface AirDashboardProps {
  onClose: () => void;
  layers?: LayerState;
  valley?: ValleyData | null;
  airQualityData?: { aqi: number; pm25: number; category: string } | undefined;
  onConfigureAlerts?: () => void;
  onShare?: () => void;
}

function fallbackStations(): ValleyStation[] {
  return AIR_QUALITY_STATIONS.map(s => {
    const m = generateRealisticData(s);
    const aqi = calculateAQI(m.pm25, m.pm10, m.o3, m.no2);
    return {
      id: s.id, code: s.id, name: s.name, district: s.district,
      lat: s.lat, lon: s.lon, elevation: s.elevation,
      pm25: m.pm25, pm10: m.pm10, o3: m.o3, no2: m.no2,
      aqi: aqi.aqi, category: aqi.category, color: aqi.color,
      quality: 'SIMULATED' as const,
    };
  });
}

/** Serie sintética 24h claramente marcada (cuando no hay serie real SIATA). */
function synthSeries(base: number, seed: number): { t: number; pm25: number | null; flag: 'VALID' | 'SUSPECT' }[] {
  const now = Date.now();
  const out: { t: number; pm25: number | null; flag: 'VALID' | 'SUSPECT' }[] = [];
  for (let h = 23; h >= 0; h--) {
    const hour = new Date(now - h * 3600000).getHours();
    const rush = hour >= 7 && hour <= 9 ? 1.35 : hour >= 17 && hour <= 20 ? 1.45 : hour >= 0 && hour <= 5 ? 0.65 : 1.0;
    const wobble = Math.sin((hour + seed) * 1.7) * 0.12;
    const suspect = ((hour * 7 + seed * 13) % 23) === 0;
    out.push({
      t: now - h * 3600_000,
      pm25: Math.round(base * rush * (1 + wobble) * 10) / 10,
      flag: suspect ? 'SUSPECT' : 'VALID',
    });
  }
  return out;
}

/** Histórico real SIATA (vía seriesToHistory) de la primera estación con
 *  ≥12 puntos válidos; null si no hay → histórico demo. */
function pickHistory(
  series: Record<string, { t: number; pm25: number | null }[]>,
): { timestamp: number; aqi: number; pm25: number }[] | null {
  for (const key of Object.keys(series)) {
    const h = seriesToHistory(series[key]);
    if (h) return h;
  }
  return null;
}

/** Serie horaria real SIATA (últimas 24h) si hay ≥12 puntos válidos; si no, null. */
function pickRealHourly(
  series: Record<string, { t: number; pm25: number | null }[]>,
): { t: number; pm25: number | null }[] | null {
  for (const key of Object.keys(series)) {
    const s = series[key].slice(-24);
    if (s.filter(p => p.pm25 != null).length >= 12) {
      return s.map(p => ({ t: p.t, pm25: p.pm25 }));
    }
  }
  return null;
}

function downloadCsv(filename: string, rows: string[][]) {
  const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

const TH = { textAlign: 'left' as const, padding: 8, color: 'var(--text-muted)' };
const THC = { textAlign: 'center' as const, padding: 8, color: 'var(--text-muted)' };

export default function AirDashboard({ onClose, layers = ALL_LAYERS_ON, valley = null, airQualityData, onConfigureAlerts, onShare }: AirDashboardProps) {
  const [tab, setTab] = useState<TabKey>('overview');
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);
  const [expStation, setExpStation] = useState('');
  const [expPollutant, setExpPollutant] = useState<'pm25' | 'pm10' | 'o3' | 'no2'>('pm25');

  // Pestañas disponibles según capas activas
  const tabs: { key: TabKey; label: string; name: string }[] = [];
  if (layers.airQuality) {
    tabs.push(
      { key: 'overview', label: '📊', name: 'Resumen' },
      { key: 'intel', label: '🧠', name: 'Inteligencia' },
      { key: 'territory', label: '🗺️', name: 'Territorio' },
      { key: 'forecast', label: '🔮', name: 'Pronóstico' },
      { key: 'stations', label: '📍', name: 'Estaciones' },
      { key: 'science', label: '🔬', name: 'Científico' },
    );
  }
  if (layers.weather) tabs.push({ key: 'weather', label: '🌧', name: 'Clima' });
  if (layers.water) tabs.push({ key: 'water', label: '💧', name: 'Agua' });
  if (layers.vegetation) tabs.push({ key: 'vegetation', label: '🌳', name: 'Vegetación' });
  tabs.push(
    { key: 'explorer', label: '🧪', name: 'Explorar' },
    { key: 'quality', label: '✅', name: 'Calidad' },
    { key: 'method', label: '📖', name: 'Método' },
  );

  // Si la pestaña actual deja de estar disponible, salta a la primera
  useEffect(() => {
    if (!tabs.some(t => t.key === tab) && tabs.length) {
      setTab(tabs[0].key);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layers.airQuality, layers.weather, layers.water, layers.vegetation]);

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valley]);

  const loadData = () => {
    setLoading(true);

    const list = valley && valley.stations.length ? valley.stations : fallbackStations();
    const stationsData = list.map(s => ({
      id: s.id,
      name: s.name,
      district: s.district,
      elevation: s.elevation,
      aqi: s.aqi,
      category: s.category,
      color: s.color,
      pm25: s.pm25,
      pm10: s.pm10,
      o3: s.o3,
      no2: s.no2,
      quality: s.quality,
      coords: [s.lon, s.lat],
    }));
    if (!expStation && stationsData.length) {
      setExpStation(stationsData[Math.min(1, stationsData.length - 1)].id);
    }

    const ok = stationsData.filter((s: any) => s.quality !== 'MISSING');
    const base = ok.length ? ok : stationsData;
    const avg = (f: (s: any) => number) => Math.round(base.reduce((s: number, d: any) => s + f(d), 0) / base.length);

    // Pronóstico: serie REAL SIATA cuando hay ≥12 puntos válidos; si no, demo
    const realHistorical = valley?.series ? pickHistory(valley.series) : null;
    const historical = realHistorical ?? generateHistoricalData();
    const forecastReal = realHistorical !== null;
    const predictions = predictAQI(historical);
    const weekly = predictWeekly(historical);
    const hourly = (valley?.series ? pickRealHourly(valley.series) : null)
      ?? synthSeries(avg((s: any) => s.pm25), 3);

    setData({
      stations: stationsData,
      current: {
        aqi: avg((s: any) => s.aqi),
        pm25: avg((s: any) => s.pm25),
        pm10: avg((s: any) => s.pm10),
        o3: avg((s: any) => s.o3),
        no2: avg((s: any) => s.no2),
        category: calculateAQI(avg((s: any) => s.pm25), avg((s: any) => s.pm10), 45, 20).category,
        color: calculateAQI(avg((s: any) => s.pm25), avg((s: any) => s.pm10), 45, 20).color,
      },
      historical,
      predictions,
      weekly,
      forecastReal,
      hourly,
      lastUpdate: new Date(),
      source: valley ? `${valley.source} · ${valley.dataDate}` : 'Simulado (demo)',
    });

    setLoading(false);
  };

  const getStatusClass = (aqi: number) => {
    if (aqi <= 50) return 'good';
    if (aqi <= 100) return 'moderate';
    if (aqi <= 150) return 'warning';
    return 'danger';
  };

  if (loading || !data) {
    return (
      <div className="dashboard-overlay" onClick={onClose}>
        <div className="dashboard-view" onClick={e => e.stopPropagation()}>
          <div className="loading-dots" style={{ justifyContent: 'center', padding: 48 }}>
          <div className="loading-dot" />
          <div className="loading-dot" />
          <div className="loading-dot" />
        </div>
        </div>
      </div>
    );
  }

  // Chart datasets (recharts)
  const chart24h = data.historical.map((h: any) => ({
    hora: `${new Date(h.timestamp).getHours()}h`,
    aqi: h.aqi,
  }));
  const chartPred = data.predictions
    .filter((_: any, i: number) => i % 2 === 0)
    .map((p: any, i: number) => ({ hora: `+${i * 2}h`, aqi: p.aqi }));
  const chartStations = [...data.stations]
    .sort((a: any, b: any) => b.aqi - a.aqi)
    .map((s: any) => ({ name: s.district, aqi: s.aqi, color: s.color }));
  const chartScatter = data.stations.map((s: any) => ({
    x: s.elevation,
    y: s.aqi,
    name: s.district,
  }));
  const territory = [...data.stations]
    .map((s: any) => {
      const vuln = vulnerabilityIndex(s.aqi, s.elevation, s.district);
      return { ...s, vuln, ...vulnerabilityLabel(vuln) };
    })
    .sort((a: any, b: any) => b.vuln - a.vuln);

  // Peor variación 24h (con series reales cuando existen)
  const deltas = data.stations.map((s: any) => {
    const serie = valley?.series[s.id];
    let delta: number | null = null;
    if (serie && serie.length >= 2) {
      const vals = serie.filter(p => p.pm25 != null).map(p => p.pm25 as number);
      if (vals.length >= 2) delta = Math.round((vals[vals.length - 1] - vals[0]) * 10) / 10;
    }
    return { ...s, delta };
  }).sort((a: any, b: any) => (b.delta ?? -Infinity) - (a.delta ?? -Infinity));

  // Relaciones aire↔clima (humedad estimada por altitud + base Open-Meteo)
  const baseHum = valley?.weather?.humidity ?? 65;
  const relScatter = data.stations.map((s: any, i: number) => ({
    x: Math.round((baseHum + (s.elevation - 1500) * 0.008 + ((i * 37) % 11) - 5) * 10) / 10,
    y: s.pm25,
    name: s.district,
  }));

  // Data Explorer: serie de la estación seleccionada
  const expSt = data.stations.find((s: any) => s.id === expStation) ?? data.stations[0];
  const realSerie = expPollutant === 'pm25' ? valley?.series[expSt?.id] : undefined;
  const expRows = (realSerie && realSerie.length
    ? realSerie.map(r => ({ t: r.t, pm25: r.pm25, flag: r.flag as 'VALID' | 'SUSPECT' | 'MISSING' | 'SIMULATED' }))
    : synthSeries(expSt ? expSt[expPollutant] : 25, 3)
  ).slice(-24).reverse();
  const expReal = Boolean(realSerie && realSerie.length);

  const activeCount = [layers.airQuality, layers.weather, layers.water, layers.vegetation].filter(Boolean).length;

  return (
    <div className="dashboard-overlay" onClick={onClose}>
    <div className="dashboard-view" onClick={e => e.stopPropagation()}>
      {/* Tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              padding: '8px 16px',
              background: tab === t.key ? 'var(--accent)' : 'var(--bg-2)',
              border: `1px solid ${tab === t.key ? 'var(--accent)' : 'var(--border)'}`,
              borderRadius: 'var(--radius)',
              color: tab === t.key ? 'white' : 'var(--text)',
              cursor: 'pointer',
              fontSize: 13,
              fontFamily: 'var(--font)',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <span>{t.label}</span>
            <span>{t.name}</span>
          </button>
        ))}

        <div style={{ flex: 1 }} />

        <button
          onClick={onClose}
          aria-label="Cerrar dashboard"
          title="Cerrar"
          style={{
            padding: '8px 12px',
            background: 'var(--bg-2)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius)',
            color: 'var(--text-dim)',
            cursor: 'pointer',
            fontSize: 14,
            lineHeight: 1,
          }}
        >
          ×
        </button>
      </div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 14 }}>
        Fuente: {data.source}
        {activeCount === 1 && ' · Mostrando solo la capa activa'}
      </div>

      {/* OVERVIEW TAB */}
      {tab === 'overview' && (
        <div className="dashboard-grid">
          {/* Main AQI */}
          <div className="dashboard-card" style={{ gridColumn: 'span 2', textAlign: 'center', padding: 24 }}>
            <div className="dashboard-card-header" style={{ justifyContent: 'center' }}>
              <span className="dashboard-card-icon">🌬️</span>
              <span>Índice de Calidad del Aire</span>
            </div>
            <div className="aqi-gauge">
              <div className="aqi-value" style={{ color: data.current.color }}>
                {data.current.aqi}
              </div>
              <div className="aqi-label" style={{ color: data.current.color }}>
                {data.current.category}
              </div>
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 12 }}>
              Valle de Aburrá • Promedio de {data.stations.length} estaciones
            </div>
            {valley?.live && (
              <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 4 }}>
                Referencia actual CAMS: AQI {valley.live.aqi} · PM2.5 {valley.live.pm25} µg/m³
              </div>
            )}
          </div>

          {/* Pollutants */}
          <div className="dashboard-card">
            <div className="dashboard-card-header">
              <span className="dashboard-card-icon">🔬</span>
              <span>Contaminantes</span>
            </div>
            <div className="stat-grid">
              <div className="stat-item">
                <div className="stat-value" style={{ color: data.current.pm25 > 35 ? 'var(--orange)' : 'var(--green)' }}>
                  {data.current.pm25}
                </div>
                <div className="stat-label">PM2.5 µg/m³</div>
              </div>
              <div className="stat-item">
                <div className="stat-value">{data.current.pm10}</div>
                <div className="stat-label">PM10 µg/m³</div>
              </div>
              <div className="stat-item">
                <div className="stat-value" style={{ color: data.current.o3 > 100 ? 'var(--orange)' : 'var(--green)' }}>
                  {data.current.o3}
                </div>
                <div className="stat-label">O₃ µg/m³</div>
              </div>
              <div className="stat-item">
                <div className="stat-value">{data.current.no2}</div>
                <div className="stat-label">NO₂ µg/m³</div>
              </div>
            </div>
          </div>

          {/* 24h Chart */}
          <div className="dashboard-card">
            <div className="dashboard-card-header">
              <span className="dashboard-card-icon">📈</span>
              <span>Últimas 24 horas</span>
            </div>
            <ResponsiveContainer width="100%" height={140}>
              <AreaChart data={chart24h} margin={{ top: 4, right: 4, bottom: 0, left: -18 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="hora" interval={5} />
                <YAxis domain={[0, 200]} />
                <Tooltip contentStyle={TOOLTIP_STYLE} />
                <ReferenceLine y={50} stroke="#22c55e" strokeDasharray="4 4" />
                <ReferenceLine y={100} stroke="#eab308" strokeDasharray="4 4" />
                <Area type="monotone" dataKey="aqi" name="AQI" stroke="#8b5cf6" fill="#8b5cf6" fillOpacity={0.3} strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-muted)', padding: '0 8px' }}>
              <span>-24h</span>
              <span>Ahora</span>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="dashboard-card">
            <div className="dashboard-card-header">
              <span className="dashboard-card-icon">⚡</span>
              <span>Acciones Rápidas</span>
            </div>
            <div className="quick-actions">
              <button className="action-btn" onClick={onConfigureAlerts}>
                🔔 Configurar alertas
              </button>
              <button className="action-btn" onClick={onShare}>
                📤 Compartir reporte
              </button>
              <button
                className="action-btn"
                onClick={() => setTab('explorer')}
              >
                📊 Descargar datos
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TERRITORY TAB */}
      {tab === 'intel' && (
        <IntelligenceTab
          stations={data.stations.map((s: any) => ({
            id: s.id,
            district: s.district,
            pm25: s.pm25,
            pm10: s.pm10,
            o3: s.o3,
            no2: s.no2,
            elevation: s.elevation,
            lat: s.coords[1],
            lon: s.coords[0],
          }))}
          hourly={data.hourly}
          weather={valley?.weather ?? null}
          source={data.source}
        />
      )}

      {tab === 'territory' && (
        <div className="dashboard-grid">
          {/* Bar: AQI per district */}
          <div className="dashboard-card" style={{ gridColumn: 'span 2' }}>
            <div className="dashboard-card-header">
              <span className="dashboard-card-icon">🏘️</span>
              <span>AQI por municipio / distrito</span>
            </div>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={chartStations} margin={{ top: 4, right: 4, bottom: 0, left: -10 }} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" domain={[0, 200]} />
                <YAxis type="category" dataKey="name" width={90} />
                <Tooltip contentStyle={TOOLTIP_STYLE} />
                <ReferenceLine x={50} stroke="#22c55e" strokeDasharray="4 4" />
                <ReferenceLine x={100} stroke="#eab308" strokeDasharray="4 4" />
                <Bar dataKey="aqi" name="AQI" radius={[0, 4, 4, 0]}>
                  {chartStations.map((s: any, i: number) => (
                    <Cell key={i} fill={s.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Scatter: AQI vs elevation */}
          <div className="dashboard-card">
            <div className="dashboard-card-header">
              <span className="dashboard-card-icon">⛰️</span>
              <span>AQI vs altitud</span>
            </div>
            <ResponsiveContainer width="100%" height={220}>
              <ScatterChart margin={{ top: 4, right: 8, bottom: 0, left: -14 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" dataKey="x" name="Altitud" unit=" m" domain={['dataMin - 50', 'dataMax + 50']} />
                <YAxis type="number" dataKey="y" name="AQI" domain={[0, 200]} />
                <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ strokeDasharray: '3 3' }} />
                <Scatter data={chartScatter} fill="#8b5cf6" />
              </ScatterChart>
            </ResponsiveContainer>
            <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 8 }}>
              Las zonas bajas del valle (Bello, Itagüí) atrapan contaminantes por inversión térmica.
            </div>
          </div>

          {/* 24h movers */}
          <div className="dashboard-card" style={{ gridColumn: 'span 3' }}>
            <div className="dashboard-card-header">
              <span className="dashboard-card-icon">📉</span>
              <span>¿Qué municipios cambiaron en 24h? (PM2.5)</span>
            </div>
            <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  <th style={TH}>Municipio</th>
                  <th style={THC}>AQI</th>
                  <th style={THC}>Δ 24h PM2.5</th>
                  <th style={THC}>Tendencia</th>
                </tr>
              </thead>
              <tbody>
                {deltas.slice(0, 8).map((t: any) => (
                  <tr key={t.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: 8 }}>{t.district}</td>
                    <td style={{ textAlign: 'center', padding: 8, fontWeight: 600, color: t.color }}>{t.aqi}</td>
                    <td style={{ textAlign: 'center', padding: 8, color: 'var(--text-dim)' }}>
                      {t.delta == null ? 's/d' : `${t.delta > 0 ? '+' : ''}${t.delta}`}
                    </td>
                    <td style={{ textAlign: 'center', padding: 8 }}>
                      {t.delta == null ? '—' : t.delta > 1 ? '🔴 empeoró' : t.delta < -1 ? '🟢 mejoró' : '⚪ estable'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!valley?.series || !Object.keys(valley.series).length ? (
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8 }}>
                Sin serie histórica real: conecta SIATA para activar este análisis.
              </div>
            ) : null}
          </div>

          {/* Vulnerability ranking */}
          <div className="dashboard-card" style={{ gridColumn: 'span 3' }}>
            <div className="dashboard-card-header">
              <span className="dashboard-card-icon">⚠️</span>
              <span>Ranking de vulnerabilidad por territorio</span>
            </div>
            <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  <th style={TH}>Municipio</th>
                  <th style={THC}>AQI</th>
                  <th style={THC}>Altitud</th>
                  <th style={THC}>Índice</th>
                  <th style={THC}>Nivel</th>
                </tr>
              </thead>
              <tbody>
                {territory.map((t: any) => (
                  <tr key={t.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: 8 }}>{t.district}</td>
                    <td style={{ textAlign: 'center', padding: 8, fontWeight: 600, color: t.color }}>{t.aqi}</td>
                    <td style={{ textAlign: 'center', padding: 8, color: 'var(--text-dim)' }}>{t.elevation} m</td>
                    <td style={{ textAlign: 'center', padding: 8, fontWeight: 700, fontFamily: 'var(--font-mono)' }}>{t.vuln}</td>
                    <td style={{ textAlign: 'center', padding: 8 }}>
                      <span className="badge" style={{ borderColor: t.color, color: t.color }}>{t.label}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* FORECAST TAB */}
      {tab === 'forecast' && (
        <div className="dashboard-grid">
          {/* 48h Prediction */}
          <div className="dashboard-card" style={{ gridColumn: 'span 2' }}>
            <div className="dashboard-card-header">
              <span className="dashboard-card-icon">🔮</span>
              <span>Pronóstico 48 horas</span>
              <span style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 400 }}>
                {data.forecastReal ? '· desde serie real SIATA' : '· serie demo'}
              </span>
            </div>
            <ResponsiveContainer width="100%" height={170}>
              <LineChart data={chartPred} margin={{ top: 4, right: 4, bottom: 0, left: -18 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="hora" interval={3} />
                <YAxis domain={[0, 200]} />
                <Tooltip contentStyle={TOOLTIP_STYLE} />
                <ReferenceLine y={50} stroke="#22c55e" strokeDasharray="4 4" />
                <ReferenceLine y={100} stroke="#eab308" strokeDasharray="4 4" />
                <Line type="monotone" dataKey="aqi" name="AQI" stroke="#06b6d4" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-muted)', padding: '0 8px' }}>
              <span>Ahora</span>
              <span>+48h</span>
            </div>
          </div>

          {/* Weekly */}
          <div className="dashboard-card" style={{ gridColumn: 'span 2' }}>
            <div className="dashboard-card-header">
              <span className="dashboard-card-icon">📅</span>
              <span>Pronóstico Semanal</span>
              <span style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 400 }}>
                {data.forecastReal ? '· desde serie real SIATA' : '· serie demo'}
              </span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {data.weekly.map((day: any, i: number) => {
                const color = day.avgAqi <= 50 ? 'var(--green)' : day.avgAqi <= 100 ? 'var(--yellow)' : day.avgAqi <= 150 ? 'var(--orange)' : 'var(--red)';
                const width = Math.min(100, day.avgAqi);
                return (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 80, fontSize: 13, fontWeight: 500 }}>{day.dayName}</div>
                    <div style={{ flex: 1, height: 24, background: 'var(--bg-3)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
                      <div style={{ width: `${width}%`, height: '100%', background: color, borderRadius: 'var(--radius)' }} />
                    </div>
                    <div style={{ width: 40, fontSize: 14, fontWeight: 700, color, textAlign: 'right' }}>{day.avgAqi}</div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* STATIONS TAB */}
      {tab === 'stations' && (
        <div className="dashboard-grid">
          {[...data.stations].sort((a: any, b: any) => b.aqi - a.aqi).map((station: any) => (
            <div key={station.id} className="dashboard-card">
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                <div style={{
                  width: 56,
                  height: 56,
                  borderRadius: '50%',
                  background: `${station.color}20`,
                  border: `3px solid ${station.color}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 18,
                  fontWeight: 700,
                  color: station.color,
                }}>
                  {station.aqi}
                </div>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{station.district}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{station.name}</div>
                </div>
              </div>
              <div className={`badge ${getStatusClass(station.aqi)}`} style={{ marginBottom: 8 }}>
                {station.category}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 12 }}>
                <div>PM2.5: <strong>{station.pm25}</strong></div>
                <div>PM10: <strong>{station.pm10}</strong></div>
                <div>O₃: <strong>{station.o3}</strong></div>
                <div>NO₂: <strong>{station.no2}</strong></div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* SCIENCE TAB */}
      {tab === 'science' && (
        <div className="dashboard-grid">
          <div className="dashboard-card" style={{ gridColumn: 'span 2' }}>
            <div className="dashboard-card-header">
              <span className="dashboard-card-icon">🔬</span>
              <span>Metodología</span>
            </div>
            <div style={{ fontSize: 13, lineHeight: 1.7, color: 'var(--text)' }}>
              <p style={{ marginBottom: 12 }}>
                El <strong>Índice de Calidad del Aire (AQI)</strong> se calcula usando la metodología de la EPA de EE.UU.
                y las directrices de la OMS para protección de la salud.
              </p>
              <p style={{ marginBottom: 12 }}>
                <strong>Contaminantes monitoreados:</strong><br/>
                • <strong>PM2.5</strong>: Partículas &lt;2.5µm - penetran alveolos<br/>
                • <strong>PM10</strong>: Partículas &lt;10µm - irritación respiratoria<br/>
                • <strong>O₃</strong>: Ozono troposférico - smog fotoquímico<br/>
                • <strong>NO₂</strong>: Vehículos y fábricas
              </p>
              <p>
                <strong>Modelo:</strong> Regresión lineal con patrones horarios y tendencias históricas.
                Intervalo de confianza del 95%.
              </p>
            </div>
          </div>

          <div className="dashboard-card">
            <div className="dashboard-card-header">
              <span className="dashboard-card-icon">📋</span>
              <span>Estándares WHO vs Actual</span>
            </div>
            <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  <th style={TH}>Contaminante</th>
                  <th style={THC}>Actual</th>
                  <th style={THC}>Límite OMS</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { name: 'PM2.5', actual: data.current.pm25, who: 15 },
                  { name: 'PM10', actual: data.current.pm10, who: 45 },
                  { name: 'O₃', actual: data.current.o3, who: 60 },
                  { name: 'NO₂', actual: data.current.no2, who: 25 },
                ].map(p => (
                  <tr key={p.name} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: 8 }}>{p.name}</td>
                    <td style={{ textAlign: 'center', padding: 8, fontWeight: 600, color: p.actual > p.who ? 'var(--orange)' : 'var(--green)' }}>
                      {p.actual} µg/m³
                    </td>
                    <td style={{ textAlign: 'center', padding: 8, color: 'var(--text-muted)' }}>{p.who} µg/m³</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="dashboard-card">
            <div className="dashboard-card-header">
              <span className="dashboard-card-icon">🏛️</span>
              <span>Políticas Públicas</span>
            </div>
            <div style={{ fontSize: 12, lineHeight: 1.7 }}>
              <div style={{ marginBottom: 8 }}>
                <strong style={{ color: 'var(--accent)' }}>Pico y Placa Ambiental</strong><br/>
                Restricción vehicular par/impar. Reduce 20% emisiones.
              </div>
              <div style={{ marginBottom: 8 }}>
                <strong style={{ color: 'var(--accent)' }}>Zonas de Baja Emisión</strong><br/>
                Centro histórico: solo vehículos limpios.
              </div>
              <div>
                <strong style={{ color: 'var(--accent)' }}>Plan de Descontaminación</strong><br/>
                Meta: AQI &lt;50 para 2030.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* WEATHER TAB */}
      {tab === 'weather' && (
        <div className="dashboard-grid">
          <div className="dashboard-card" style={{ gridColumn: 'span 2' }}>
            <div className="dashboard-card-header">
              <span className="dashboard-card-icon">🌧</span>
              <span>Clima actual — Valle de Aburrá</span>
            </div>
            {valley?.weather ? (
              <div className="stat-grid">
                <div className="stat-item">
                  <div className="stat-value">{Math.round(valley.weather.temp)}°C</div>
                  <div className="stat-label">Temperatura</div>
                </div>
                <div className="stat-item">
                  <div className="stat-value">{valley.weather.humidity}%</div>
                  <div className="stat-label">Humedad</div>
                </div>
                <div className="stat-item">
                  <div className="stat-value">{valley.weather.precipProb}%</div>
                  <div className="stat-label">Prob. lluvia (próx. hora)</div>
                </div>
                <div className="stat-item" style={{ gridColumn: 'span 2' }}>
                  <div style={{ fontSize: 15 }}>{valley.weather.emoji} {valley.weather.label}</div>
                  <div className="stat-label">Condición (Open-Meteo)</div>
                </div>
              </div>
            ) : (
              <div style={{ fontSize: 13, color: 'var(--text-dim)' }}>Clima no disponible (sin conexión).</div>
            )}
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 10 }}>
              El radar de lluvia se ve sobre el mapa (capa Clima activa) · Fuente: RainViewer + Open-Meteo.
            </div>
          </div>

          <div className="dashboard-card" style={{ gridColumn: 'span 2' }}>
            <div className="dashboard-card-header">
              <span className="dashboard-card-icon">🌧</span>
              <span>¿Lloverá? — próximas 12 horas (Open-Meteo)</span>
            </div>
            {(valley?.weather?.hourly ?? []).length > 0 ? (
              <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 4 }}>
                {(valley?.weather?.hourly ?? []).map(h => {
                  const d = new Date(h.time);
                  const hh = Number.isNaN(d.getTime())
                    ? h.time.slice(11, 16)
                    : `${d.getHours().toString().padStart(2, '0')}:00`;
                  const wet = h.precipProb >= 40;
                  return (
                    <div key={h.time} style={{
                      minWidth: 56, textAlign: 'center', padding: '6px 4px', borderRadius: 8,
                      background: wet ? 'rgba(56,189,248,0.15)' : 'var(--bg-3)',
                      border: wet ? '1px solid #38bdf8' : '1px solid transparent',
                    }}>
                      <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>{hh}</div>
                      <div style={{ fontSize: 15, fontWeight: 800, color: wet ? '#38bdf8' : 'var(--text)' }}>
                        {h.precipProb}%
                      </div>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{h.precip} mm</div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div style={{ fontSize: 13, color: 'var(--text-dim)' }}>
                Pronóstico horario no disponible (sin conexión a Open-Meteo).
              </div>
            )}
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8 }}>
              ≥40% sombreado azul = lleva sombrilla. La lluvia lava el PM2.5 del aire.
            </div>
          </div>

          {layers.airQuality && (
            <div className="dashboard-card" style={{ gridColumn: 'span 2' }}>
              <div className="dashboard-card-header">
                <span className="dashboard-card-icon">🔗</span>
                <span>Relación: PM2.5 vs humedad por estación</span>
              </div>
              <ResponsiveContainer width="100%" height={200}>
                <ScatterChart margin={{ top: 4, right: 8, bottom: 0, left: -14 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" dataKey="x" name="Humedad" unit=" %" />
                  <YAxis type="number" dataKey="y" name="PM2.5" unit=" µg/m³" />
                  <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ strokeDasharray: '3 3' }} />
                  <Scatter data={relScatter} fill="#38bdf8" />
                </ScatterChart>
              </ResponsiveContainer>
              <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 8 }}>
                Humedad: base Open-Meteo + variación estimada por altitud. La lluvia lava partículas: a más
                humedad/lluvia suele bajar el PM2.5.
              </div>
            </div>
          )}
        </div>
      )}

      {/* WATER TAB */}
      {tab === 'water' && (
        <div className="dashboard-grid">
          <div className="dashboard-card" style={{ gridColumn: 'span 3' }}>
            <div className="dashboard-card-header">
              <span className="dashboard-card-icon">💧</span>
              <span>Niveles de agua — SIATA Geoportal (en vivo)</span>
            </div>
            {(valley?.gauges ?? []).some(g => g.alert) && (
              <div className="badge danger" style={{ marginBottom: 8 }}>
                ⚠ {(valley?.gauges ?? []).filter(g => g.alert).length} punto(s) sobre el nivel de
                precaución oficial — revisa la tabla
              </div>
            )}
            <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  <th style={TH}>Punto</th>
                  <th style={TH}>Cauce</th>
                  <th style={THC}>Nivel (m)</th>
                  <th style={THC}>Umbral (m)</th>
                  <th style={THC}>Tendencia</th>
                  <th style={THC}>Estado</th>
                </tr>
              </thead>
              <tbody>
                {(valley?.gauges ?? []).map(g => (
                  <tr key={g.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: 8 }}>{g.name}</td>
                    <td style={{ padding: 8, color: 'var(--text-dim)' }}>{g.river}</td>
                    <td style={{ textAlign: 'center', padding: 8, fontWeight: 700, fontFamily: 'var(--font-mono)' }}>
                      {g.level.toFixed(2)}
                    </td>
                    <td style={{ textAlign: 'center', padding: 8, color: 'var(--text-dim)' }}>
                      {g.precaution != null ? g.precaution.toFixed(2) : '—'}
                    </td>
                    <td style={{ textAlign: 'center', padding: 8 }}>
                      {g.trend === 'up' ? '↗ subiendo' : g.trend === 'down' ? '↘ bajando' : '→ estable'}
                    </td>
                    <td style={{ textAlign: 'center', padding: 8 }}>
                      {g.alert
                        ? <span className="badge danger">⚠ sobre precaución</span>
                        : <span className="badge good">normal</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8 }}>
              Nivel actual vs umbral oficial de precaución del Geoportal SIATA (se actualiza ~cada
              30 min). 4 puntos: río de sur a norte + Q. La Iguana. En el mapa el marcador se pone
              rojo al superar el umbral.
              {(valley?.gauges ?? []).length === 0 && ' Sin datos en este momento.'}
            </div>
          </div>
        </div>
      )}

      {/* VEGETATION TAB */}
      {tab === 'vegetation' && (
        <div className="dashboard-grid">
          {(valley?.parks ?? []).map(p => (
            <div key={p.id} className="dashboard-card">
              <div className="dashboard-card-header">
                <span className="dashboard-card-icon">🌳</span>
                <span>{p.name}</span>
              </div>
              {p.real && p.ndvi === 0 ? (
                <>
                  <div style={{ fontSize: 28, fontWeight: 800, color: '#9ca3af' }}>n/d</div>
                  <div className="stat-label" style={{ marginBottom: 8 }}>
                    NDVI pendiente (Copernicus) · ubicación real OSM
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8 }}>
                    El punto y el nombre son reales. El número de vegetación llega con el satélite;
                    mientras tanto el círculo del mapa solo marca el área verde.
                  </div>
                </>
              ) : (
                <>
                  <div style={{ fontSize: 28, fontWeight: 800, color: p.ndvi > 0.6 ? '#4ade80' : '#eab308' }}>
                    {p.ndvi.toFixed(2)}
                  </div>
                  <div className="stat-label" style={{ marginBottom: 8 }}>NDVI (demo)</div>
                  <div style={{ height: 10, background: 'var(--bg-3)', borderRadius: 5, overflow: 'hidden' }}>
                    <div style={{ width: `${Math.round(p.ndvi * 100)}%`, height: '100%', background: '#22c55e' }} />
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8 }}>
                    NDVI 0 = sin vegetación · 1 = vegetación densa. Valores de demostración.
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      {/* EXPLORER TAB */}
      {tab === 'explorer' && (
        <div className="dashboard-grid">
          <div className="dashboard-card" style={{ gridColumn: 'span 3' }}>
            <div className="dashboard-card-header">
              <span className="dashboard-card-icon">🧪</span>
              <span>Data Explorer {expReal ? '— serie real SIATA' : '— serie sintética (demo)'}</span>
            </div>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
              <label style={{ fontSize: 12, color: 'var(--text-dim)' }}>
                Estación{' '}
                <select
                  value={expStation}
                  onChange={e => setExpStation(e.target.value)}
                  style={{ background: 'var(--bg-2)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 6, padding: '6px 10px', fontSize: 12 }}
                >
                  {data.stations.map((s: any) => (
                    <option key={s.id} value={s.id}>{s.district} — {s.name}</option>
                  ))}
                </select>
              </label>
              <label style={{ fontSize: 12, color: 'var(--text-dim)' }}>
                Contaminante{' '}
                <select
                  value={expPollutant}
                  onChange={e => setExpPollutant(e.target.value as any)}
                  style={{ background: 'var(--bg-2)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 6, padding: '6px 10px', fontSize: 12 }}
                >
                  <option value="pm25">PM2.5</option>
                  <option value="pm10">PM10</option>
                  <option value="o3">O₃</option>
                  <option value="no2">NO₂</option>
                </select>
              </label>
              <button
                className="action-btn"
                onClick={() => {
                  const st = data.stations.find((s: any) => s.id === expStation);
                  const header = ['station', 'district', 'pollutant', 'timestamp_iso', 'value', 'quality'];
                  const rows = expRows.map(r => [
                    st?.name ?? expStation, st?.district ?? '', expPollutant,
                    new Date(r.t).toISOString(), r.pm25 ?? '', r.flag,
                  ]);
                  downloadCsv(`terramind-${expStation}-${expPollutant}.csv`, [header, ...rows]);
                }}
              >
                ⬇ Descargar CSV
              </button>
            </div>
            <div style={{ maxHeight: 320, overflowY: 'auto' }}>
              <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    <th style={TH}>Timestamp</th>
                    <th style={THC}>Valor (µg/m³)</th>
                    <th style={THC}>Calidad</th>
                  </tr>
                </thead>
                <tbody>
                  {expRows.map((r, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: 6, fontFamily: 'var(--font-mono)', fontSize: 11 }}>
                        {new Date(r.t).toLocaleString('es-CO', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td style={{ textAlign: 'center', padding: 6, fontWeight: 600 }}>
                        {r.pm25 == null ? '—' : r.pm25}
                      </td>
                      <td style={{ textAlign: 'center', padding: 6 }}>
                        <span className="badge" style={{
                          borderColor: r.flag === 'VALID' ? '#22c55e' : r.flag === 'SUSPECT' ? '#eab308' : '#6b7280',
                          color: r.flag === 'VALID' ? '#22c55e' : r.flag === 'SUSPECT' ? '#eab308' : '#9ca3af',
                        }}>
                          {r.flag}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8 }}>
              Últimas 24 mediciones horarias. Export Parquet disponible en la fase de API (backend).
            </div>
          </div>
        </div>
      )}

      {/* QUALITY TAB */}
      {tab === 'quality' && (
        <div className="dashboard-grid">
          <div className="dashboard-card" style={{ gridColumn: 'span 2' }}>
            <div className="dashboard-card-header">
              <span className="dashboard-card-icon">✅</span>
              <span>Data Quality</span>
            </div>
            {(() => {
              const q = valley?.quality ?? { valid: 0, missing: 0, simulated: data.stations.length };
              const total = q.valid + q.missing + q.simulated;
              const pct = (n: number) => total ? `${Math.round(n / total * 1000) / 10}%` : '—';
              const online = data.stations.filter((s: any) => s.quality !== 'MISSING').length;
              const rows: [string, string, string][] = [
                ['Registros válidos', String(q.valid), pct(q.valid)],
                ['Valores faltantes (-9999)', String(q.missing), pct(q.missing)],
                ['Registros simulados', String(q.simulated), pct(q.simulated)],
                ['Estaciones en línea', `${online}/${data.stations.length}`, total ? `${Math.round(online / data.stations.length * 100)}%` : '—'],
              ];
              return (
                <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                  <tbody>
                    {rows.map(([k, v, p]) => (
                      <tr key={k} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: 8 }}>{k}</td>
                        <td style={{ textAlign: 'right', padding: 8, fontWeight: 700, fontFamily: 'var(--font-mono)' }}>{v}</td>
                        <td style={{ textAlign: 'right', padding: 8, color: 'var(--text-dim)' }}>{p}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              );
            })()}
          </div>

          <div className="dashboard-card">
            <div className="dashboard-card-header">
              <span className="dashboard-card-icon">💚</span>
              <span>Data Health</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 12 }}>
              {[
                { name: 'SIATA (histórico)', ok: Boolean(valley && Object.keys(valley.series).length), sub: valley ? valley.dataDate : 'no cargado' },
                { name: 'Open-Meteo CAMS (actual)', ok: Boolean(valley?.live), sub: valley?.live ? `AQI ${valley.live.aqi}` : 'no disponible' },
                { name: 'Open-Meteo clima', ok: Boolean(valley?.weather), sub: valley?.weather ? `${Math.round(valley.weather.temp)}°C` : 'no disponible' },
                { name: 'Radar RainViewer', ok: layers.weather, sub: layers.weather ? 'capa activa' : 'capa apagada' },
                { name: 'Chat IA (Groq/Gemini)', ok: true, sub: 'cadena multi-proveedor' },
              ].map(r => (
                <div key={r.name} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span>{r.ok ? '🟢' : '🔴'}</span>
                  <div>
                    <div style={{ fontWeight: 600 }}>{r.name}</div>
                    <div style={{ color: 'var(--text-muted)', fontSize: 11 }}>{r.sub}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* METHOD TAB */}
      {tab === 'method' && (
        <div className="dashboard-grid">
          <div className="dashboard-card" style={{ gridColumn: 'span 2' }}>
            <div className="dashboard-card-header">
              <span className="dashboard-card-icon">📖</span>
              <span>¿Cómo calculamos esto?</span>
            </div>
            <div style={{ fontSize: 12, lineHeight: 1.7 }}>
              <p style={{ marginBottom: 10 }}>
                <strong>AQI (EPA EE.UU.):</strong> interpolación lineal por tramos sobre PM2.5 —
                0–12 → 0–50 (Bueno) · 12.1–35.4 → 51–100 (Moderado) · 35.5–55.4 → 101–150
                (Sensible) · 55.5–150.4 → 151–200 (Insalubre). Unidades: µg/m³.
              </p>
              <p style={{ marginBottom: 10 }}>
                <strong>Banderas de calidad SIATA:</strong> valor <code>-9999</code> = faltante o
                mala calidad (se excluye de promedios). En dumps históricos, flag numérico
                ≤ 2.5 = bueno, ≥ 2.6 = no calificado. Aquí: VALID / MISSING / SIMULATED.
              </p>
              <p style={{ marginBottom: 10 }}>
                <strong>Vulnerabilidad territorial:</strong> 55% AQI normalizado + 25% factor
                altitud (zonas bajas atrapan contaminantes) + 20% carácter industrial.
              </p>
              <p>
                <strong>Hotspots y ML (fase siguiente):</strong> grilla hexagonal + agregación
                espacial para hotspots; baselines (persistencia, XGBoost) antes de LSTM;
                pronóstico siempre con intervalo esperado, nunca un número seco.
              </p>
            </div>
          </div>

          <div className="dashboard-card">
            <div className="dashboard-card-header">
              <span className="dashboard-card-icon">🗂️</span>
              <span>Fuentes y linaje</span>
            </div>
            <div style={{ fontSize: 12, lineHeight: 1.9 }}>
              SIATA dumps públicos → Validado → App<br/>
              Open-Meteo CAMS → Actual (modelo)<br/>
              RainViewer → Radar lluvia<br/>
              Simulador local → Respaldo demo<br/>
              <span style={{ color: 'var(--text-muted)' }}>
                La fuente activa siempre se muestra bajo las pestañas.
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
    </div>
  );
}
