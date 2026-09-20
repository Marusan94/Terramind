/** Puente RAG: backend cuando hay API, local como respaldo. */
import { describe, it, expect, vi, afterEach } from 'vitest';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
  vi.restoreAllMocks();
});

const HIT = {
  n: 1,
  title: 'SIATA informe diario',
  source: 'siata',
  kind: 'informe_diario',
  uri: 'https://siata.gov.co/x.pdf',
  section: 'Calidad del aire',
  page: 2,
  excerpt: 'PM2.5 en Itagui alcanza 36 ug/m3',
  score: 0.8,
};

describe('retrieveContext', () => {
  it('usa el backend cuando devuelve hits', async () => {
    vi.stubEnv('VITE_API_URL', 'http://api.test');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ hits: [HIT] }) }),
    );
    const { retrieveContext } = await import('../services/ragBackend');
    const r = await retrieveContext('inversion termica');
    expect(r.origin).toBe('backend');
    expect(r.results).toHaveLength(1);
    expect(r.results[0].documentName).toContain('siata');
    expect(r.results[0].relevance).toBe('high');
  });

  it('cae al RAG local si el backend falla', async () => {
    vi.stubEnv('VITE_API_URL', 'http://api.test');
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('down')));
    const { retrieveContext } = await import('../services/ragBackend');
    const r = await retrieveContext('consulta cualquiera');
    expect(r.origin).toBe('local');
  });

  it('va directo a local sin VITE_API_URL', async () => {
    vi.stubEnv('VITE_API_URL', '');
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const { retrieveContext } = await import('../services/ragBackend');
    const r = await retrieveContext('consulta cualquiera');
    expect(r.origin).toBe('local');
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('askCopilot', () => {
  it('usa el backend cuando hay API', async () => {
    vi.stubEnv('VITE_API_URL', 'http://api.test');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          summary: 'hola',
          confidence_score: 0.9,
          metrics: { model_engine: 'groq/compound' },
          sources: [],
          suggested_actions: [],
        }),
      }),
    );
    const { askCopilot } = await import('../services/ragBackend');
    const r = await askCopilot('hola');
    expect(r?.summary).toBe('hola');
  });

  it('devuelve null sin VITE_API_URL', async () => {
    vi.stubEnv('VITE_API_URL', '');
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const { askCopilot } = await import('../services/ragBackend');
    expect(await askCopilot('hola')).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('devuelve null si el backend falla', async () => {
    vi.stubEnv('VITE_API_URL', 'http://api.test');
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('down')));
    const { askCopilot } = await import('../services/ragBackend');
    expect(await askCopilot('hola')).toBeNull();
  });
});

describe('sourceMeta', () => {
  it('etiqueta ambitos municipal/nacional/internacional', async () => {
    const { sourceMeta } = await import('../services/ragBackend');
    expect(sourceMeta('siata').scope).toContain('Municipal');
    expect(sourceMeta('gobierno').scope).toContain('Nacional');
    expect(sourceMeta('oms').scope).toContain('Internacional');
    expect(sourceMeta('xxx').label).toBe('Otro');
  });
});
