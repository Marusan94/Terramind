/** Terramind QA Profesional — Bordes EPA + robustez calculateAQI.
 * Fuente verdad: US EPA breakpoints PM2.5 (PRD §8, data/stations.ts).
 * Cubre el gap: stations.ts tenía 97% líneas pero solo 60% ramas.
 */
import { describe, it, expect } from 'vitest';
import { calculateAQI } from '../data/stations';

describe('calculateAQI — breakpoints EPA PM2.5', () => {
  const cases: Array<[number, number, string]> = [
    [0, 0, 'Bueno'],
    [12.0, 50, 'Bueno'],
    [12.1, 51, 'Moderado'],
    [35.4, 100, 'Moderado'],
    [35.5, 101, 'Insalubre para sensibles'],
    [55.4, 150, 'Insalubre para sensibles'],
    [55.5, 151, 'Insalubre'],
    [150.4, 200, 'Insalubre'],
    [150.5, 201, 'Muy insalubre'],
    [250.4, 300, 'Muy insalubre'],
    [250.5, 301, 'Peligroso'],
    [500.4, 500, 'Peligroso'],
  ];
  for (const [pm25, aqi, cat] of cases) {
    it(`PM2.5 ${pm25} → AQI ${aqi} (${cat})`, () => {
      const r = calculateAQI(pm25, pm25 * 1.5, 45, 20);
      expect(r.aqi).toBe(aqi);
      expect(r.category).toBe(cat);
    });
  }

  it('clampa >500.4 a AQI 500 Peligroso', () => {
    const r = calculateAQI(600, 800, 100, 50);
    expect(r.aqi).toBe(500);
    expect(r.category).toBe('Peligroso');
    expect(r.level).toBe(6);
  });

  it('niveles 1-6 monótonos con categorías OMS/ES', () => {
    expect(calculateAQI(10, 0, 0, 0).level).toBe(1);
    expect(calculateAQI(30, 0, 0, 0).level).toBe(2);
    expect(calculateAQI(40, 0, 0, 0).level).toBe(3);
    expect(calculateAQI(100, 0, 0, 0).level).toBe(4);
    expect(calculateAQI(200, 0, 0, 0).level).toBe(5);
    expect(calculateAQI(300, 0, 0, 0).level).toBe(6);
  });
});

describe('calculateAQI — robustez (documenta comportamiento actual)', () => {
  it('PM2.5 negativo hoy retorna 0 Bueno — debe validarse aguas arriba', () => {
    const r = calculateAQI(-5, 0, 0, 0);
    // Comportamiento actual sin clamp inferior: se registra como deuda.
    expect(r.aqi).toBe(0);
    expect(r.category).toBe('Bueno');
  });

  it('colores por categoría son hex válidos', () => {
    for (const pm of [5, 20, 40, 80, 180, 300]) {
      const { color } = calculateAQI(pm, 0, 0, 0);
      expect(color).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });
});
