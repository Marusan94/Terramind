/**
 * Estado compartido de capas del mapa.
 * `true` = capa visible / incluida en dashboard y análisis.
 */
export interface LayerState {
  airQuality: boolean;
  weather: boolean;
  water: boolean;
  vegetation: boolean;
  comunas: boolean;
}

export const ALL_LAYERS_ON: LayerState = {
  airQuality: true,
  weather: true,
  water: true,
  vegetation: true,
  comunas: true,
};

export const LAYER_META: Record<keyof LayerState, { label: string; icon: string }> = {
  airQuality: { label: 'Calidad del Aire', icon: '🌫' },
  weather: { label: 'Clima y Radar', icon: '🌧' },
  water: { label: 'Niveles de Agua', icon: '💧' },
  vegetation: { label: 'Vegetación', icon: '🌳' },
  comunas: { label: 'Comunas', icon: '🗺️' },
};

/** Nombres de pestañas del dashboard por capa. */
export const LAYER_TABS: Record<keyof LayerState, { key: string; label: string; name: string }> = {
  airQuality: { key: 'overview', label: '🌫', name: 'Aire' },
  weather: { key: 'weather', label: '🌧', name: 'Clima' },
  water: { key: 'water', label: '💧', name: 'Agua' },
  vegetation: { key: 'vegetation', label: '🌳', name: 'Vegetación' },
  comunas: { key: 'territory', label: '🗺️', name: 'Comunas' },
};
