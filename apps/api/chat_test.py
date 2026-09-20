import asyncio
from app.core.llm import omniroute

async def chat_with_model():
    print("=== Chat con TerraMind OmniRoute ===")
    print("Escribiendo al modelo...")
    print()
    
    # Enviar mensaje al modelo
    messages = [{"role": "user", "content": "Hola! ¿Cómo estás?"}]
    
    try:
        result = await omniroute.complete(messages)
        print("Respuesta del modelo:")
        print("=" * 50)
        print("Proveedor (provider):", result.get("provider"))
        print("Modelo (model):", result.get("model"))
        content = result.get("content", "Sin contenido")
        # Mostrar contenido reemplazando caracteres problemáticos
        safe_content = content.encode('ascii', 'replace').decode('ascii') if content else "Sin contenido"
        print("Contenido (content):", safe_content)
        print("=" * 50)
        
        # Verificar estructura
        print()
        print("--- Estructura de la respuesta ---")
        print("Tiene 'content':", "content" in result)
        print("Tiene 'model':", "model" in result)
        print("Tiene 'provider':", "provider" in result)
        
    except Exception as e:
        print("Error:", type(e).__name__, str(e))
        import traceback
        traceback.print_exc()

asyncio.run(chat_with_model())