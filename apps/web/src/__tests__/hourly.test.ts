/** Terramind QA — pronóstico horario de lluvia (Open-Meteo → valley). */
import { describe, it, expect } from 'vitest';
import { toValleyHourly } from '../services/valley';

const fake = {
  time: ['2026-09-18T14:00', '2026-09-18T15:00', '2026-09-18T16:00'],
  temperature: [22.4, 21.1, 20.0],
  precipitation: [0, 0.3, 2.55],
  precipitationProbability: [5, 45, 120],
  humidity: [70, 75, 80],
  weatherCode: [2, 61, 63],
  windSpeed: [8, 9, 10],
  windDirection: [180, 190, 200],
  cloudCover: [40, 60, 90],
};

describe('toValleyHourly', () => {
  it('mapea prob. y mm, recorta a 12h y clampa 0-100', () => {
    const h = toValleyHourly(fake);
    expect(h).toHaveLength(3);
    expect(h[0]).toEqual({ time: '2026-09-18T14:00', temp: 22.4, precipProb: 5, precip: 0 });
    expect(h[1].precipProb).toBe(45);
    expect(h[2].precipProb).toBe(100); // clamp
    expect(h[2].precip).toBe(2.6); // redondeo 1 decimal
  });

  it('null o vacío → [] sin romper', () => {
    expect(toValleyHourly(null)).toEqual([]);
    expect(toValleyHourly({ ...fake, time: [] })).toEqual([]);
  });
});
