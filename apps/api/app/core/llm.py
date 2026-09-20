"""
OmniRoute: Provider-agnostic LLM client for TerraMind.
Routes queries across OpenRouter, local Ollama instances, or custom API endpoints.
"""
from typing import Dict, Any, List, Optional
import httpx
from app.core.config import settings

class OmniRouteClient:
    def __init__(self):
        self.provider = settings.DEFAULT_LLM_PROVIDER
        self.api_key = settings.OPENROUTER_API_KEY
        self.groq_key = settings.GROQ_API_KEY
        self.deepseek_key = settings.DEEPSEEK_API_KEY
        self.groq_model = settings.GROQ_MODEL
        self.default_model = settings.DEFAULT_MODEL
        self.ollama_url = settings.OLLAMA_BASE_URL

    async def complete(
        self,
        messages: List[Dict[str, str]],
        model: Optional[str] = None,
        temperature: float = 0.2
    ) -> Dict[str, Any]:
        """Dispatches completion request according to configured provider."""
        target_model = model or self.default_model

        last_error: Optional[Exception] = None
        for name in self._attempt_order():
            try:
                if name == 'groq':
                    return await self._call_groq(messages, self.groq_model, temperature)
                if name == 'openrouter':
                    return await self._call_openrouter(messages, target_model, temperature)
                if name == 'deepseek':
                    return await self._call_deepseek(messages, target_model, temperature)
                if name == 'ollama':
                    return await self._call_ollama(messages, target_model)
            except Exception as exc:
                last_error = exc
                continue
        else:
            query_text = next(
                (m["content"] for m in reversed(messages) if m.get("role") == "user"),
                "",
            )
            return {
                "content": (
                    "Demo local Valle de Aburrá (sin LLM externo). "
                    "Radar SIATA simulado: célula convectiva ~49 dBZ sobre la ladera oriental "
                    "(Santa Elena), con lluvia moderada a fuerte (35-50 mm/h) hacia el centro. "
                    "PM2.5 más alto en La Alpujarra (~38 µg/m³) y turbidez elevada en Bello "
                    "(35.2 NTU). Consulta: "
                    f"{query_text[:280]}"
                ),
                "model": target_model,
                "provider": "mock",
            }

    def _attempt_order(self) -> List[str]:
        """Proveedor configurado primero, luego otros con credencial, ollama solo si es el default."""
        order: List[str] = []
        if self.provider == 'groq' and self.groq_key:
            order.append('groq')
        if self.provider == 'openrouter' and self.api_key:
            order.append('openrouter')
        if self.provider == 'deepseek' and self.deepseek_key:
            order.append('deepseek')
        if self.provider == 'ollama':
            order.append('ollama')
        for extra, ok in (('groq', bool(self.groq_key)), ('openrouter', bool(self.api_key)), ('deepseek', bool(self.deepseek_key))):
            if ok and extra not in order:
                order.append(extra)
        return order

    async def _call_groq(self, messages: List[Dict[str, str]], model: str, temperature: float) -> Dict[str, Any]:
        if not self.groq_key:
            raise RuntimeError('sin GROQ_API_KEY')
        url = "https://api.groq.com/openai/v1/chat/completions"
        headers = {
            "Authorization": f"Bearer {self.groq_key}",
            "Content-Type": "application/json",
        }
        payload = {
            "model": model,
            "messages": messages,
            "temperature": temperature,
        }
        async with httpx.AsyncClient(timeout=30.0) as client:
            res = await client.post(url, json=payload, headers=headers)
            res.raise_for_status()
            data = res.json()
            return {
                "content": data["choices"][0]["message"]["content"],
                "model": model,
                "provider": "groq"
            }

    async def _call_openrouter(self, messages: List[Dict[str, str]], model: str, temperature: float) -> Dict[str, Any]:
        url = "https://openrouter.ai/api/v1/chat/completions"
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "HTTP-Referer": "https://terramind.org",
            "X-Title": "TerraMind Environmental Intelligence",
            "Content-Type": "application/json"
        }
        payload = {
            "model": model,
            "messages": messages,
            "temperature": temperature
        }
        async with httpx.AsyncClient(timeout=30.0) as client:
            res = await client.post(url, json=payload, headers=headers)
            res.raise_for_status()
            data = res.json()
            return {
                "content": data["choices"][0]["message"]["content"],
                "model": model,
                "provider": "openrouter"
            }

    async def _call_ollama(self, messages: List[Dict[str, str]], model: str) -> Dict[str, Any]:
        url = f"{self.ollama_url}/api/chat"
        payload = {
            "model": model,
            "messages": messages,
            "stream": False
        }
        async with httpx.AsyncClient(timeout=60.0) as client:
            res = await client.post(url, json=payload)
            res.raise_for_status()
            data = res.json()
            return {
                "content": data["message"]["content"],
                "model": model,
                "provider": "ollama"
            }

    async def _call_deepseek(self, messages: List[Dict[str, str]], model: str, temperature: float) -> Dict[str, Any]:
        if not self.deepseek_key:
            raise RuntimeError('sin DEEPSEEK_API_KEY')
        url = "https://api.deepseek.com/v1/chat/completions"
        headers = {
            "Authorization": f"Bearer {self.deepseek_key}",
            "Content-Type": "application/json",
        }
        payload = {
            "model": model,
            "messages": messages,
            "temperature": temperature,
        }
        async with httpx.AsyncClient(timeout=30.0) as client:
            res = await client.post(url, json=payload, headers=headers)
            res.raise_for_status()
            data = res.json()
            return {
                "content": data["choices"][0]["message"]["content"],
                "model": model,
                "provider": "deepseek"
            }

omniroute = OmniRouteClient()
