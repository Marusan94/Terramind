"""Fuentes oficiales: registro + descubrimiento de informes diarios SIATA.

SIATA publica informes diarios de calidad del aire como PDF en
https://siata.gov.co/Informes_Aire/<campana>/InformesDiarios/<n>_Informe_Diario_AAAAMMDD.pdf
donde <campana> cambia por periodo de gestion (ej. 123_InformesPrimerPeriodoGestion2025).
Por eso se descubre via el indice en vez de hardcodear rutas.
"""
from __future__ import annotations

import logging
import re
from datetime import date
from urllib.parse import urljoin

import httpx

log = logging.getLogger('terramind.rag.sources')

SIATA_INDEX = 'https://siata.gov.co/Informes_Aire'
MAX_DOWNLOAD_BYTES = 50 * 1024 * 1024

OFFICIAL_SEEDS: list[dict] = [
    {
        'name': 'SIATA - Informes de calidad del aire',
        'kind': 'indice',
        'url': 'https://siata.gov.co/Informes_Aire',
        'source': 'siata',
        'notes': 'Indice de campanas e informes diarios (ingesta automatica).',
    },
    {
        'name': 'SIATA - Geoportal Ciudadano',
        'kind': 'indice',
        'url': 'https://geoportal.siata.gov.co/',
        'source': 'siata',
        'notes': 'Mapa y datos en tiempo real (referencia, no descargable).',
    },
    {
        'name': 'Area Metropolitana - Datos abiertos',
        'kind': 'indice',
        'url': 'https://datosabiertos.metropol.gov.co/',
        'source': 'gobierno',
        'notes': 'Portal de datos abiertos del Valle de Aburra.',
    },
    {
        'name': 'OMS - Guias mundiales de calidad del aire 2021',
        'kind': 'guia',
        'url': 'https://www.who.int/publications/i/item/9789240034228',
        'source': 'oms',
        'notes': 'Pagina de la guia; el PDF se sube manual o via URL.',
    },
    {
        'name': 'ONU - Objetivos de Desarrollo Sostenible',
        'kind': 'plan',
        'url': 'https://sdgs.un.org/goals',
        'source': 'ods',
        'notes': 'Indice ODS (referencia para clasificar documentos).',
    },
]

_CAMPAIGN_RE = re.compile(r'href="([^"]*?(\d+_Informes[^"]*?))/?"', re.IGNORECASE)
_DIARIO_RE = re.compile(
    r'href="([^"]*?(\d+_Informe_Diario_(\d{8})[^"]*?\.pdf))"', re.IGNORECASE
)
# Campanas 2026+: los diarios viven en la subcarpeta InformesDiarios/.
_SUBDIR_RE = re.compile(r'href="([^"]*?InformesDiarios)/?"', re.IGNORECASE)


def discover_campaigns(index_html: str, base: str = SIATA_INDEX) -> list[str]:
    """Carpetas de campana encontradas en el indice (ordenadas)."""
    found: list[str] = []
    for m in _CAMPAIGN_RE.finditer(index_html):
        url = urljoin(base + '/', m.group(1))
        if url not in found:
            found.append(url)
    return sorted(found)


def discover_diarios(index_html: str, base: str) -> dict[str, str]:
    """Mapea AAAAMMDD -> URL de informe diario en una pagina de campana."""
    out: dict[str, str] = {}
    for m in _DIARIO_RE.finditer(index_html):
        out[m.group(3)] = urljoin(base.rstrip('/') + '/', m.group(1))
    return out


async def discover_siata_daily(
    client: httpx.AsyncClient, day: date | None = None
) -> str | None:
    """URL del informe diario SIATA para `day` (hoy por defecto).

    Recorre campanas de mas nueva a mas vieja y busca el PDF de la fecha.
    Devuelve None si no lo encuentra (red caida, fecha futura, etc.).
    """
    target = (day or date.today()).strftime('%Y%m%d')
    try:
        # SIATA responde 301 sin slash final: hay que seguir redirects.
        r = await client.get(SIATA_INDEX, timeout=30.0, follow_redirects=True)
        r.raise_for_status()
    except Exception as exc:
        log.warning('SIATA index unreachable: %s', exc)
        return None
    campaigns = discover_campaigns(r.text)
    for camp in reversed(campaigns):
        pages = [camp]
        try:
            rc = await client.get(camp, timeout=30.0, follow_redirects=True)
            rc.raise_for_status()
        except Exception as exc:
            log.warning('SIATA campaign %s unreachable: %s', camp, exc)
            continue
        seen = {camp}
        for m in _SUBDIR_RE.finditer(rc.text):
            sub = urljoin(camp.rstrip('/') + '/', m.group(1))
            if sub not in seen:
                seen.add(sub)
                pages.append(sub)
        for page in pages:
            if page == camp:
                html = rc.text
            else:
                try:
                    rp = await client.get(page, timeout=30.0, follow_redirects=True)
                    rp.raise_for_status()
                    html = rp.text
                except Exception as exc:
                    log.warning('SIATA page %s unreachable: %s', page, exc)
                    continue
            diarios = discover_diarios(html, page)
            if target in diarios:
                return diarios[target]
    return None


async def fetch_bytes(client: httpx.AsyncClient, url: str) -> bytes:
    """Descarga con limite de tamano y content-type afiche."""
    async with client.stream('GET', url, timeout=60.0, follow_redirects=True) as r:
        r.raise_for_status()
        buf = bytearray()
        async for chunk in r.aiter_bytes(65536):
            buf.extend(chunk)
            if len(buf) > MAX_DOWNLOAD_BYTES:
                raise ValueError(f'Descarga excede {MAX_DOWNLOAD_BYTES} bytes: {url}')
        return bytes(buf)