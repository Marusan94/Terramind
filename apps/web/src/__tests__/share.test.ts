import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { buildShareText, shareReport, type ShareSnapshot } from '../services/share';

describe('share service', () => {
  const mockSnapshot: ShareSnapshot = {
    avgAqi: 85,
    avgPm25: 28.5,
    avgPm10: 42,
    category: 'Moderada',
    generatedAt: 1704067200000,
    source: 'SIATA (histórico sep-2024) + Open-Meteo CAMS (actual)',
    dataDate: 'histórico 1/1/2024',
    stations: 14,
  };

  let mockShare: ReturnType<typeof vi.fn>;
  let mockWriteText: ReturnType<typeof vi.fn>;
  let originalNavigator: Navigator;

  beforeEach(() => {
    originalNavigator = global.navigator;
    mockShare = vi.fn();
    mockWriteText = vi.fn();

    // Mock navigator on both global and window (jsdom)
    Object.defineProperty(global, 'navigator', {
      value: {
        ...originalNavigator,
        share: mockShare,
        clipboard: { writeText: mockWriteText },
      },
      writable: true,
      configurable: true,
    });

    if (typeof window !== 'undefined') {
      Object.defineProperty(window, 'navigator', {
        value: global.navigator,
        writable: true,
        configurable: true,
      });
    }
  });

  afterEach(() => {
    Object.defineProperty(global, 'navigator', {
      value: originalNavigator,
      writable: true,
      configurable: true,
    });
    vi.restoreAllMocks();
  });

  it('buildShareText incluye todos los campos requeridos', () => {
    const text = buildShareText(mockSnapshot);
    expect(text).toContain('Terramind · Valle de Aburrá');
    expect(text).toContain('AQI 85');
    expect(text).toContain('(Moderada)');
    expect(text).toContain('PM2.5 28.5 µg/m³');
    expect(text).toContain('PM10 42 µg/m³');
    expect(text).toContain('14 estaciones');
    expect(text).toContain('Fuente: SIATA (histórico sep-2024) + Open-Meteo CAMS (actual) (histórico 1/1/2024)');
  });

  it('shareReport devuelve "shared" cuando navigator.share resuelve', async () => {
    mockShare.mockResolvedValue(undefined);
    const result = await shareReport(mockSnapshot);
    expect(result).toBe('shared');
    expect(mockShare).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Terramind · Calidad del aire',
      text: expect.stringContaining('AQI 85'),
      url: window.location.href,
    }));
  });

  it('shareReport devuelve "copied" cuando navigator.share falla pero clipboard.writeText funciona', async () => {
    mockShare.mockRejectedValue(new Error('cancelled'));
    mockWriteText.mockResolvedValue(undefined);
    const result = await shareReport(mockSnapshot);
    expect(result).toBe('copied');
    expect(mockWriteText).toHaveBeenCalledWith(expect.stringContaining('AQI 85'));
  });

  it('shareReport devuelve "failed" cuando ambas APIs fallan', async () => {
    mockShare.mockRejectedValue(new Error('cancelled'));
    mockWriteText.mockRejectedValue(new Error('permission denied'));
    const result = await shareReport(mockSnapshot);
    expect(result).toBe('failed');
  });

  it('shareReport devuelve "failed" si no hay navigator.share ni clipboard', async () => {
    // @ts-expect-error - testing environment
    global.navigator = {};
    const result = await shareReport(mockSnapshot);
    expect(result).toBe('failed');
  });

  it('buildShareText formatea fecha en locale es-CO', () => {
    const text = buildShareText(mockSnapshot);
    // Debe contener día y mes en español (ej. "1 ene" o similar)
    expect(text).toMatch(/\d{1,2}\s\w{3}/); // día + mes abreviado
  });
});