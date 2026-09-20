/** Niveles SIATA en vivo: parseo, umbrales oficiales y fallo honesto. */
import { describe, it, expect, vi, afterEach } from 'vitest';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

const NIVELES = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [-75.635, 6.096] },
      properties: {
        nombreEstacion: 'R. Medellin - Parque 3 Aguas',
        codigo: 106,
        municipio: 'Caldas',
        nivelActual: 20.0,
        color: '#79c454',
        fechaUltimoDato: '2026-09-15T20:35:00',
      },
    },
    {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [-75.325, 6.43] },
      properties: {
        nombreEstacion: 'Q. La Lopez - Buenos Aires',
        codigo: 251,
        municipio: 'Barbosa',
        nivelActual: 'No hay datos en el tiempo consultado',
        color: '#0e0e0e',
        fechaUltimoDato: '2026-09-15T20:35:00',
      },
    },
  ],
};

function detail(level: number, precaution: number, last: number, prev: number) {
  const y = Array.from({ length: 20 }, (_, i) =>
    i < 19 ? prev : last,
  );
  // rampa simple hacia el ultimo valor para tendencia legible
  for (let i = 0; i < 20; i++) y[i] = prev + ((last - prev) * i) / 19;
  void level;
  return {
    info: {
      Codigo: 106,
      nivelActual: last,
      nivelSeguro: 0.85,
      nivelPrecaucion: precaution,
      inundacionMenor: 1.55,
      inundacionMayor: 3.03,
      fechaUltimoDato: '2026-09-15T20:35:00',
      nivelUltimosDatos: { x: y.map((_, i) => `2026-09-15T${i}:00:00Z`), y },
    },
  };
}

function mockFetch(niveles: unknown, det: unknown, detStatus = 200) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation((url: string) => {
      if (String(url).includes('/2/niveles')) {
        return Promise.resolve({ ok: true, json: async () => niveles });
      }
      return Promise.resolve({
        ok: detStatus >= 200 && detStatus < 300,
        status: detStatus,
        json: async () => det,
      });
    }),
  );
}

describe('loadHydroGauges', () => {
  it('mapea estaciones con umbral oficial y tendencia', async () => {
    mockFetch(NIVELES, detail(0.2, 0.99, 0.5, 0.2));
    const { loadHydroGauges } = await import('../services/hydro');
    const r = await loadHydroGauges();
    expect(r.gauges).toHaveLength(1);
    const g = r.gauges[0];
    expect(g.id).toBe('hq-106');
    expect(g.river).toBe('Río Medellin');
    expect(g.name).toBe('Parque 3 Aguas');
    expect(g.level).toBe(0.5);
    expect(g.trend).toBe('up');
    expect(g.alert).toBe(false);
  });

  it('alerta cuando supera la precaucion oficial', async () => {
    mockFetch(NIVELES, detail(1.2, 0.99, 1.2, 1.2));
    const { loadHydroGauges } = await import('../services/hydro');
    const r = await loadHydroGauges();
    expect(r.gauges[0].alert).toBe(true);
    expect(r.gauges[0].trend).toBe('stable');
  });

  it('omite estaciones sin detalle y falla honesto sin red', async () => {
    mockFetch(NIVELES, null, 404);
    const { loadHydroGauges } = await import('../services/hydro');
    await expect(loadHydroGauges()).rejects.toThrow();
  });

  it('lanza si el indice falla', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('down')));
    const { loadHydroGauges } = await import('../services/hydro');
    await expect(loadHydroGauges()).rejects.toThrow();
  });
});
