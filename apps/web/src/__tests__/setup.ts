import '@testing-library/jest-dom';
import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

afterEach(() => {
  cleanup();
});

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

global.ResizeObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));

// jsdom does not implement scrollIntoView (used by ChatWidget)
Element.prototype.scrollIntoView = vi.fn() as unknown as typeof Element.prototype.scrollIntoView;

vi.mock('maplibre-gl', () => ({
  default: {
    Map: vi.fn().mockImplementation(() => ({
      on: vi.fn(),
      addSource: vi.fn(),
      addLayer: vi.fn(),
      setTerrain: vi.fn(),
      setSky: vi.fn(),
      addControl: vi.fn(),
      flyTo: vi.fn(),
      easeTo: vi.fn(),
      getLayer: vi.fn(),
      getSource: vi.fn(),
      setLayoutProperty: vi.fn(),
      getCanvas: vi.fn(() => ({ style: { cursor: '' } })),
      getCenter: vi.fn(() => ({ lng: -75.567, lat: 6.247 })),
      getZoom: vi.fn(() => 12.6),
      getPitch: vi.fn(() => 48),
      getBearing: vi.fn(() => 15),
      resize: vi.fn(),
      remove: vi.fn(),
    })),
    NavigationControl: vi.fn(),
    ScaleControl: vi.fn(),
    FullscreenControl: vi.fn(),
    Marker: vi.fn().mockImplementation(() => ({
      setLngLat: vi.fn().mockReturnThis(),
      addTo: vi.fn().mockReturnThis(),
      remove: vi.fn(),
    })),
    Popup: vi.fn().mockImplementation(() => ({
      setLngLat: vi.fn().mockReturnThis(),
      setHTML: vi.fn().mockReturnThis(),
      addTo: vi.fn().mockReturnThis(),
    })),
    StyleSpecification: {},
  },
}));

// jsdom sin URL no expone localStorage: stub en memoria para la suite.
if (typeof globalThis.localStorage === 'undefined') {
  const memStore = new Map<string, string>();
  const memStorage: Storage = {
    get length() { return memStore.size; },
    clear: () => { memStore.clear(); },
    getItem: (k: string) => (memStore.has(k) ? (memStore.get(k) as string) : null),
    key: (i: number) => [...memStore.keys()][i] ?? null,
    removeItem: (k: string) => { memStore.delete(k); },
    setItem: (k: string, v: string) => { memStore.set(String(k), String(v)); },
  };
  Object.defineProperty(globalThis, 'localStorage', { value: memStorage, writable: true, configurable: true });
}
