/** Terramind QA — URL del radar RainViewer. */
import { describe, it, expect } from 'vitest';
import { latestRadarTileUrl } from '../services/radar';

const meta = {
  host: 'https://tilecache.rainviewer.com',
  radar: { past: [{ time: 1, path: '/v2/radar/aaa' }, { time: 2, path: '/v2/radar/bbb' }] },
};

describe('latestRadarTileUrl', () => {
  it('usa el frame más reciente', () => {
    expect(latestRadarTileUrl(meta)).toBe(
      'https://tilecache.rainviewer.com/v2/radar/bbb/256/{z}/{x}/{y}/2/1_1.png',
    );
  });

  it('null sin datos (vacío, sin host, basura)', () => {
    expect(latestRadarTileUrl({ host: 'https://x', radar: { past: [] } })).toBeNull();
    expect(latestRadarTileUrl({ radar: { past: [{ path: '/a' }] } })).toBeNull();
    expect(latestRadarTileUrl(null)).toBeNull();
    expect(latestRadarTileUrl('basura')).toBeNull();
  });
});
