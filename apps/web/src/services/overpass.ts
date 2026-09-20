/**
 * Áreas verdes y cauces REALES vía Overpass API (OpenStreetMap, sin llave).
 *
 * Trae parques, jardines, bosques y quebradas del Valle de Aburrá con
 * nombre y coordenadas reales. Sin red o sin resultados → null y la app
 * usa demoParks() etiquetado. El NDVI sigue demo hasta Copernicus.
 */

export interface GreenArea {
  id: string;
  name: string;
  kind: 'parque' | 'bosque' | 'quebrada';
  lat: number;
  lon: number;
}

// Valle de Aburrá + Oriente cercano (sur,oeste,norte,este para Overpass)
const BBOX = '5.9,-75.9,6.6,-75.0';

const QUERY = `[out:json][timeout:25];
(
  node["leisure"~"^(park|garden)$"](${BBOX});
  way["leisure"~"^(park|garden)$"](${BBOX});
  node["landuse"="forest"](${BBOX});
  way["landuse"="forest"](${BBOX});
  node["natural"="wood"](${BBOX});
  way["natural"="wood"](${BBOX});
  way["waterway"~"^(stream|river)$"](${BBOX});
);
out center 80;`;

function kindOf(tags: Record<string, string>): GreenArea['kind'] | null {
  if (tags.leisure === 'park' || tags.leisure === 'garden') return 'parque';
  if (tags.landuse === 'forest' || tags.natural === 'wood') return 'bosque';
  if (tags.waterway === 'stream' || tags.waterway === 'river') return 'quebrada';
  return null;
}

/** Parsea respuesta Overpass (nodos con lat/lon, vías con center). Exportado para tests. */
export function parseOverpass(json: any): GreenArea[] {
  const els: any[] = Array.isArray(json?.elements) ? json.elements : [];
  const out: GreenArea[] = [];
  const seen = new Set<string>();
  for (const el of els) {
    const tags = (el?.tags ?? {}) as Record<string, string>;
    const kind = kindOf(tags);
    if (!kind) continue;
    const name = String(tags.name ?? '').trim();
    if (!name) continue;
    const lat = Number(el.lat ?? el?.center?.lat);
    const lon = Number(el.lon ?? el?.center?.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const key = `${kind}:${name.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ id: `osm-${el.type}-${el.id}`, name, kind, lat, lon });
    if (out.length >= 60) break;
  }
  return out;
}

export async function loadGreenAreas(): Promise<GreenArea[] | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 28000);
  try {
    const res = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
      body: `data=${encodeURIComponent(QUERY)}`,
      signal: ctrl.signal,
    });
    if (!res.ok) return null;
    const areas = parseOverpass(await res.json());
    return areas.length ? areas : null;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}
