/** Terramind QA — comunas: geometría, asignación AQI y temperaturas. */
import { describe, it, expect } from 'vitest';
import {
  parseComunas, pointInRing, ringCentroid, assignComunaAqi, mapComunaTemps, ComunaFeature,
} from '../services/comunas';

const square: ComunaFeature = {
  id: 'comuna-01', name: 'Popular',
  polygon: [[[-75.55, 6.28], [-75.53, 6.28], [-75.53, 6.30], [-75.55, 6.30], [-75.55, 6.28]]],
  centroid: { lat: 6.29, lon: -75.54 },
};

const st = (over: any = {}) => ({
  name: 'E1', district: 'Medellín', lat: 6.29, lon: -75.54,
  aqi: 60, color: '#eab308', quality: 'VALID' as const, ...over,
});

describe('pointInRing / ringCentroid', () => {
  it('detecta dentro y fuera', () => {
    expect(pointInRing(-75.54, 6.29, square.polygon[0])).toBe(true);
    expect(pointInRing(-75.60, 6.29, square.polygon[0])).toBe(false);
  });

  it('centroide del bbox', () => {
    const c = ringCentroid(square.polygon[0]);
    expect(c.lat).toBeCloseTo(6.29, 6);
    expect(c.lon).toBeCloseTo(-75.54, 6);
  });
});

describe('parseComunas', () => {
  it('parsea FeatureCollection oficial (código + nombre)', () => {
    const out = parseComunas({
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        properties: { codigo: '01', nombre: 'Popular' },
        geometry: { type: 'Polygon', coordinates: [square.polygon[0]] },
      }],
    });
    expect(out).toHaveLength(1);
    expect(out[0].name).toBe('Popular');
    expect(out[0].centroid.lat).toBeCloseTo(6.29, 6);
    expect(out[0].centroid.lon).toBeCloseTo(-75.54, 6);
  });

  it('ignora features sin geometría', () => {
    expect(parseComunas({ features: [{ properties: { nombre: 'X' } }] })).toEqual([]);
  });
});

describe('assignComunaAqi', () => {
  it('promedia estaciones DENTRO', () => {
    const r = assignComunaAqi(square, [st({ aqi: 50 }), st({ aqi: 70, lat: 6.295 })]);
    expect(r).toMatchObject({ aqi: 60, origin: 'inside' });
  });

  it('sin estaciones dentro → nearest estimado con distancia', () => {
    const r = assignComunaAqi(square, [st({ lat: 6.35, lon: -75.54 })]);
    expect(r.origin).toBe('nearest');
    expect(r.distKm).toBeGreaterThan(0);
    expect(r.aqi).toBe(60);
  });

  it('ignora MISSING y lejos >12km → none (nunca 0)', () => {
    const r = assignComunaAqi(square, [
      st({ quality: 'MISSING', aqi: 0 }),
      st({ lat: 7.0, lon: -76.0 }),
    ]);
    expect(r).toMatchObject({ aqi: null, origin: 'none' });
  });
});

describe('mapComunaTemps', () => {
  it('mapea arreglo multi-coordenada y nulos', () => {
    expect(mapComunaTemps(
      [{ current: { temperature_2m: 22.44 } }, { current: {} }], 2,
    )).toEqual([22.4, null]);
  });
});
