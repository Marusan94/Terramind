/**
 * Mapa de Estaciones de Calidad del Aire + capas ambientales.
 *
 * Capas (prop `layers`):
 *  - airQuality: estaciones SIATA (círculos AQI + etiquetas)
 *  - weather: radar de lluvia RainViewer (tiles libres) + chip de clima actual
 *  - water: medidores de nivel demo (río Medellín y quebradas)
 *  - vegetation: parques con NDVI demo (círculos verdes)
 *
 * Cada toggle del sidebar muestra/oculta su grupo y el dashboard se adapta.
 */

import { useEffect, useRef, useState, memo } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { AIR_QUALITY_STATIONS, generateRealisticData, calculateAQI } from '../data/stations';
import { getTerrainSource, getBuildingsSource, getBuildingsLayer } from '../services/basemaps';
import { LayerState, ALL_LAYERS_ON } from '../layers';
import { latestRadarTileUrl } from '../services/radar';
import { loadComunas, loadComunaTemps, assignComunaAqi, ComunaFeature } from '../services/comunas';
import { ValleyStation, ValleyGauge, ValleyPark, ValleyData, aggregateByDistrict } from '../services/valley';

interface StationData {
  name: string;
  district: string;
  elevation: number;
  aqi: number;
  category: string;
  color: string;
  quality: 'VALID' | 'MISSING' | 'SIMULATED';
  pm25: number;
  pm10: number;
  o3: number;
  no2: number;
  coords: [number, number];
}

interface AirMapProps {
  onStationClick?: (station: StationData) => void;
  layers?: LayerState;
  stations?: ValleyStation[];
  gauges?: ValleyGauge[];
  parks?: ValleyPark[];
  weather?: ValleyData['weather'];
  smoke?: SmokePlume[];
  /** true = focos observados NASA FIRMS; false = demo etiquetado. */
  smokeReal?: boolean;
  mixingLabel?: string | null;
}

/** Foco de humo + trayectoria de adveccion para el mapa. */
export interface SmokePlume {
  id: string;
  name: string;
  lat: number;
  lon: number;
  path: { lat: number; lon: number }[];
}

/** Tarjeta de stats al pasar sobre una estación. Estilos en línea para que
 *  siempre se vea igual, sin depender del CSS del mapa base. */
function stationCardHtml(d: StationData): string {
  return (
    `<div style="background:#0a0a0a;color:#e0e0e0;border:2px solid ${d.color};border-radius:8px;` +
    `padding:10px 12px;font-family:-apple-system,'Segoe UI',system-ui,sans-serif;font-size:12px;` +
    `min-width:185px;box-shadow:0 6px 24px rgba(0,0,0,0.65)">` +
    `<div style="font-weight:700;font-size:13px;color:#ffffff">${d.district}</div>` +
    `<div style="font-size:11px;color:#999999;margin:2px 0 8px">${d.name} · ${d.elevation} m</div>` +
    `<div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">` +
    (d.quality === 'MISSING'
      ? `<div style="font-weight:700;color:#9ca3af">s/d · sin datos recientes</div></div>` +
        `<div style="font-size:11px;color:#bbbbbb">SIATA no reporta datos recientes para esta estación. ` +
        `No es aire limpio: es ausencia de medición.</div>`
      : `<div style="width:42px;height:42px;border-radius:50%;background:${d.color};display:flex;` +
        `align-items:center;justify-content:center;font-weight:800;font-size:15px;color:#ffffff">${d.aqi}</div>` +
        `<div style="font-weight:700;color:${d.color}">${d.category}</div></div>` +
        `<div style="display:grid;grid-template-columns:1fr 1fr;gap:4px 8px;font-size:11px;color:#bbbbbb">` +
        `<div>PM2.5 <strong style="color:#ffffff">${d.pm25}</strong></div>` +
        `<div>PM10 <strong style="color:#ffffff">${d.pm10}</strong></div>` +
        `<div>O₃ <strong style="color:#ffffff">${d.o3}</strong></div>` +
        `<div>NO₂ <strong style="color:#ffffff">${d.no2}</strong></div>` +
        `</div>`) +
    `</div>`
  );
}

function miniCardHtml(title: string, sub: string, rows: string, accent: string): string {
  return (
    `<div style="background:#0a0a0a;color:#e0e0e0;border:2px solid ${accent};border-radius:8px;` +
    `padding:10px 12px;font-family:-apple-system,'Segoe UI',system-ui,sans-serif;font-size:12px;` +
    `min-width:170px;box-shadow:0 6px 24px rgba(0,0,0,0.65)">` +
    `<div style="font-weight:700;font-size:13px;color:#ffffff">${title}</div>` +
    `<div style="font-size:11px;color:#999999;margin:2px 0 6px">${sub}</div>${rows}</div>`
  );
}

function toStationData(list: ValleyStation[] | undefined): StationData[] {
  if (list && list.length) {
    return list.map(s => ({
      name: s.name,
      district: s.district,
      elevation: s.elevation,
      aqi: s.aqi,
      category: s.quality === 'MISSING' ? 'Sin datos' : s.category,
      color: s.quality === 'MISSING' ? '#6b7280' : s.color,
      quality: s.quality,
      pm25: s.pm25,
      pm10: s.pm10,
      o3: s.o3,
      no2: s.no2,
      coords: [s.lon, s.lat],
    }));
  }
  return AIR_QUALITY_STATIONS.map(station => {
    const data = generateRealisticData(station);
    const aqiInfo = calculateAQI(data.pm25, data.pm10, data.o3, data.no2);
    return {
      name: station.name,
      district: station.district,
      elevation: station.elevation,
      aqi: aqiInfo.aqi,
      category: aqiInfo.category,
      color: aqiInfo.color,
      quality: 'SIMULATED' as const,
      pm25: data.pm25,
      pm10: data.pm10,
      o3: data.o3,
      no2: data.no2,
      coords: [station.lon, station.lat] as [number, number],
    };
  });
}

const TREND_ARROW = { up: '↗', down: '↘', stable: '→' } as const;

const AirMap = memo(function AirMap({
  onStationClick,
  layers = ALL_LAYERS_ON,
  stations,
  gauges = [],
  parks = [],
  weather = null,
  smoke = [],
  smokeReal = false,
  mixingLabel = null,
}: AirMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const popupRef = useRef<maplibregl.Popup | null>(null);
  const clickRef = useRef(onStationClick);
  clickRef.current = onStationClick;

  const layersRef = useRef(layers);
  layersRef.current = layers;
  const dataRef = useRef({ stations, gauges, parks });
  dataRef.current = { stations, gauges, parks };

  const airGroup = useRef<maplibregl.Marker[]>([]);
  const waterGroup = useRef<maplibregl.Marker[]>([]);
  const vegGroup = useRef<maplibregl.Marker[]>([]);
  const smokeGroup = useRef<maplibregl.Marker[]>([]);

  const [coords, setCoords] = useState({ lat: 6.247, lon: -75.567, zoom: 11 });
  const [coordsVisible, setCoordsVisible] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [is3D, setIs3D] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const [radarOn, setRadarOn] = useState(false);

  const setGroupVisible = (group: maplibregl.Marker[], on: boolean) => {
    group.forEach(m => {
      try {
        const el = (m as unknown as { getElement?: () => HTMLElement }).getElement?.();
        if (el) el.style.display = on ? '' : 'none';
      } catch { /* marcador mock en tests */ }
    });
  };

  const clearGroup = (group: React.MutableRefObject<maplibregl.Marker[]>) => {
    group.current.forEach(m => {
      try { m.remove(); } catch { /* noop */ }
    });
    group.current = [];
  };

  const renderAir = (map: maplibregl.Map) => {
    clearGroup(airGroup);
    // NOTE: MapLibre positions `el` with its own transform, so hover scaling
    // is applied to an INNER dot. Scaling `el` itself would erase its
    // position and snap the marker to the map corner.
    toStationData(dataRef.current.stations).forEach(data => {
      const el = document.createElement('div');
      el.style.cssText = `width:36px;height:36px;cursor:pointer;`;
      const dot = document.createElement('div');
      dot.style.cssText = `
        width:100%;height:100%;border-radius:50%;background:${data.color};
        border:3px solid #000;box-shadow:0 0 12px ${data.color}80,0 2px 8px rgba(0,0,0,0.5);
        display:flex;align-items:center;justify-content:center;font-weight:700;font-size:12px;
        color:white;transition:transform 0.2s;`;
      dot.textContent = data.quality === 'MISSING' ? 's/d' : String(data.aqi);
      if (data.quality === 'MISSING') dot.style.fontSize = '10px';
      el.appendChild(dot);
      el.title = data.quality === 'MISSING'
        ? `${data.name}\nSin datos recientes (SIATA no reporta)`
        : `${data.name}\n${data.category}\nPM2.5: ${data.pm25} µg/m³`;

      el.addEventListener('mouseenter', () => {
        dot.style.transform = 'scale(1.3)';
        popupRef.current?.remove();
        popupRef.current = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 26, maxWidth: '260px' })
          .setLngLat(data.coords)
          .setHTML(stationCardHtml(data))
          .addTo(map);
      });
      el.addEventListener('mouseleave', () => {
        dot.style.transform = 'scale(1)';
        popupRef.current?.remove();
        popupRef.current = null;
      });
      el.addEventListener('click', () => clickRef.current?.(data));

      airGroup.current.push(new maplibregl.Marker({ element: el }).setLngLat(data.coords).addTo(map));

      const labelEl = document.createElement('div');
      labelEl.style.cssText = `
        background:rgba(0,0,0,0.8);padding:2px 6px;border-radius:3px;font-size:9px;
        color:#fff;font-family:var(--font);white-space:nowrap;pointer-events:none;`;
      labelEl.textContent = data.district;
      airGroup.current.push(
        new maplibregl.Marker({ element: labelEl, anchor: 'top' })
          .setLngLat([data.coords[0], data.coords[1] - 0.008])
          .addTo(map)
      );
    });
    // Promedio por municipio: píldora ⌀ en el centroide, desplazada al norte
    // para no tapar el marcador. s/d gris si nadie reporta (nunca 0).
    aggregateByDistrict(dataRef.current.stations ?? []).forEach(d => {
      const pill = document.createElement('div');
      pill.style.cssText = `
        padding:2px 8px;border-radius:10px;background:${d.color};border:2px solid #000;
        font-weight:800;font-size:11px;color:white;white-space:nowrap;cursor:pointer;
        box-shadow:0 0 10px ${d.color}90;font-family:var(--font);`;
      pill.textContent = d.avgAqi == null ? `⌀ ${d.district}: s/d` : `⌀ ${d.district}: ${d.avgAqi}`;
      pill.title = d.avgAqi == null
        ? `${d.district}: sin estaciones reportando`
        : `${d.district}: AQI promedio ${d.avgAqi} (${d.category}) con ${d.valid}/${d.total} estaciones`;
      airGroup.current.push(
        new maplibregl.Marker({ element: pill, anchor: 'bottom' })
          .setLngLat([d.lon, d.lat + 0.018])
          .addTo(map)
      );
    });
    setGroupVisible(airGroup.current, layersRef.current.airQuality);
  };

  const renderWater = (map: maplibregl.Map) => {
    clearGroup(waterGroup);
    dataRef.current.gauges.forEach(g => {
      const el = document.createElement('div');
      const bg = g.alert ? '#ef4444' : '#0284c7';
      el.style.cssText = `
        min-width:30px;height:30px;padding:0 6px;border-radius:8px;background:${bg};
        border:2px solid #000;display:flex;align-items:center;justify-content:center;
        font-weight:800;font-size:13px;color:white;cursor:pointer;
        box-shadow:0 0 10px ${bg}90;`;
      el.textContent = `💧${g.level.toFixed(1)}`;
      el.title = `${g.name} (${g.river})\nNivel: ${g.level} m ${TREND_ARROW[g.trend]}`;
      el.addEventListener('mouseenter', () => {
        popupRef.current?.remove();
        popupRef.current = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 20, maxWidth: '240px' })
          .setLngLat([g.lon, g.lat])
          .setHTML(miniCardHtml(
            `💧 ${g.name}`,
            `${g.river} · SIATA Geoportal (en vivo)`,
            `<div style="font-size:12px">Nivel <strong style="color:#fff">${g.level.toFixed(2)} m</strong> ${TREND_ARROW[g.trend]}` +
            (g.precaution != null ? ` <span style="color:#999">/ precaución ${g.precaution.toFixed(2)} m</span>` : '') +
            (g.alert ? `<div style="color:#f87171;font-weight:700">⚠ sobre nivel de precaución</div>` : '') +
            `</div>`,
            bg,
          ))
          .addTo(map);
      });
      el.addEventListener('mouseleave', () => {
        popupRef.current?.remove();
        popupRef.current = null;
      });
      waterGroup.current.push(new maplibregl.Marker({ element: el }).setLngLat([g.lon, g.lat]).addTo(map));
    });
    setGroupVisible(waterGroup.current, layersRef.current.water);
  };

  const renderVeg = (map: maplibregl.Map) => {
    clearGroup(vegGroup);
    dataRef.current.parks.forEach(p => {
      const size = Math.round(40 + p.ndvi * 70);
      const el = document.createElement('div');
      el.style.cssText = `
        width:${size}px;height:${size}px;border-radius:50%;cursor:pointer;
        background:rgba(34,197,94,0.28);border:2px dashed rgba(34,197,94,0.9);
        display:flex;align-items:center;justify-content:center;font-size:18px;`;
      el.textContent = '🌳';
      const ndviPending = p.real && p.ndvi === 0;
      el.title = ndviPending
        ? `${p.name}\nUbicación real (OpenStreetMap) · NDVI pendiente de satélite`
        : `${p.name}\nNDVI: ${p.ndvi} (demo)`;
      el.addEventListener('mouseenter', () => {
        popupRef.current?.remove();
        popupRef.current = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 12, maxWidth: '240px' })
          .setLngLat([p.lon, p.lat])
          .setHTML(miniCardHtml(
            `🌳 ${p.name}`,
            ndviPending
              ? 'Ubicación real OSM · NDVI pendiente (Copernicus)'
              : 'Cobertura vegetal · demo (simulado)',
            ndviPending
              ? `<div style="font-size:12px">NDVI <strong style="color:#fff">n/d</strong> ` +
                `<span style="color:#9ca3af">(el satélite aún no lo mide; el círculo solo marca el área verde)</span></div>`
              : `<div style="font-size:12px">NDVI <strong style="color:#fff">${p.ndvi}</strong> ` +
                `<span style="color:#4ade80">●●●${p.ndvi > 0.6 ? '●●' : '○○'}</span></div>`,
            '#22c55e',
          ))
          .addTo(map);
      });
      el.addEventListener('mouseleave', () => {
        popupRef.current?.remove();
        popupRef.current = null;
      });
      vegGroup.current.push(new maplibregl.Marker({ element: el }).setLngLat([p.lon, p.lat]).addTo(map));
    });
    setGroupVisible(vegGroup.current, layersRef.current.vegetation);
  };

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: {
        version: 8,
        sources: {
          osm: {
            type: 'raster',
            tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
            tileSize: 256,
            attribution: '© OpenStreetMap',
          },
        },
        layers: [{ id: 'osm', type: 'raster', source: 'osm' }],
      },
      center: [-75.567, 6.247],
      zoom: 11,
      pitch: 0,
      attributionControl: false,
      antialias: true,
      minZoom: 8,
      // z15 = máx. soportado por el stack gratuito (terreno/edificios nativos
      // a z14 + overzoom; más allá los servidores devuelven error de zoom).
      maxZoom: 15,
    });

    mapRef.current = map;

    // Telemetría: registra errores de tiles/fuentes para diagnóstico
    map.on('error', (e: unknown) => {
      try {
        const err = e as { error?: { message?: string; status?: number }; sourceId?: string; tile?: { z?: number } };
        console.warn('Terramind map error:', err?.error?.message, '| source:', err?.sourceId, '| z:', err?.tile?.z);
      } catch { /* noop */ }
    });

    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'bottom-right');
    map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-left');

    map.on('load', () => {
      setIsLoading(false);

      // Modo inicial 2D: el terreno solo se activa con el toggle 3D
      try {
        if (!map.getSource('terrain')) {
          map.addSource('terrain', getTerrainSource());
        }
      } catch (err) {
        console.warn('Terrain unavailable, continuing in 2D:', err);
      }

      try {
        if (!map.getSource('openfreemap-buildings')) {
          map.addSource('openfreemap-buildings', getBuildingsSource());
        }
        if (!map.getLayer('buildings-3d')) {
          map.addLayer(getBuildingsLayer());
        }
      } catch (err) {
        console.warn('3D buildings unavailable:', err);
      }

      try {
        renderAir(map);
        renderWater(map);
        renderVeg(map);
      } catch (err) {
        console.warn('Layer markers failed:', err);
      }
      setMapReady(true);
    });

    let timeout: ReturnType<typeof setTimeout>;
    map.on('mousemove', (e) => {
      setCoords({ lat: e.lngLat.lat, lon: e.lngLat.lng, zoom: map.getZoom() });
      setCoordsVisible(true);
      clearTimeout(timeout);
      timeout = setTimeout(() => setCoordsVisible(false), 2000);
    });

    return () => {
      clearTimeout(timeout);
      popupRef.current?.remove();
      popupRef.current = null;
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Los datos del valle llegan async: re-renderiza los grupos al llegar
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    try {
      renderAir(map);
      renderWater(map);
      renderVeg(map);
    } catch (err) {
      console.warn('Layer re-render failed:', err);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stations, gauges, parks, mapReady]);

  // Toggles del sidebar: muestra/oculta cada grupo
  useEffect(() => {
    setGroupVisible(airGroup.current, layers.airQuality);
    setGroupVisible(waterGroup.current, layers.water);
    setGroupVisible(vegGroup.current, layers.vegetation);
  }, [layers]);

  // Radar de lluvia RainViewer (tiles libres, sin key) cuando Clima está activo
  interface RadarMapOps {
    getLayer?(id: string): unknown;
    getSource?(id: string): unknown;
    addSource?(id: string, src: unknown): void;
    addLayer?(layer: unknown): void;
    removeLayer?(id: string): void;
    removeSource?(id: string): void;
  }
  useEffect(() => {
    const map = mapRef.current as unknown as RadarMapOps | null;
    if (!map || !mapReady) return;
    let cancelled = false;

    const removeRadar = () => {
      try {
        if (map.getLayer?.('radar-layer')) map.removeLayer?.('radar-layer');
        if (map.getSource?.('radar')) map.removeSource?.('radar');
      } catch { /* noop */ }
      if (!cancelled) setRadarOn(false);
    };

    if (!layers.weather) {
      removeRadar();
      return () => { cancelled = true; };
    }

    (async () => {
      try {
        const res = await fetch('https://api.rainviewer.com/public/weather-maps.json');
        if (!res.ok || cancelled) return;
        const url = latestRadarTileUrl(await res.json());
        if (!url || cancelled) return;
        if (!map.getSource?.('radar')) {
          map.addSource?.(
            'radar',
            {
              type: 'raster', tiles: [url], tileSize: 256,
              // VERIFICADO 2026-09-07: RainViewer sirve datos reales solo
              // hasta z7; desde z8 devuelve un tile con el texto
              // "Zoom Level Not Supported". Con maxzoom 7 MapLibre reusa
              // (overzoom) sin pedir nunca el placeholder.
              maxzoom: 7, attribution: '© RainViewer',
            },
          );
        }
        if (!map.getLayer?.('radar-layer')) {
          map.addLayer?.(
            {
              id: 'radar-layer', type: 'raster', source: 'radar',
              // Visible hasta z13 (el mapa abre en z11): antes el límite era
              // z11 y el radar nacía oculto justo en el zoom inicial.
              maxzoom: 13, paint: { 'raster-opacity': 0.55 },
            },
          );
        }
        if (!cancelled) setRadarOn(true);
      } catch (err) {
        console.warn('Radar unavailable:', err);
      }
    })();

    return () => { cancelled = true; };
  }, [layers.weather, mapReady]);

  // Comunas de Medellín coloreadas por AQI (polígonos oficiales Alcaldía).
  // Clic en una comuna → popup con AQI (medido/estimado) + temperatura real.
  const comunasTemps = useRef<Array<number | null> | null>(null);
  useEffect(() => {
    const realMap = mapRef.current;
    if (!realMap || !mapReady) return;
    const map = realMap as unknown as {
      getSource?(id: string): unknown;
      addSource?(id: string, src: unknown): void;
      getLayer?(id: string): unknown;
      addLayer?(layer: unknown): void;
      removeLayer?(id: string): void;
      removeSource?(id: string): void;
      on?(type: string, layer: string, fn: (e: any) => void): void;
      off?(type: string, layer: string, fn: (e: any) => void): void;
    };
    const SRC = 'comunas-src';
    const FILL = 'comunas-fill';
    const LINE = 'comunas-line';
    const LABEL = 'comunas-label';
    let cancelled = false;
    const cleanup = () => {
      try {
        if (map.getLayer?.(LABEL)) map.removeLayer?.(LABEL);
        if (map.getLayer?.(FILL)) map.removeLayer?.(FILL);
        if (map.getLayer?.(LINE)) map.removeLayer?.(LINE);
        if (map.getSource?.(SRC)) map.removeSource?.(SRC);
      } catch { /* noop */ }
    };
    const onClick = (e: any) => {
      const f = e?.features?.[0];
      if (!f) return;
      const p = (f.properties ?? {}) as Record<string, any>;
      const aqiLine =
        p.aqi == null
          ? `<div style="font-size:12px;color:#9ca3af">AQI s/d · sin estaciones cerca</div>`
          : `<div style="font-size:12px">AQI <strong style="color:#fff">${p.aqi}</strong> ` +
            `<span style="color:#999">(${p.origin === 'inside' ? 'medido en la comuna' : `estimado · ${p.station} a ${p.dist} km`})</span></div>`;
      const tempLine =
        p.temp == null
          ? `<div style="font-size:12px;color:#9ca3af">🌡 n/d (sin conexión)</div>`
          : `<div style="font-size:12px">🌡 <strong style="color:#fff">${p.temp}°C</strong> <span style="color:#999">(Open-Meteo)</span></div>`;
      popupRef.current?.remove();
      popupRef.current = new maplibregl.Popup({ closeButton: true, offset: 12, maxWidth: '240px' })
        .setLngLat(e.lngLat)
        .setHTML(miniCardHtml(`🗺️ Comuna ${p.name}`, 'Límites oficiales Alcaldía de Medellín', aqiLine + tempLine, '#8b5cf6'))
        .addTo(realMap);
    };
    if (!layers.comunas) {
      cleanup();
      return () => { cancelled = true; };
    }
    (async () => {
      try {
        const polys: ComunaFeature[] | null = await loadComunas();
        if (!polys?.length || cancelled) return;
        if (!comunasTemps.current) {
          comunasTemps.current = await loadComunaTemps(polys.map(p => p.centroid));
        }
        if (cancelled) return;
        const stations = (dataRef.current.stations ?? []).map(s => ({
          name: s.name, district: s.district, lat: s.lat, lon: s.lon,
          aqi: s.aqi, color: s.color, quality: s.quality,
        }));
        const fc = {
          type: 'FeatureCollection',
          features: polys.map((p, i) => {
            const a = assignComunaAqi(p, stations);
            return {
              type: 'Feature',
              properties: {
                name: p.name, color: a.color, aqi: a.aqi, origin: a.origin,
                station: a.stationName, dist: a.distKm,
                temp: comunasTemps.current?.[i] ?? null,
              },
              geometry: { type: 'Polygon', coordinates: p.polygon },
            };
          }),
        };
        cleanup();
        map.addSource?.(SRC, { type: 'geojson', data: fc });
        map.addLayer?.({
          id: FILL, type: 'fill', source: SRC,
          paint: { 'fill-color': ['get', 'color'], 'fill-opacity': 0.32 },
        });
        map.addLayer?.({
          id: LINE, type: 'line', source: SRC,
          paint: { 'line-color': '#111827', 'line-width': 2, 'line-opacity': 0.85 },
        });
        map.addLayer?.({
          id: LABEL, type: 'symbol', source: SRC,
          layout: { 'text-field': ['get', 'name'], 'text-size': 11, 'text-allow-overlap': false },
          paint: { 'text-color': '#ffffff', 'text-halo-color': '#000000', 'text-halo-width': 1.5 },
        });
        map.on?.('click', FILL, onClick);
      } catch (err) {
        console.warn('Comunas unavailable:', err);
      }
    })();
    return () => {
      cancelled = true;
      try { map.off?.('click', FILL, onClick); } catch { /* noop */ }
      cleanup();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layers.comunas, stations, mapReady]);

  // Humo regional (demo): focos + trayectorias de adveccion por viento estimado.
  // Visibilidad ligada a la capa Clima. Todo objeto demo va etiquetado.
  useEffect(() => {
    const realMap = mapRef.current;
    if (!realMap || !mapReady) return;
    const map = realMap as unknown as {
      getSource?(id: string): unknown;
      addSource?(id: string, src: unknown): void;
      getLayer?(id: string): unknown;
      addLayer?(layer: unknown): void;
      removeLayer?(id: string): void;
      removeSource?(id: string): void;
    };
    clearGroup(smokeGroup);
    try {
      if (map.getLayer?.('smoke-traj')) map.removeLayer?.('smoke-traj');
      if (map.getSource?.('smoke-src')) map.removeSource?.('smoke-src');
    } catch { /* noop */ }
    if (!layers.weather || !smoke.length) return;
    try {
      smoke.forEach(focus => {
        const el = document.createElement('div');
        el.style.cssText = 'width:30px;height:30px;border-radius:50%;cursor:pointer;' +
          'background:rgba(251,146,60,0.25);border:2px dashed #fb923c;' +
          'display:flex;align-items:center;justify-content:center;font-size:15px;';
        el.textContent = String.fromCodePoint(0x1F525);
        el.title = focus.name + ' (foco demo simulado, trayectoria 12h dibujada)';
        smokeGroup.current.push(
          new maplibregl.Marker({ element: el }).setLngLat([focus.lon, focus.lat]).addTo(realMap),
        );
      });
      setGroupVisible(smokeGroup.current, layersRef.current.weather);
      const lines = {
        type: 'FeatureCollection',
        features: smoke.map(focus => ({
          type: 'Feature',
          properties: { name: focus.name },
          geometry: {
            type: 'LineString',
            coordinates: [[focus.lon, focus.lat], ...focus.path.map(p => [p.lon, p.lat])],
          },
        })),
      };
      map.addSource?.('smoke-src', { type: 'geojson', data: lines });
      map.addLayer?.({
        id: 'smoke-traj',
        type: 'line',
        source: 'smoke-src',
        paint: {
          'line-color': '#fb923c',
          'line-width': 2,
          'line-dasharray': [2, 2],
          'line-opacity': 0.9,
        },
      });
    } catch (err) {
      console.warn('Smoke layer failed:', err);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [smoke, mapReady, layers.weather]);

  const toggle3D = () => {
    const map = mapRef.current;
    if (!map) return;
    const next = !is3D;
    setIs3D(next);
    try {
      if (next) {
        if (!map.getSource('terrain')) {
          map.addSource('terrain', getTerrainSource());
        }
        map.setTerrain({ source: 'terrain', exaggeration: 1.2 });
        map.easeTo({ pitch: 55, duration: 800 });
      } else {
        map.setTerrain(null);
        map.easeTo({ pitch: 0, duration: 800 });
      }
    } catch (err) {
      console.warn('3D toggle failed:', err);
    }
  };

  return (
    <>
      <div ref={containerRef} style={{ position: 'absolute', inset: 0 }} />
      <div className="map-fx" />

      {isLoading && (
        <div className="map-loading">
          <div className="loading">
            <span className="loading-dot" />
            <span className="loading-dot" style={{ animationDelay: '0.2s' }} />
            <span className="loading-dot" style={{ animationDelay: '0.4s' }} />
            <span>Cargando mapa...</span>
          </div>
        </div>
      )}

      {/* HUD */}
      <div className={`hud-coords ${coordsVisible ? '' : 'hidden'}`}>
        <div>
          <span className="hud-coord-label">LAT </span>
          <span className="hud-coord-value">{coords.lat.toFixed(4)}</span>
        </div>
        <div>
          <span className="hud-coord-label">LON </span>
          <span className="hud-coord-value">{coords.lon.toFixed(4)}</span>
        </div>
      </div>

      {/* Chip de clima actual cuando la capa está activa */}
      {layers.weather && weather && (
        <div className="weather-chip" title="Clima actual (Open-Meteo)">
          {weather.emoji} {Math.round(weather.temp)}°C · {weather.label}
          {!radarOn && <span style={{ opacity: 0.7 }}> · radar n/d</span>}
        </div>
      )}

      {/* Techo estimado de la capa de mezcla */}
      {mixingLabel && (
        <div className="weather-chip" title="Altura estimada de la capa de mezcla (techo invisible)">
          Techo {mixingLabel}
        </div>
      )}

      {/* 3D toggle */}
      <button
        onClick={toggle3D}
        title={is3D ? 'Vista 2D' : 'Vista 3D'}
        style={{
          position: 'absolute',
          top: 12,
          right: 12,
          padding: '8px 14px',
          background: is3D ? 'var(--accent)' : 'rgba(0,0,0,0.85)',
          border: '1px solid var(--border)',
          borderRadius: 4,
          color: is3D ? 'white' : 'var(--text)',
          cursor: 'pointer',
          fontSize: 12,
          fontWeight: 600,
          fontFamily: 'var(--font)',
        }}
      >
        {is3D ? '🧊 3D' : '🗺 2D'}
      </button>

      {/* Legend (solo capas activas) */}
      <div style={{
        position: 'absolute',
        bottom: 40,
        left: 12,
        background: 'rgba(0,0,0,0.85)',
        border: '1px solid var(--border)',
        borderRadius: 4,
        padding: 8,
        fontSize: 10,
        fontFamily: 'var(--font)',
      }}>
        {layers.airQuality && (
          <>
            <div style={{ color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase' }}>AQI</div>
            {[
              { range: '0-50', label: 'Bueno', color: '#22c55e' },
              { range: '51-100', label: 'Moderado', color: '#eab308' },
              { range: '101-150', label: 'Sensible', color: '#f97316' },
              { range: '151+', label: 'Insalubre', color: '#ef4444' },
            ].map(item => (
              <div key={item.range} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                <div style={{ width: 12, height: 12, borderRadius: '50%', background: item.color }} />
                <span style={{ color: 'var(--text)' }}>{item.label}</span>
                <span style={{ color: 'var(--text-muted)', marginLeft: 'auto' }}>{item.range}</span>
              </div>
            ))}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6 }}>
              <span style={{ color: '#fff', fontWeight: 800, fontSize: 10 }}>⌀</span>
              <span style={{ color: 'var(--text)' }}>Promedio municipio</span>
            </div>
          </>
        )}
        {layers.comunas && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3 }}>
            <div style={{ width: 12, height: 12, borderRadius: 2, background: '#8b5cf6', opacity: 0.6 }} />
            <span style={{ color: 'var(--text)' }}>
              {layers.airQuality ? 'Comuna (color = su AQI, escala arriba)' : 'Comunas (clic: AQI + temp)'}
            </span>
          </div>
        )}
        {layers.weather && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: layers.airQuality ? 6 : 0 }}>
            <div style={{ width: 12, height: 12, borderRadius: 2, background: '#38bdf8' }} />
            <span style={{ color: 'var(--text)' }}>Radar lluvia (en vivo)</span>
          </div>
        )}
        {layers.water && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3 }}>
            <div style={{ width: 12, height: 12, borderRadius: 2, background: '#0284c7' }} />
            <span style={{ color: 'var(--text)' }}>Nivel río (SIATA en vivo)</span>
          </div>
        )}
        {layers.vegetation && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3 }}>
            <div style={{ width: 12, height: 12, borderRadius: '50%', background: 'rgba(34,197,94,0.5)' }} />
            <span style={{ color: 'var(--text)' }}>NDVI (demo)</span>
          </div>
        )}
        {layers.weather && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3 }}>
            <div style={{ width: 12, height: 12, borderRadius: '50%', background: '#fb923c' }} />
            <span style={{ color: 'var(--text)' }}>{smokeReal ? 'Humo (FIRMS en vivo)' : 'Humo (demo)'}</span>
          </div>
        )}
        {!layers.airQuality && !layers.weather && !layers.water && !layers.vegetation && !layers.comunas && (
          <span style={{ color: 'var(--text-muted)' }}>Sin capas activas</span>
        )}
      </div>
    </>
  );
});

export default AirMap;
