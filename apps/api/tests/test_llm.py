"""OmniRoute: cadena groq -> openrouter -> ollama -> mock (sin red real)."""
import pytest

from app.core.llm import OmniRouteClient


def _client(**kw):
    c = OmniRouteClient()
    c.provider = kw.get('provider', 'groq')
    c.groq_key = kw.get('groq_key', 'k')
    c.api_key = kw.get('api_key', '')
    c.groq_model = 'llama-3.1-8b-instant'
    return c


def test_attempt_order_default_first():
    c = _client(provider='groq', groq_key='k', api_key='')
    assert c._attempt_order()[0] == 'groq'
    c2 = _client(provider='openrouter', groq_key='', api_key='k')
    assert c2._attempt_order() == ['openrouter']


@pytest.mark.asyncio
async def test_groq_success(monkeypatch):
    async def fake(self, messages, model, temperature):
        return {'content': 'hola', 'model': model, 'provider': 'groq'}

    monkeypatch.setattr(OmniRouteClient, '_call_groq', fake)
    out = await _client().complete([{'role': 'user', 'content': 'hola'}])
    assert out['provider'] == 'groq' and out['content'] == 'hola'


@pytest.mark.asyncio
async def test_fallback_to_mock_when_groq_fails(monkeypatch):
    async def boom(self, messages, model, temperature):
        raise ConnectionError('caido')

    monkeypatch.setattr(OmniRouteClient, '_call_groq', boom)
    out = await _client(provider='groq', groq_key='k', api_key='').complete(
        [{'role': 'user', 'content': 'aire?'}]
    )
    assert out['provider'] == 'mock'
    assert 'aire?' in out['content']