/**
 * Terramind - Calidad del Aire Valle de Aburrá
 * Cursor-inspired dark theme
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import AirMap from './components/AirMap';
import AirDashboard from './components/AirDashboard';
import RagLibrary from './components/RagLibrary';
import AirQualityOverview from './components/AirQualityOverview';
import ChatWidget from './components/ChatWidget';
import AlertsPanel from './components/AlertsPanel';
import AuthPrompt from './components/AuthPrompt';
import { hasSeenAuthPrompt, loadAuth } from './services/auth';
import { GraphModal, ArchitectureModal } from './components/SystemViews';
import { AIR_QUALITY_STATIONS, generateRealisticData, calculateAQI } from './data/stations';
import { loadValleyData, ValleyData } from './services/valley';
import { LayerState, ALL_LAYERS_ON } from './layers';
import { estimateMixingHeightM, mixingState, demoSmokeFoci, trajectory } from './services/intelligence';
import type { SmokeFocus } from './services/intelligence';
import { loadFireFoci } from './services/fires';
import { shareReport, type ShareSnapshot } from './services/share';
import { loadAlerts, evaluateAlerts, maybeNotify, type StationLike } from './services/alerts';
import './styles/theme.css';

if ('serviceWorker' in navigator) {
  if (import.meta.env.PROD) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    });
  } else {
    // En desarrollo: eliminar SWs viejos que servirían caché obsoleta
    navigator.serviceWorker.getRegistrations()
      .then(regs => regs.forEach(r => r.unregister()))
      .catch(() => {});
  }
}

export default function App() {
  const [layers, setLayers] = useState<LayerState>(ALL_LAYERS_ON);

  const [stats, setStats] = useState({
    avgAqi: 0,
    avgPm25: 0,
    avgPm10: 0,
    category: '',
    color: '',
    generatedAt: 0,
    source: 'Cargando…',
    dataDate: '',
  });
  const [valley, setValley] = useState<ValleyData | null>(null);

  const [selectedStation, setSelectedStation] = useState<any>(null);
  void selectedStation; // reserved

  const [dashboardOpen, setDashboardOpen] = useState(false);
  const [ragOpen, setRagOpen] = useState(false);
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [graphOpen, setGraphOpen] = useState(false);
  const [archOpen, setArchOpen] = useState(false);
  // Sugerencia de registro: una sola vez, solo si no tiene cuenta.
  const [authPromptOpen, setAuthPromptOpen] = useState(false);

  useEffect(() => {
    if (!hasSeenAuthPrompt() && !loadAuth()) {
      const t = window.setTimeout(() => setAuthPromptOpen(true), 1200);
      return () => window.clearTimeout(t);
    }
  }, []);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState('');
  const [commandMode, setCommandMode] = useState(() => {
    try {
      return localStorage.getItem('terramind-theme') === 'command';
    } catch {
      return false;
    }
  });

  // Estaciones mapeadas para alertas (solo las que tienen AQI válido)
  const stationsForAlerts = useMemo<StationLike[]>(() => {
    if (!valley?.stations) return [];
    return valley.stations
      .filter(s => s.quality !== 'MISSING')
      .map(s => ({ name: s.name, district: s.district, aqi: s.aqi }));
  }, [valley?.stations]);

  // Evalúa alertas al cambiar datos o config
  useEffect(() => {
    const cfg = loadAlerts();
    if (!cfg.enabled) return;
    const hits = evaluateAlerts(stationsForAlerts, stats.avgAqi, cfg);
    if (hits.length > 0) {
      void maybeNotify(hits, cfg);
    }
  }, [stats.avgAqi, stationsForAlerts, valley?.updatedAt]);

  useEffect(() => {
    document.body.classList.toggle('command-mode', commandMode);
    try {
      localStorage.setItem('terramind-theme', commandMode ? 'command' : 'cursor');
    } catch {
      // almacenamiento no disponible: el modo igual aplica en sesión
    }
  }, [commandMode]);

  // Aplica datos del valle al estado (reutilizado por carga inicial y refresh manual)
  const applyValley = useCallback((v: ValleyData) => {
    setValley(v);
    const valid = v.stations.filter(s => s.quality !== 'MISSING');
    const base = valid.length ? valid : v.stations;
    const aqi = Math.round(base.reduce((s, s2) => s + s2.aqi, 0) / base.length);
    const pm25 = Math.round(base.reduce((s, s2) => s + s2.pm25, 0) / base.length * 10) / 10;
    const pm10 = Math.round(base.reduce((s, s2) => s + s2.pm10, 0) / base.length * 10) / 10;
    const info = calculateAQI(pm25, pm10, 45, 20);
    setStats({
      avgAqi: aqi,
      avgPm25: pm25,
      avgPm10: pm10,
      category: info.category,
      color: info.color,
      generatedAt: v.updatedAt,
      source: v.source,
      dataDate: v.dataDate,
    });
  }, []);

  // Recarga datos en vivo (SIATA + Open-Meteo + Geoportal); si falla, conserva lo mostrado
  const refreshLive = useCallback(async () => {
    setRefreshing(true);
    setRefreshError('');
    try {
      const v = await loadValleyData();
      setFires(await loadFireFoci());
      if (!v.stations.length) {
        setRefreshError('Sin estaciones: revisa tu conexión e intenta de nuevo.');
        return;
      }
      applyValley(v);
    } catch {
      setRefreshError('No se pudo actualizar (sin red o fuentes caídas). Se conserva lo anterior.');
    } finally {
      setRefreshing(false);
    }
  }, [applyValley]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setDashboardOpen(false); setRagOpen(false); setAlertsOpen(false); setGraphOpen(false); setArchOpen(false); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    // 1) Respaldo sincrónico inmediato (simulado) para pintar ya
    const stationData = AIR_QUALITY_STATIONS.map(station => {
      const data = generateRealisticData(station);
      return { data };
    });

    const avgAqi = Math.round(stationData.reduce((s, d) => {
      const aqiInfo = calculateAQI(d.data.pm25, d.data.pm10, d.data.o3, d.data.no2);
      return s + aqiInfo.aqi;
    }, 0) / stationData.length);

    const avgPm25 = Math.round(stationData.reduce((s, d) => s + d.data.pm25, 0) / stationData.length);
    const avgPm10 = Math.round(stationData.reduce((s, d) => s + d.data.pm10, 0) / stationData.length * 10) / 10;
    const avgInfo = calculateAQI(avgPm25, avgPm25 * 1.5, 45, 20);

    setStats({
      avgAqi,
      avgPm25,
      avgPm10,
      category: avgInfo.category,
      color: avgInfo.color,
      generatedAt: Date.now(),
      source: 'Simulado (demo)',
      dataDate: 'simulación local',
    });

    // 2) Datos reales en segundo plano (SIATA + Open-Meteo); si falla, queda el respaldo
    void refreshLive();
  }, [refreshLive]);

  const toggleLayer = (key: keyof LayerState) => {
    setLayers(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const getAqiBadgeClass = (aqi: number) => {
    if (aqi <= 50) return 'good';
    if (aqi <= 100) return 'moderate';
    if (aqi <= 150) return 'warning';
    return 'danger';
  };

  // Capa inteligente: techo estimado + focos FIRMS reales (demo si no hay key/red).
  // null = aún sin intentar; [] = real sin incendios; demo = respaldo etiquetado.
  const [fires, setFires] = useState<SmokeFocus[] | null>(null);
  const intel = useMemo(() => {
    const hour = new Date().getHours();
    const mixingM = estimateMixingHeightM(hour, 2.5);
    const ms = mixingState(mixingM);
    const foci = fires ?? demoSmokeFoci();
    const smoke = foci.map(f => ({
      id: f.id,
      name: f.name,
      lat: f.lat,
      lon: f.lon,
      path: trajectory(f.lat, f.lon, 70, 2.5, 12),
    }));
    return { mixingLabel: mixingM + ' m · ' + ms.label, smoke, smokeReal: fires !== null };
  }, [fires]);

  // Alerta de lluvia: probabilidad alta en Open-Meteo o medidores en alerta
  const hasRainAlert = Boolean(
    (valley?.weather?.precipProb ?? 0) >= 70 ||
    valley?.gauges?.some(g => g.alert)
  );

  // Manejador para compartir reporte
  const handleShare = async () => {
    const snap: ShareSnapshot = {
      avgAqi: stats.avgAqi,
      avgPm25: stats.avgPm25,
      avgPm10: stats.avgPm10,
      category: stats.category,
      generatedAt: stats.generatedAt,
      source: stats.source,
      dataDate: stats.dataDate,
      stations: valley?.stations.length ?? AIR_QUALITY_STATIONS.length,
    };
    const result = await shareReport(snap);
    const msg = result === 'shared' ? 'Compartido ✓' : result === 'copied' ? 'Copiado al portapapeles ✓' : 'No se pudo compartir';
    alert(msg);
  };

  return (
    <div className="app">
      {/* Sidebar */}
      <aside className={`sidebar ${sidebarOpen ? '' : 'collapsed'}`}>
        <div className="sidebar-header">
          <div className="sidebar-logo">T</div>
          <div className="sidebar-title">Terramind</div>
          <div className="sidebar-badge">v1.0</div>
          <button className="sidebar-collapse" onClick={() => setSidebarOpen(false)} title="Ocultar panel">
            ◀
          </button>
        </div>

        {/* Status Badges */}
        <div className="badges">
          <div className={`badge ${getAqiBadgeClass(stats.avgAqi)}`}>
            🌫 AQI {stats.avgAqi}
          </div>
          <div className="badge">
            🌫 {stats.avgPm25} µg/m³
          </div>
          {hasRainAlert && <div className="badge danger">⚠️ Lluvia</div>}
        </div>
        <div
          className="sidebar-source"
          title="Cómo se actualiza: al abrir y con ↻ Actualizar se piden SIATA (histórico), Open-Meteo CAMS (actual) y Geoportal SIATA (niveles). Sin red se usa respaldo simulado etiquetado."
        >
          Fuente: {stats.source} · {stats.dataDate}
        </div>

        {/* Layers */}
        <div className="section">Capas</div>
        <div className="layers">
          <div 
            className={`layer ${layers.airQuality ? 'active' : ''}`}
            onClick={() => toggleLayer('airQuality')}
          >
            <span className="layer-icon">🌫</span>
            <span className="layer-name">Calidad del Aire</span>
            <span className="layer-check" />
          </div>
          <div 
            className={`layer ${layers.weather ? 'active' : ''}`}
            onClick={() => toggleLayer('weather')}
          >
            <span className="layer-icon">🌧</span>
            <span className="layer-name">Clima y Radar</span>
            <span className="layer-check" />
          </div>
          <div 
            className={`layer ${layers.water ? 'active' : ''}`}
            onClick={() => toggleLayer('water')}
          >
            <span className="layer-icon">💧</span>
            <span className="layer-name">Niveles de Agua</span>
            <span className="layer-check" />
          </div>
          <div 
            className={`layer ${layers.vegetation ? 'active' : ''}`}
            onClick={() => toggleLayer('vegetation')}
          >
            <span className="layer-icon">🌳</span>
            <span className="layer-name">Vegetación</span>
            <span className="layer-check" />
          </div>
          <div
            className={`layer ${layers.comunas ? 'active' : ''}`}
            onClick={() => toggleLayer('comunas')}
          >
            <span className="layer-icon">🗺️</span>
            <span className="layer-name">Comunas</span>
            <span className="layer-check" />
          </div>
        </div>

        {/* Actions */}
        <div className="actions">
          <button className="btn primary" onClick={() => setDashboardOpen(true)}>
            📊 Ver Dashboard
          </button>
          <button className="btn" onClick={() => setRagOpen(true)} title="Biblioteca documental ambiental con citas">
            📚 RAG Documental
          </button>
          <button className="btn" onClick={() => setGraphOpen(true)} title="Mapa del código: qué usa qué (Graphify)">
            🧠 Grafo conocimiento
          </button>
          <button className="btn" onClick={() => setArchOpen(true)} title="Diagrama de arquitectura del sistema (Archify)">
            🏗 Arquitectura
          </button>
          <button className="btn" onClick={() => setAlertsOpen(true)}>
            🔔 Configurar Alertas
          </button>
          <button className="btn" onClick={handleShare}>
            📤 Compartir
          </button>
          <button
            className={`btn ${commandMode ? 'primary' : ''}`}
            onClick={() => setCommandMode(v => !v)}
            title="Alternar estética de centro de comando"
          >
            🎬 Modo comando
          </button>
        </div>

        {/* Connection Status */}
        <div className="connection">
          <div className="connection-status">
            <div className="status-dot" />
            <span>
              {valley?.live ? 'Conectado' : 'Demo / Offline'} • {valley?.stations.length ?? AIR_QUALITY_STATIONS.length} estaciones
            </span>
          </div>
          <button
            className="btn"
            onClick={() => void refreshLive()}
            disabled={refreshing}
            title="Vuelve a pedir datos a SIATA, Open-Meteo y Geoportal. Sin red se conserva lo mostrado."
            style={{ marginTop: 8, width: '100%' }}
          >
            {refreshing ? '⏳ Actualizando…' : '↻ Actualizar datos'}
          </button>
          {refreshError && (
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>
              ⚠ {refreshError}
            </div>
          )}
        </div>
      </aside>

      {/* Main Content - Map */}
      <main className={`main ${sidebarOpen ? '' : 'full'}`}>
        <div className="cmd-title">TERRAMIND · VALLE DE ABURRÁ · MONITOREO AMBIENTAL</div>
        {!sidebarOpen && (
          <button className="sidebar-fab" onClick={() => setSidebarOpen(true)} title="Mostrar panel">
            ☰
          </button>
        )}
        <AirMap
          onStationClick={(station) => setSelectedStation(station)}
          layers={layers}
          stations={valley?.stations}
          gauges={valley?.gauges ?? []}
          parks={valley?.parks ?? []}
          weather={valley?.weather}
          smoke={intel.smoke}
          smokeReal={intel.smokeReal}
          mixingLabel={intel.mixingLabel}
        />

        {/* Resumen "¿Cómo está el aire HOY?" sobre el mapa */}
        {stats.generatedAt > 0 && (
          <AirQualityOverview
            aqi={stats.avgAqi}
            pm25={stats.avgPm25}
            pm10={stats.avgPm10}
            category={stats.category}
            color={stats.color}
            updatedAt={stats.generatedAt}
            source={stats.source}
            dataDate={stats.dataDate}
          />
        )}

        {/* Chat Widget */}
        <ChatWidget airQualityData={{
          aqi: stats.avgAqi,
          pm25: stats.avgPm25,
          category: stats.category,
          source: stats.source,
          updatedAt: stats.generatedAt,
          stations: valley?.stations.length ?? AIR_QUALITY_STATIONS.length,
          live: valley?.live ?? undefined,
        }} />

        {/* Dashboard overlay */}
        {dashboardOpen && <AirDashboard onClose={() => setDashboardOpen(false)} layers={layers} valley={valley} airQualityData={{ aqi: stats.avgAqi, pm25: stats.avgPm25, category: stats.category }} onConfigureAlerts={() => { setDashboardOpen(false); setAlertsOpen(true); }} onShare={handleShare} />}
        {ragOpen && <RagLibrary onClose={() => setRagOpen(false)} />}
        {graphOpen && <GraphModal onClose={() => setGraphOpen(false)} />}
        {archOpen && <ArchitectureModal onClose={() => setArchOpen(false)} />}
        {authPromptOpen && (
          <AuthPrompt
            onRegister={() => { setAuthPromptOpen(false); setAlertsOpen(true); }}
            onDismiss={() => setAuthPromptOpen(false)}
          />
        )}
        <AlertsPanel
          open={alertsOpen}
          onClose={() => setAlertsOpen(false)}
          avgAqi={stats.avgAqi}
          stations={stationsForAlerts}
          source={stats.source}
          dataDate={stats.dataDate}
        />
      </main>
    </div>
  );
}
