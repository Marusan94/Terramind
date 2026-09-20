/** Pronóstico desde serie real + determinismo del demo. */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { seriesToHistory, predictAQI, generateHistoricalData } from '../services/predictions';

afterEach(() => {
  vi.useRealTimers();
});

function pts(n: number, pm25 = 30) {
  const now = Date.now();
  return Array.from({ length: n }, (_, i) => ({ t: now - (n - i) * 3600000, pm25 }));
}

describe('seriesToHistory', () => {
  it('convierte PM2.5 real a AQI EPA', () => {
    const h = seriesToHistory(pts(12, 35.5));
    expect(h).not.toBeNull();
    expect(h).toHaveLength(12);
    // 35.5 µg/m³ PM2.5 = AQI 101 (EPA)
    expect(h?.[0].aqi).toBe(101);
    expect(h?.[0].pm25).toBe(35.5);
  });

  it('null con menos de 12 puntos válidos', () => {
    expect(seriesToHistory(pts(11))).toBeNull();
    const withNulls = pts(12).map((p, i) => (i < 5 ? { ...p, pm25: null } : p));
    expect(seriesToHistory(withNulls)).toBeNull();
  });

  it('filtra nulos y recorta a 72', () => {
    const h = seriesToHistory(pts(80));
    expect(h).toHaveLength(72);
  });
});

describe('determinismo', () => {
  it('predictAQI estable entre llamadas', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-17T12:00:00-05:00'));
    const hist = generateHistoricalData();
    const a = predictAQI(hist);
    const b = predictAQI(hist);
    expect(a).toEqual(b);
    expect(a).toHaveLength(48);
  });

  it('generateHistoricalData estable el mismo día', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-17T12:00:00-05:00'));
    expect(generateHistoricalData()).toEqual(generateHistoricalData());
  });
});
