import pytest
from httpx import AsyncClient, ASGITransport
from app.main import app


@pytest.mark.asyncio
async def test_health_check():
    """Test the health check endpoint."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/api/v1/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"
        assert "version" in data


@pytest.mark.asyncio
async def test_root_endpoint():
    """Test the root endpoint."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/")
        assert response.status_code == 200
        data = response.json()
        assert "message" in data
        assert "docs" in data


@pytest.mark.asyncio
async def test_copilot_endpoint_mock(monkeypatch):
    """Test the copilot endpoint in demo mode (no LLM configured)."""
    # Hermetico: la maquina puede tener OPENROUTER_API_KEY en el entorno.
    from app.core.llm import omniroute
    monkeypatch.setattr(omniroute, 'api_key', '')
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/api/v1/copilot/query",
            json={
                "query": "What is the air quality in Valle de Aburrá?",
                "bbox": [-75.65, 6.12, -75.48, 6.38]
            }
        )
        assert response.status_code == 200
        data = response.json()
        assert "summary" in data
        assert "confidence_score" in data
        assert "sources" in data
        assert "metrics" in data
        # Cero citas inventadas: sin papers recuperados, lista vacia honesta.
        assert data["sources"] == []


@pytest.mark.asyncio
async def test_copilot_endpoint_degraded_without_llm(monkeypatch):
    """Sin LLM el copiloto responde degradado (200), nunca 500."""
    from app.core import llm as llm_mod

    async def boom(messages, model=None, temperature=0.2):
        raise ConnectionError("sin red")

    monkeypatch.setattr(llm_mod.omniroute, "complete", boom)
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/api/v1/copilot/query",
            json={"query": "hola"}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["confidence_score"] == 0.0
        assert data["summary"]


@pytest.mark.asyncio
async def test_copilot_endpoint_mock_fallback_is_degraded(monkeypatch):
    """Si OmniRoute cae a mock, el copiloto lo marca (confianza 0), no 0.92."""
    from app.core import llm as llm_mod

    async def fake_mock(messages, model=None, temperature=0.2):
        return {"content": "demo", "model": "x", "provider": "mock"}

    monkeypatch.setattr(llm_mod.omniroute, "complete", fake_mock)
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/api/v1/copilot/query",
            json={"query": "hola"}
        )
        assert response.status_code == 200
        assert response.json()["confidence_score"] == 0.0


@pytest.mark.asyncio
async def test_spatial_layers():
    """Test the spatial layers endpoint."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/api/v1/spatial/layers")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert len(data) > 0


@pytest.mark.asyncio
async def test_spatial_features_bbox():
    """Test the spatial features by bounding box endpoint."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get(
            "/api/v1/spatial/features/bbox",
            params={
                "min_lon": -75.65,
                "min_lat": 6.12,
                "max_lon": -75.48,
                "max_lat": 6.38
            }
        )
        assert response.status_code == 200
        data = response.json()
        assert data["type"] == "FeatureCollection"
        assert "features" in data
