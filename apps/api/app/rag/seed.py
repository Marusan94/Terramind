"""Documentos demo para ver el RAG sin Postgres (modo memoria).

Cobertura municipal / nacional / internacional del dominio ambiental.
Van marcados origin=demo-seed para distinguirlos de ingesta real SIATA
o subidas del usuario.
"""
from __future__ import annotations

DEMO_DOCS: list[dict] = [
    {
        'title': 'SIATA informe diario 2025-03-28 (demo)',
        'source': 'siata',
        'kind': 'informe_diario',
        'filename': 'informe_demo.txt',
        'uri': 'https://siata.gov.co/Informes_Aire',
        'external_id': 'demo:siata:2025-03-28',
        'metadata': {'origin': 'demo-seed', 'day': '2025-03-28'},
        'text': (
            '# Informe diario de calidad del aire 2025-03-28\n\n'
            'Las 20 estaciones poblacionales de PM2.5 presentan calidad del aire '
            'Aceptable (ICA amarillo), con promedios de 24 horas de hasta 36 ug/m3 '
            'en la estacion Casa de Justicia del municipio de Itagui.\n\n'
            '## Pronostico\n\n'
            'El modelo estadistico sugiere que Itagui alcanzaria calidad danina '
            'para grupos sensibles (ICA naranja) en las proximas horas, mientras '
            'el resto de estaciones continuan en ICA amarillo.\n\n'
            '## Condiciones meteorologicas\n\n'
            'Alta cobertura de nubes de bajo nivel en el territorio metropolitano. '
            'Marzo presenta estabilidad atmosferica casi permanente por inversion '
            'termica, lo que impide la dispersion de contaminantes.'
        ),
    },
    {
        'title': 'Plan de descontaminacion - lineamientos (demo)',
        'source': 'gobierno',
        'kind': 'plan',
        'filename': 'plan_demo.txt',
        'uri': None,
        'external_id': 'demo:gobierno:plan-aire',
        'metadata': {'origin': 'demo-seed'},
        'text': (
            '# Lineamientos de calidad del aire\n\n'
            'Colombia adopta metas intermedias de la OMS 2021: PM2.5 por debajo de '
            '15 ug/m3 como promedio anual de referencia.\n\n'
            '## Medidas\n\n'
            'Pico y placa ambiental, fortalecimiento del transporte publico electrico '
            'y control a fuentes fijas industriales en el Valle de Aburra. '
            'Los grupos sensibles deben limitar la exposicion prolongada en hora pico.'
        ),
    },
    {
        'title': 'OMS guias de calidad del aire 2021 (demo)',
        'source': 'oms',
        'kind': 'guia',
        'filename': 'oms_demo.txt',
        'uri': 'https://www.who.int/publications/i/item/9789240034228',
        'external_id': 'demo:oms:aqg2021',
        'metadata': {'origin': 'demo-seed'},
        'text': (
            '# Guias mundiales de calidad del aire OMS 2021 (resumen demo)\n\n'
            'La OMS recomienda PM2.5 medio anual por debajo de 5 ug/m3 y media '
            'de 24 horas por debajo de 15 ug/m3. Para PM10: 15 anual y 45 en 24 '
            'horas. Son valores de referencia para proteger la salud.\n\n'
            '## Alcance\n\n'
            'Aplica a evaluaciones municipales y nacionales de riesgo por '
            'contaminacion atmosferica.'
        ),
    },
    {
        'title': 'ODS 3 y 11 - salud y ciudades (demo)',
        'source': 'ods',
        'kind': 'plan',
        'filename': 'ods_demo.txt',
        'uri': 'https://sdgs.un.org/goals',
        'external_id': 'demo:ods:3-11',
        'metadata': {'origin': 'demo-seed'},
        'text': (
            '# ODS 3 Salud y ODS 11 Ciudades sostenibles (resumen demo)\n\n'
            'El ODS 3 busca reducir las muertes por contaminacion del aire. '
            'El ODS 11 pide ciudades con aire limpio y transporte sostenible, '
            'relevante para el Valle de Aburra y Medellin.\n\n'
            '## Indicadores\n\n'
            'Tasa de mortalidad atribuida a la contaminacion atmosferica y '
            'proporcion de poblacion con acceso a transporte publico.'
        ),
    },
]


async def seed_demo_docs(store, embedder) -> list[dict]:
    """Ingiere los demos via el pipeline real (chunking + embeddings)."""
    from app.rag.ingest import ingest_bytes

    out = []
    for d in DEMO_DOCS:
        summary = await ingest_bytes(
            store,
            embedder,
            title=d['title'],
            source=d['source'],
            kind=d['kind'],
            filename=d['filename'],
            data=d['text'].encode('utf-8'),
            external_id=d['external_id'],
            uri=d['uri'],
            metadata=d['metadata'],
        )
        out.append(summary)
    return out