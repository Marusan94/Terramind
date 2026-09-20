/**
 * Basemap sources - Free, no API key required
 * Using reliable OpenStreetMap-based tiles
 */

import type maplibregl from 'maplibre-gl';

export interface BasemapSource {
  name: string;
  url: string;
  attribution: string;
  requiresKey: boolean;
}

export const basemaps: Record<string, BasemapSource> = {
  osm: {
    name: 'OpenStreetMap',
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '© OpenStreetMap contributors',
    requiresKey: false,
  },
  osmHot: {
    name: 'OSM HOT',
    url: 'https://a.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png',
    attribution: '© OpenStreetMap, © HOT',
    requiresKey: false,
  },
  stamenTerrain: {
    name: 'Stamen Terrain',
    url: 'https://tiles.stadiamaps.com/tiles/stamen_terrain/{z}/{x}/{y}.png',
    attribution: '© Stadia, © OpenStreetMap',
    requiresKey: false,
  },
};

/**
 * Get basemap style for MapLibre
 */
export function getBasemapStyle(_theme: 'dark' | 'light' = 'dark') {
  // Use OSM as primary - most reliable
  const source = basemaps.osm;
  
  return {
    version: 8 as const,
    name: 'Terramind',
    sources: {
      'osm': {
        type: 'raster' as const,
        tiles: [source.url],
        tileSize: 256,
        attribution: source.attribution,
        maxzoom: 19,
      },
    },
    layers: [
      {
        id: 'osm-tiles',
        type: 'raster' as const,
        source: 'osm',
        minzoom: 0,
        maxzoom: 22,
      },
    ],
  };
}

/**
 * Get terrain source for 3D elevation
 */
export function getTerrainSource() {
  return {
    type: 'raster-dem' as const,
    tiles: [
      'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png',
    ],
    encoding: 'terrarium' as const,
    tileSize: 256,
    maxzoom: 14,
    attribution: '© AWS Open Data, © SRTM',
  };
}

/**
 * Free vector tile source with building footprints (OpenMapTiles schema).
 * No API key required. The `building` source-layer exposes
 * `render_height` / `render_min_height` for 3D extrusion.
 * https://openfreemap.org/
 */
export function getBuildingsSource() {
  return {
    // TileJSON oficial: resuelve el template versionado (/planet/<fecha>_pt/...)
    // automáticamente, así no se rompe con cada rebuild del planeta.
    // maxzoom 14 confirmado en el TileJSON.
    type: 'vector' as const,
    url: 'https://tiles.openfreemap.org/planet',
    attribution: '© OpenMapTiles © OpenStreetMap contributors',
  };
}

/**
 * Fill-extrusion layer spec for 3D buildings over the Valle de Aburrá.
 * Colors follow the Terramind dark theme (muted violet-gray).
 * Should be added on top of the raster basemap once the map is loaded.
 */
export function getBuildingsLayer(): maplibregl.FillExtrusionLayerSpecification {
  return {
    id: 'buildings-3d',
    type: 'fill-extrusion' as const,
    source: 'openfreemap-buildings',
    'source-layer': 'building',
    minzoom: 12,
    paint: {
      'fill-extrusion-color': '#3f3f5a',
      'fill-extrusion-height': [
        'coalesce',
        ['get', 'render_height'],
        12,
      ],
      'fill-extrusion-base': [
        'coalesce',
        ['get', 'render_min_height'],
        0,
      ],
      'fill-extrusion-opacity': 0.85,
      'fill-extrusion-vertical-gradient': true,
    },
  };
}
