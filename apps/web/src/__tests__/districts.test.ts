/** Terramind QA — promedio de AQI por municipio. */
import { describe, it, expect } from 'vitest';
import { aggregateByDistrict, ValleyStation } from '../services/valley';

function st(over: Partial<ValleyStation>): ValleyStation {
  return {
    id: 'x', code: 'x', name: 'X', district: 'Bello',
    lat: 6.33, lon: -75.55, elevation: 1420,
    pm25: 20, pm10: 30, o3: 40, no2: 15,
    aqi: 60, category: 'Moderado', color: '#eab308',
    quality: 'VALID',
    ...over,
  };
}

describe('aggregateByDistrict', () => {
  it('promedia solo estaciones con dato válido', () => {
    const out = aggregateByDistrict([
      st({ district: 'Bello', aqi: 60 }),
      st({ district: 'Bello', aqi: 80 }),
      st({ district: 'Bello', aqi: 0, quality: 'MISSING' }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].avgAqi).toBe(70);
    expect(out[0].valid).toBe(2);
    expect(out[0].total).toBe(3);
  });

  it('todo MISSING → s/d (null), nunca 0', () => {
    const out = aggregateByDistrict([st({ district: 'Caldas', quality: 'MISSING', aqi: 0 })]);
    expect(out[0].avgAqi).toBeNull();
    expect(out[0].color).toBe('#6b7280');
  });

  it('agrupa por municipio con su centroide', () => {
    const out = aggregateByDistrict([
      st({ district: 'Bello', lat: 6.3, lon: -75.5 }),
      st({ district: 'Envigado', lat: 6.1, lon: -75.6 }),
    ]);
    expect(out).toHaveLength(2);
    expect(out.map(d => d.district).sort()).toEqual(['Bello', 'Envigado']);
  });

  it('vacío → []', () => {
    expect(aggregateByDistrict([])).toEqual([]);
  });
});
