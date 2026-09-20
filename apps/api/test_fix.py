import asyncio
from app.core.llm import omniroute
from app.core.config import settings

print('=== CONFIGURACION FINAL ===')
print('Provider default:', settings.DEFAULT_LLM_PROVIDER)
print('OpenRouter key:', 'OK' if settings.OPENROUTER_API_KEY else 'MISSING')
print('Groq key:', 'OK' if settings.GROQ_API_KEY else 'MISSING')
print('Intento de orden:', omniroute._attempt_order())
print()

async def test_full_flow():
    # Test OpenRouter
    print('--- Prueba 1: OpenRouter ---')
    try:
        r = await omniroute.complete([{'role': 'user', 'content': 'hola'}])
        print('Provider:', r.get('provider'), '| Model:', r.get('model'))
    except Exception as e:
        print('Error/OpenRouter agotado')
    
    # Test Groq fallback
    print('--- Prueba 2: Groq (fallback) ---')
    omniroute.provider = 'groq'
    r = await omniroute.complete([{'role': 'user', 'content': 'hola'}])
    print('Provider:', r.get('provider'), '| Model:', r.get('model'), '| OK')
    
    # Test ollama
    print('--- Prueba 3: Ollama local ---')
    omniroute.provider = 'ollama'
    r = await omniroute.complete([{'role': 'user', 'content': 'hola'}])
    print('Provider:', r.get('provider'))

asyncio.run(test_full_flow())
print('=== FIN DE PRUEBAS ===')