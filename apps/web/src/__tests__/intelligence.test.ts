/**
 * Tests del motor de inteligencia: todo determinista, sin red ni azar.
 */
import { describe, it, expect } from 'vitest';
import {
  WHO_2021,
  whoVerdict,
  rankDistrictsByWho,
  preventionStatus,
  estimateMixingHeightM,
  mixingState,
  attributeSources,
  leastSquaresSlope,
  forecastPM25,
  exceedanceProbability,
  detectAnomalies,
  bestHours,
  routeExposure,
  demoSmokeFoci,
  trajectory,
  StationReading,
} from '../services/intelligence';

const READINGS: StationReading[] = [
  { id: 'a', district: 'Itagüí', pm25: 42, pm10: 60, o3: 40, no2: 30, elevation: 1550 },
  { id: 'b', district: 'Envigado', pm25: 12, pm10: 20, o3: 35, no2: 15, elevation: 1620 },
  { id: 'c', district: 'Bello', pm25: 28, pm10: 45, o3: 38, no2: 25, elevation: 1420 },
];

describe('whoVerdict', () => {
  it('marca cumplimiento bajo el límite OMS', () => {
    const v = whoVerdict('pm25', 10);
    expect(v.exceeds).toBe(false);
    expect(v.limit).toBe(WHO_2021.pm25);
    expect(v.label).toBe('Cumple OMS');
  });
  it('calcula el factor de superación', () => {
    const v = whoVerdict('pm25', 45);
    expect(v.exceeds).toBe(true);
    expect(v.ratio).toBe(3);
    expect(v.label).toContain('x3.0');
  });
});

describe('rankDistrictsByWho', () => {
  it('ordena de peor a mejor y calcula ratio', () => {
    const r = rankDistrictsByWho(READINGS, pm25 => pm25 * 2);
    expect(r.map(x => x.district)).toEqual(['Itagüí', 'Bello', 'Envigado']);
    expect(r[0].ratioVsWho).toBeCloseTo(42 / 15, 2);
    expect(r[2].exceedsWho).toBe(false);
  });
  it('lista vacía con entrada vacía', () => {
    expect(rankDistrictsByWho([], pm25 => pm25)).toEqual([]);
  });
});

describe('preventionStatus', () => {
  const ranked = rankDistrictsByWho(READINGS, pm25 => pm25 * 2);
  it('verde cuando todo está bajo', () => {
    const low = rankDistrictsByWho(
      [{ id: 'x', district: 'Sabaneta', pm25: 10, pm10: 15, o3: 30, no2: 10, elevation: 1580 }],
      pm25 => pm25 * 2,
    );
    expect(preventionStatus(low, 0.1).level).toBe('verde');
  });
  it('amarillo sobre 35.5', () => {
    expect(preventionStatus(ranked, 0.1).level).toBe('amarillo');
  });
  it('naranja sobre 55.5 o prob alta', () => {
    const high = rankDistrictsByWho(
      [{ id: 'x', district: 'Itagüí', pm25: 60, pm10: 90, o3: 40, no2: 30, elevation: 1550 }],
      pm25 => pm25 * 2,
    );
    expect(preventionStatus(high, 0.1).level).toBe('naranja');
    expect(preventionStatus(ranked, 0.7).level).toBe('naranja');
  });
  it('siempre explica la regla y el método', () => {
    const s = preventionStatus(ranked, 0.2);
    expect(s.rule.length).toBeGreaterThan(0);
    expect(s.method.length).toBeGreaterThan(0);
    expect(s.worst?.district).toBe('Itagüí');
  });
});

describe('techo invisible', () => {
  it('de madrugada es más bajo que al mediodía', () => {
    expect(estimateMixingHeightM(4, 2)).toBeLessThan(estimateMixingHeightM(14, 2));
  });
  it('más viento sube el techo', () => {
    expect(estimateMixingHeightM(8, 1)).toBeLessThan(estimateMixingHeightM(8, 8));
  });
  it('clasifica tapado / transición / ventilado', () => {
    expect(mixingState(200).state).toBe('tapado');
    expect(mixingState(600).state).toBe('transicion');
    expect(mixingState(1400).state).toBe('ventilando');
  });
});

describe('attributeSources', () => {
  it('las fracciones suman 1', () => {
    const s = attributeSources({ hour: 8, district: 'Itagüí', windSpeedMs: 3, regionalSmoke: true });
    expect(s.traffic + s.industrial + s.regional).toBeCloseTo(1, 2);
  });
  it('en hora pico domina el tráfico y en distrito industrial pesa la industria', () => {
    const rush = attributeSources({ hour: 8, district: 'Envigado', windSpeedMs: 1, regionalSmoke: false });
    const night = attributeSources({ hour: 2, district: 'Envigado', windSpeedMs: 1, regionalSmoke: false });
    expect(rush.traffic).toBeGreaterThan(night.traffic);
    const ind = attributeSources({ hour: 2, district: 'Itagüí', windSpeedMs: 1, regionalSmoke: false });
    expect(ind.industrial).toBeGreaterThan(night.industrial);
  });
});

describe('forecastPM25', () => {
  const history = Array.from({ length: 24 }, (_, i) => ({
    t: Date.now() - (24 - i) * 3600_000,
    pm25: 20 + i * 0.5 + (i % 3),
  }));
  it('genera 48 puntos con banda coherente', () => {
    const f = forecastPM25(history);
    expect(f).toHaveLength(48);
    for (const p of f) {
      expect(p.pm25Min).toBeLessThanOrEqual(p.pm25);
      expect(p.pm25).toBeLessThanOrEqual(p.pm25Max);
      expect(p.confidence).toBeGreaterThanOrEqual(0.5);
    }
  });
  it('es determinista', () => {
    expect(forecastPM25(history)).toEqual(forecastPM25(history));
  });
  it('con pocos datos devuelve meseta honesta', () => {
    const f = forecastPM25([{ t: Date.now(), pm25: 30 }], 5);
    expect(f).toHaveLength(5);
    expect(f[0].confidence).toBe(0.5);
  });
  it('leastSquaresSlope recupera la pendiente', () => {
    expect(leastSquaresSlope([0, 1, 2, 3], [10, 12, 14, 16])).toBeCloseTo(2, 6);
  });
});

describe('exceedanceProbability', () => {
  it('está en [0,1] y reacciona al nivel', () => {
    const high = forecastPM25(Array.from({ length: 12 }, (_, i) => ({ t: i, pm25: 60 })));
    const low = forecastPM25(Array.from({ length: 12 }, (_, i) => ({ t: i, pm25: 8 })));
    const ph = exceedanceProbability(high, WHO_2021.pm25);
    const pl = exceedanceProbability(low, WHO_2021.pm25);
    expect(ph).toBeGreaterThan(0.9);
    expect(pl).toBeLessThan(0.1);
  });
});

describe('detectAnomalies', () => {
  it('marca un pico inyectado y respeta series suaves', () => {
    const smooth = [20, 21, 20, 22, 21, 20, 21, 22, 21, 20];
    expect(detectAnomalies(smooth).every(v => v === false)).toBe(true);
    const spike = [...smooth, 95];
    const flags = detectAnomalies(spike);
    expect(flags[flags.length - 1]).toBe(true);
  });
});

describe('bestHours y routeExposure', () => {
  it('devuelve las horas más limpias', () => {
    const f = forecastPM25(
      Array.from({ length: 24 }, (_, i) => ({ t: Date.now() - (24 - i) * 3600_000, pm25: 25 })),
    );
    const best = bestHours(f, 3);
    expect(best).toHaveLength(3);
    expect(best[0].pm25).toBeLessThanOrEqual(best[2].pm25);
  });
  it('la exposición pondera la estación cercana', () => {
    const stations = [
      { lat: 6.16, lon: -75.58, pm25: 60 },
      { lat: 6.44, lon: -75.53, pm25: 10 },
    ];
    const e = routeExposure(stations, [{ lat: 6.162, lon: -75.585 }]);
    expect(e.avgPm25).toBeGreaterThan(40);
    expect(e.dose).toBeGreaterThan(0);
  });
});

describe('humo', () => {
  it('focos demo marcados como simulados', () => {
    const foci = demoSmokeFoci();
    expect(foci).toHaveLength(3);
    expect(foci.every(f => f.simulated)).toBe(true);
  });
  it('la trayectoria avanza con el viento', () => {
    const path = trajectory(6.0, -75.0, 90, 5, 6);
    expect(path).toHaveLength(6);
    // Viento del oriente (90°) empuja hacia el occidente (lon decrece)
    expect(path[5].lon).toBeLessThan(-75.0);
  });
});