import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  loadAlerts,
  saveAlerts,
  evaluateAlerts,
  thresholdLabel,
  DEFAULT_ALERTS,
  type AlertConfig,
  type StationLike,
} from '../services/alerts';

const createStorageMock = () => {
  const store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => { store[key] = value; }),
    removeItem: vi.fn((key: string) => { delete store[key]; }),
    clear: vi.fn(() => { Object.keys(store).forEach(k => delete store[k]); }),
    get length() { return Object.keys(store).length; },
    key: vi.fn((index: number) => Object.keys(store)[index] ?? null),
  };
};

let storageMock: ReturnType<typeof createStorageMock>;

beforeEach(() => {
  storageMock = createStorageMock();
  Object.defineProperty(global, 'localStorage', {
    value: storageMock,
    writable: true,
    configurable: true,
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('alerts service', () => {
  const mockStations: StationLike[] = [
    { name: 'Centro', district: 'Medellín', aqi: 120 },
    { name: 'Norte', district: 'Bello', aqi: 85 },
    { name: 'Sur', district: 'Itagüí', aqi: 60 },
  ];

  it('loadAlerts devuelve config por defecto cuando no hay nada en localStorage', () => {
    const cfg = loadAlerts();
    expect(cfg).toEqual(DEFAULT_ALERTS);
  });

  it('loadAlerts parsea config guardada correctamente', () => {
    const saved: AlertConfig = { enabled: true, threshold: 151, scope: 'peor-estacion', browser: true };
    storageMock.getItem.mockImplementation(() => JSON.stringify(saved));
    const cfg = loadAlerts();
    expect(cfg).toEqual(saved);
  });

  it('loadAlerts ignora valores inválidos y usa defaults', () => {
    storageMock.getItem.mockImplementation(() => JSON.stringify({ enabled: 'sí', threshold: 'alto' }));
    const cfg = loadAlerts();
    expect(cfg.enabled).toBe(false);
    expect(cfg.threshold).toBe(DEFAULT_ALERTS.threshold);
  });

  it('saveAlerts serializa y guarda', () => {
    const cfg: AlertConfig = { enabled: true, threshold: 101, scope: 'valle', browser: false };
    saveAlerts(cfg);
    expect(storageMock.setItem).toHaveBeenCalledWith('terramind.alerts.v1', JSON.stringify(cfg));
  });

  it('thresholdLabel devuelve etiquetas correctas', () => {
    // thresholdLabel usa umbrales <= 100, <= 150, <= 200
    expect(thresholdLabel(51)).toBe('Supera "Buena" (ICA > 50)');
    expect(thresholdLabel(101)).toBe('Supera "Moderada" (ICA > 100)');
    expect(thresholdLabel(151)).toBe('Grupos sensibles (ICA > 150)');
    expect(thresholdLabel(200)).toBe('Grupos sensibles (ICA > 150)'); // 200 <= 200
    expect(thresholdLabel(201)).toBe('ICA > 201');
  });

  it('evaluateAlerts scope valle dispara cuando promedio ≥ umbral', () => {
    const cfg: AlertConfig = { enabled: true, threshold: 100, scope: 'valle', browser: true };
    const hits = evaluateAlerts(mockStations, 110, cfg);
    expect(hits).toHaveLength(1);
    expect(hits[0].label).toBe('Promedio Valle de Aburrá');
    expect(hits[0].aqi).toBe(110);
  });

  it('evaluateAlerts scope valle NO dispara cuando promedio < umbral', () => {
    const cfg: AlertConfig = { enabled: true, threshold: 100, scope: 'valle', browser: true };
    const hits = evaluateAlerts(mockStations, 90, cfg);
    expect(hits).toHaveLength(0);
  });

  it('evaluateAlerts scope peor-estacion dispara con la peor estación', () => {
    const cfg: AlertConfig = { enabled: true, threshold: 100, scope: 'peor-estacion', browser: true };
    const hits = evaluateAlerts(mockStations, 50, cfg);
    expect(hits).toHaveLength(1);
    expect(hits[0].label).toBe('Centro (Medellín)');
    expect(hits[0].aqi).toBe(120);
  });

  it('evaluateAlerts NO dispara si deshabilitado', () => {
    const cfg: AlertConfig = { enabled: false, threshold: 100, scope: 'valle', browser: true };
    const hits = evaluateAlerts(mockStations, 200, cfg);
    expect(hits).toHaveLength(0);
  });

  it('evaluateAlerts maneja array vacío', () => {
    const cfg: AlertConfig = { enabled: true, threshold: 100, scope: 'peor-estacion', browser: true };
    const hits = evaluateAlerts([], 150, cfg);
    expect(hits).toHaveLength(0);
  });
});