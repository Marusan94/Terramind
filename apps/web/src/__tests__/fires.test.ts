/** FIRMS: sin key → null (demo); parseo CSV por cabecera. */
import { describe, it, expect, vi, afterEach } from 'vitest';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

const VIIRS_CSV = [
  'latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_ti5,frp,daynight',
  '6.310,-75.070,320.5,1.0,1.0,2026-09-16,1345,Terra,VIIRS,h,2.0NRT,290.3,18.4,D',
  '5.950,-74.900,300.1,1.0,1.0,2026-09-16,0200,Aqua,VIIRS,l,2.0NRT,280.0,9.7,N',
].join('\n');

describe('fires sin key', () => {
  it('firmsConfigured falso y loadFireFoci null', async () => {
    vi.stubEnv('VITE_FIRMS_MAP_KEY', '');
    const { firmsConfigured, loadFireFoci } = await import('../services/fires');
    expect(firmsConfigured()).toBe(false);
    expect(await loadFireFoci()).toBeNull();
  });
});

describe('parseFirmsCsv', () => {
  it('parsea focos VIIRS con confianza y FRP', async () => {
    const { parseFirmsCsv } = await import('../services/fires');
    const foci = parseFirmsCsv(VIIRS_CSV);
    expect(foci).toHaveLength(2);
    expect(foci[0]).toMatchObject({ lat: 6.31, lon: -75.07, frp: 18.4, confidence: 'alta', simulated: false });
    expect(foci[1].confidence).toBe('baja');
    expect(foci[0].name).toContain('FIRMS');
  });

  it('csv vacío o sin coords → []', async () => {
    const { parseFirmsCsv } = await import('../services/fires');
    expect(parseFirmsCsv('latitude,longitude\n')).toEqual([]);
    expect(parseFirmsCsv('foo,bar\n1,2\n')).toEqual([]);
  });
});
