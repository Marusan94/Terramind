/**
 * Compartir reporte: Web Share API con caida a portapapeles.
 * El texto incluye SIEMPRE la procedencia (real vs demo) para no inducir error.
 */

export interface ShareSnapshot {
  avgAqi: number;
  avgPm25: number;
  avgPm10: number;
  category: string;
  generatedAt: number;
  source: string;
  dataDate: string;
  stations: number;
}

export function buildShareText(s: ShareSnapshot): string {
  const fecha = new Date(s.generatedAt).toLocaleString('es-CO', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
  return (
    `Terramind · Valle de Aburrá — AQI ${s.avgAqi} (${s.category}), ` +
    `PM2.5 ${s.avgPm25} µg/m³, PM10 ${s.avgPm10} µg/m³ · ` +
    `${s.stations} estaciones · ${fecha} · Fuente: ${s.source} (${s.dataDate})`
  );
}

type ShareNav = Navigator & {
  share?: (data: { title?: string; text?: string; url?: string }) => Promise<void>;
};

/** 'shared' | 'copied' | 'failed' (sin lanzar excepciones). */
export async function shareReport(s: ShareSnapshot): Promise<'shared' | 'copied' | 'failed'> {
  const text = buildShareText(s);
  const nav: ShareNav | undefined =
    typeof navigator !== 'undefined' ? (navigator as ShareNav) : undefined;

  if (nav?.share) {
    try {
      await nav.share({ title: 'Terramind · Calidad del aire', text, url: window.location.href });
      return 'shared';
    } catch {
      // share falló (cancelado, bloqueado) → intentamos clipboard
    }
  }
  if (nav?.clipboard?.writeText) {
    try {
      await nav.clipboard.writeText(text);
      return 'copied';
    } catch {
      // clipboard falló → failed
    }
  }
  return 'failed';
}
