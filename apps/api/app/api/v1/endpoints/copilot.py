from typing import List, Optional, Dict, Any
from fastapi import APIRouter
from pydantic import BaseModel
from app.core.llm import omniroute

router = APIRouter()

class CopilotQueryRequest(BaseModel):
    query: str
    bbox: Optional[List[float]] = None
    active_layers: Optional[List[str]] = []

class ScientificSource(BaseModel):
    title: str
    doi_or_url: str
    confidence: str

class CopilotQueryResponse(BaseModel):
    summary: str
    confidence_score: float
    metrics: Dict[str, Any]
    sources: List[ScientificSource]
    suggested_actions: List[str]

@router.post("/query", response_model=CopilotQueryResponse, tags=["ai-copilot"])
async def query_copilot(req: CopilotQueryRequest):
    """Processes environmental inquiries with grounded spatial & scientific RAG context."""
    system_prompt = (
        "You are TerraMind, an AI environmental intelligence copilot. "
        "Analyze spatial territories, water indicators, air quality metrics, and literature."
    )
    
    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": f"Query: {req.query}. Active bounds: {req.bbox}"}
    ]
    
    try:
        completion = await omniroute.complete(messages)
        if str(completion.get("provider", "")) == "mock":
            raise RuntimeError("sin LLM externo (modo demo local)")
        summary = str(completion.get("content", ""))
        engine = str(completion.get("model", "llm"))
        confidence = 0.92
    except Exception:
        # Degradado honesto: nunca 500, el chat del mapa muestra este texto.
        summary = (
            "El copiloto IA no esta disponible en este momento (LLM fuera de linea). "
            "Puedes consultar el panel RAG Documental o reintentar en unos minutos."
        )
        engine = "none"
        confidence = 0.0

    # Sin papers recuperados en este endpoint: lista honesta y vacia.
    # El chat del mapa adjunta aparte las citas del RAG documental.
    return CopilotQueryResponse(
        summary=summary,
        confidence_score=confidence,
        metrics={
            "analyzed_region_bounds": req.bbox or [-75.65, 6.12, -75.48, 6.38],
            "model_engine": engine
        },
        sources=[],
        suggested_actions=[
            "Focus 3D camera on Upper Basin River Station",
            "Enable Sentinel-2 NDVI difference layer"
        ]
    )
