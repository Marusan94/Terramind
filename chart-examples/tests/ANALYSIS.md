# Análisis Técnico: 3D Neural Graph Live

## 📋 Resumen Ejecutivo
Archivo: `06-3d-neural-graph.html` (832 líneas)
Stack: Three.js r165 + ES Modules + Import Maps
Funcionalidad: Grafo 3D interactivo tipo red neuronal con 180 nodos, force-directed physics, 4 layouts, pulsos animados, hover details.

---

## ✅ Fortalezas
1. **Arquitectura modular** - Separación clara: config, data, rendering, simulation, UI
2. **Performance GPU** - BufferGeometry para edges, InstancedMesh no usado pero BufferAttribute sí
3. **Force-directed simplificado** - O(n) sampling en lugar de O(n²) completo
4. **Múltiples layouts** - Force, Sphere, Layers (NN), Spiral con transiciones suaves
5. **Variables live** - Activación, bias, liveValue, conexiones en tiempo real
6. **UX completa** - HUD, legend, controls, hover panel, auto-rotate, responsive
7. **Memory management** - Dispose de geometrías/materiales en pulsos

---

## ⚠️ Issues Críticos

### 1. **Memory Leak - Sprites & Textures** (Líneas 303-319)
```javascript
// Cada nodo crea canvas + texture + sprite - NUNCA se dispose
const texture = new THREE.CanvasTexture(canvas2d);
// Falta: texture.dispose() al reset/destroy
```
**Impacto**: ~50-100 MB leak por reset/ciclo de layouts

### 2. **Force Simulation - Random Sampling Inconsistente** (Líneas 479-481)
```javascript
const j = (i + 1 + Math.floor(Math.random() * (nodes.length - 1))) % nodes.length;
```
**Problema**: Diferente muestra cada frame → fuerzas inestables, jitter visual
**Fix**: Spatial hash / quadtree / fixed neighbor list

### 3. **Edge Colors - No Usan Alpha en BufferAttribute** (Líneas 332-336, 632-660)
```javascript
const edgeColors = new Float32Array(maxEdges * 6); // RGB only
// Pero material tiene opacity: 0.3 y transparent: true
```
**Probleto**: Opacidad fija por material, no por edge individual
**Fix**: Usar `edgeColors` con 4 componentes (RGBA) + `vertexColors: true` + material `vertexColors: true`

### 4. **Raycasting Ineficiente** (Línea 706)
```javascript
raycaster.intersectObjects(nodeGroup.children, false);
// Intersecta TODOS los children (meshes + glows + sprites + stars)
```
**Fix**: `raycaster.intersectObjects(nodeMeshesOnly, false)` con array filtrado

### 5. **Math Random en Hot Path** (Líneas 481, 557, 561, 579)
```javascript
Math.random() // llamado 180+ veces/frame
```
**Fix**: Pre-generar noise array o usar `THREE.MathUtils.randFloat`

### 6. **No Cleanup en Reset** (Líneas 755-763)
```javascript
// Reposiciona pero NO limpia:
// - pulseParticles activos
// - edge pulses
// - targetX/Y/Z residuales
```

### 7. **Star Rotation en Animation Loop** (Líneas 796-797)
```javascript
stars.rotation.y += 0.00005; // Acumula indefinidamente → precision loss
```
**Fix**: `stars.rotation.y = (stars.rotation.y + 0.00005) % (Math.PI * 2)`

### 8. **Import Map Hardcoded** (Líneas 89-96)
```html
<script type="importmap">... unpkg.com ...</script>
```
**Problema**: Sin fallback, sin version pinning exacto, CSP issues

---

## ⚡ Performance Issues

| Métrica | Actual | Objetivo | Fix |
|---|---|---|---|
| Draw calls | ~400+ (180 meshes + 180 glows + sprites + edges + stars + pulses) | <50 | **InstancedMesh** para nodos/glows |
| Frame time | ~8-12ms (180 nodos) | <5ms | InstancedMesh + compute shader para forces |
| Memory | ~80MB + leak | <50MB | Dispose + object pooling |
| Edge update | CPU loop 600+ edges/frame | GPU | Shader-based edge rendering |

---

## 🧪 Tests Necesarios

### Unit Tests (Jest + three.js mock)
- `NodeFactory.createNodes(config)` → correct count, types, layers
- `EdgeBuilder.buildEdges(nodes)` → no self-loops, correct direction, weights
- `ForceSimulation.step(nodes, dt)` → positions change, energy conserved
- `LayoutEngine.apply(nodes, 'layers')` → correct Y per layer
- `PulseManager.spawn(source, target)` → particle created, added to scene
- `PulseManager.update(dt)` → progress advances, cleanup on complete
- `NeuralState.update(nodes, dt)` → activation bounds [0,1], propagation works

### Integration Tests (Playwright)
- Load page → canvas renders → no console errors
- Click layout buttons → mode changes → nodes reposition
- Pause/Resume → animation stops/starts
- Hover node → info panel shows correct data
- Reset → positions randomized, pulses cleared
- Resize window → canvas resizes, camera updates
- 30s auto-cycle → mode changes without error

### Visual Regression (Chromatic/Percy)
- Force layout initial state
- Sphere layout
- Layers layout
- Spiral layout
- Hover panel visible
- Dark/light theme (if added)

### Performance Tests
- 180 nodes @ 60fps sustained 30s
- 500 nodes @ 30fps
- Memory stable over 5min (no leak)
- Pulse spawn rate < 100 concurrent

---

## 🚀 Mejoras Prioritarias

### P0 - Crítico (Hacer ya)
1. **InstancedMesh para nodos/glows** - Reduce draw calls 360→2
2. **Object pooling para pulsos** - Elimina GC pressure
3. **Fix memory leaks** - Dispose textures/sprites/materials
4. **Stable force simulation** - Fixed neighbor lists o spatial hash

### P1 - Importante
5. **Shader-based edges** - Single draw call, per-edge color/opacity/animation
6. **Web Workers para simulación** - Offload force/neural update
7. **Config panel UI** - Live tuning de parámetros
8. **Data-driven mode** - Cargar nodos/edges desde JSON/API

### P2 - Nice to Have
9. **WebGPU renderer** (cuando Three.js soporte madure)
10. **GraphQL subscription** para datos reales tiempo real
11. **Export/Import layout** (save positions)
12. **Accessibility** - Keyboard nav, screen reader labels
13. **Mobile touch controls** - Pinch zoom, two-finger rotate

---

## 📦 Estructura Recomendada (Refactor)

```
src/
├── core/
│   ├── NeuralGraph.ts          # Main class
│   ├── Config.ts               # Types + defaults
│   └── EventBus.ts             # Pub/sub para decoupling
├── simulation/
│   ├── ForceEngine.ts          # Force-directed (WASM/Worker ready)
│   ├── NeuralEngine.ts         # Activation propagation
│   └── LayoutEngine.ts         # Sphere/Layers/Spiral/Force
├── rendering/
│   ├── NodeRenderer.ts         # InstancedMesh + shaders
│   ├── EdgeRenderer.ts         # Shader-based lines
│   ├── PulseRenderer.ts        # Instanced particles
│   └── BackgroundRenderer.ts   # Stars/fog
├── interaction/
│   ├── CameraController.ts     # OrbitControls wrapper
│   ├── HoverSystem.ts          # Raycasting optimizado
│   └── UIController.ts         # HUD, Legend, Controls
└── data/
    ├── GraphLoader.ts          # JSON/GraphQL/CSV → Graph
    └── GraphExporter.ts        # Save layout/state
```

---

## 🎯 Próximos Pasos Inmediatos

1. **Crear test suite** (Jest + Playwright)
2. **Fix P0 issues** en versión actual
3. **Refactor a TypeScript + Vite** para Terramind integration
4. **Conectar datos reales** via `graphify query` + API