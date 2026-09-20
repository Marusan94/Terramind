from typing import List, Optional
from fastapi import APIRouter, Query
from pydantic import BaseModel

router = APIRouter()

class GeoJSONGeometry(BaseModel):
    type: str
    coordinates: list

class GeoJSONFeature(BaseModel):
    type: str = "Feature"
    geometry: GeoJSONGeometry
    properties: dict

class GeoJSONFeatureCollection(BaseModel):
    type: str = "FeatureCollection"
    features: List[GeoJSONFeature]

@router.get("/layers", tags=["spatial"])
async def list_layers():
    """Lists available 3D environmental map layers."""
    return [
        {"id": "satellite-base", "name": "Sentinel-2 Optical (10m)", "category": "satellite", "enabled": True},
        {"id": "elevation-dem", "name": "3D Terrain Elevation (DEM)", "category": "terrain", "enabled": True},
        {"id": "water-network", "name": "Hydrological River Basins", "category": "water", "enabled": True},
        {"id": "air-stations", "name": "Real-time PM2.5 Stations", "category": "air", "enabled": True},
        {"id": "vegetation-ndvi", "name": "NDVI Canopy Density", "category": "vegetation", "enabled": False},
        {"id": "heat-risk-forecast", "name": "Urban Heat Risk Forecast", "category": "prediction", "enabled": False}
    ]

@router.get("/features/bbox", response_model=GeoJSONFeatureCollection, tags=["spatial"])
async def get_features_by_bbox(
    min_lon: float = Query(-180.0, ge=-180.0, le=180.0),
    min_lat: float = Query(-90.0, ge=-90.0, le=90.0),
    max_lon: float = Query(180.0, ge=-180.0, le=180.0),
    max_lat: float = Query(90.0, ge=-90.0, le=90.0),
    category: Optional[str] = None
):
    """Retrieves spatial environmental features within a bounding box.

    Sin fuente de estaciones en el backend todavia: coleccion honesta y vacia
    (antes devolvia un punto inventado). Las estaciones reales viven en el
    frontend (SIATA historico + CAMS) hasta la fase de ingesta hidrometrica.
    """
    return GeoJSONFeatureCollection(features=[])
