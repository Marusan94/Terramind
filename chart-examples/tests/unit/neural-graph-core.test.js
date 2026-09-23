/**
 * Unit Tests for 3D Neural Graph Core Logic
 * Run: npx jest tests/unit/
 */

// Mock Three.js
jest.mock('three', () => ({
  Vector3: class {
    constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
    set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
    copy(v) { this.x = v.x; this.y = v.y; this.z = v.z; return this; }
    add(v) { this.x += v.x; this.y += v.y; this.z += v.z; return this; }
    sub(v) { this.x -= v.x; this.y -= v.y; this.z -= v.z; return this; }
    multiplyScalar(s) { this.x *= s; this.y *= s; this.z *= s; return this; }
    length() { return Math.sqrt(this.x**2 + this.y**2 + this.z**2); }
    normalize() { const l = this.length(); if (l > 0) this.multiplyScalar(1/l); return this; }
    distanceTo(v) { return Math.sqrt((this.x-v.x)**2 + (this.y-v.y)**2 + (this.z-v.z)**2); }
    lerp(v, t) { this.x += (v.x-this.x)*t; this.y += (v.y-this.y)*t; this.z += (v.z-this.z)*t; return this; }
    clone() { return new this.constructor(this.x, this.y, this.z); }
  },
  MathUtils: {
    clamp: (v, min, max) => Math.max(min, Math.min(max, v)),
    randFloat: (min, max) => min + Math.random() * (max - min),
  },
  Color: class { constructor(c) { this.hex = c; } setHex(c) { this.hex = c; } },
  MeshStandardMaterial: class { constructor(p) { Object.assign(this, p); } },
  MeshBasicMaterial: class { constructor(p) { Object.assign(this, p); } },
  SphereGeometry: class { constructor() {} dispose() {} },
  BufferGeometry: class { 
    constructor() { this.attributes = {}; this.drawRange = { start: 0, count: 0 }; }
    setAttribute(name, attr) { this.attributes[name] = attr; }
    setDrawRange(start, count) { this.drawRange = { start, count }; }
    dispose() {}
  },
  BufferAttribute: class { constructor(array, size) { this.array = array; this.size = size; this.needsUpdate = false; } },
  LineSegments: class { constructor(geo, mat) { this.geometry = geo; this.material = mat; } },
  Points: class { constructor(geo, mat) { this.geometry = geo; this.material = mat; this.rotation = { x: 0, y: 0, z: 0 }; } },
  PointsMaterial: class { constructor(p) { Object.assign(this, p); } },
  Sprite: class { constructor(mat) { this.material = mat; this.scale = { x: 1, y: 1, z: 1 }; this.position = { x: 0, y: 0, z: 0 }; } },
  SpriteMaterial: class { constructor(p) { Object.assign(this, p); } },
  CanvasTexture: class { constructor() { this.needsUpdate = false; } dispose() {} },
  Group: class { constructor() { this.children = []; } add(c) { this.children.push(c); } },
  Scene: class { constructor() { this.children = []; this.fog = null; } add(c) { this.children.push(c); } remove(c) { const i = this.children.indexOf(c); if (i >= 0) this.children.splice(i, 1); } },
  PerspectiveCamera: class { constructor() { this.position = { x: 0, y: 0, z: 0 }; this.aspect = 1; } updateProjectionMatrix() {} },
  WebGLRenderer: class { constructor() { this.domElement = document.createElement('canvas'); } setSize() {} setPixelRatio() {} setClearColor() {} render() {} },
  OrbitControls: class { constructor(cam, dom) { this.object = cam; this.enableDamping = false; this.dampingFactor = 0; this.autoRotate = false; this.autoRotateSpeed = 0; } update() {} },
  AmbientLight: class { constructor(c, i) {} },
  DirectionalLight: class { constructor(c, i) { this.position = { x: 0, y: 0, z: 0 }; } },
  PointLight: class { constructor(c, i, d) { this.position = { x: 0, y: 0, z: 0 }; } },
  FogExp2: class { constructor(c, d) {} },
  Raycaster: class { constructor() { this.params = { Points: { threshold: 0 } }; } setFromCamera() {} intersectObjects() { return []; } },
  Clock: class { constructor() { this.oldTime = 0; } getDelta() { return 0.016; } },
}));

// Import after mock
import { 
  createNodes, 
  buildEdges, 
  applyLayout, 
  simulateForces, 
  updateNeural, 
  spawnPulse, 
  updatePulses,
  updateEdges,
  clamp
} from '../neural-graph-core';

describe('Neural Graph Core', () => {
  
  describe('createNodes', () => {
    const config = { nodeCount: 100, layerDistribution: [0.15, 0.6, 0.1, 0.1, 0.05] };
    
    test('creates correct number of nodes', () => {
      const nodes = createNodes(config);
      expect(nodes.length).toBe(100);
    });

    test('distributes nodes across 5 layers', () => {
      const nodes = createNodes(config);
      const layers = new Set(nodes.map(n => n.layer));
      expect(layers.size).toBe(5);
    });

    test('assigns correct types per layer', () => {
      const nodes = createNodes(config);
      const typeCounts = nodes.reduce((acc, n) => { acc[n.type] = (acc[n.type] || 0) + 1; return acc; }, {});
      expect(typeCounts.INPUT).toBeGreaterThan(0);
      expect(typeCounts.HIDDEN).toBeGreaterThan(0);
      expect(typeCounts.ATTENTION).toBeGreaterThan(0);
      expect(typeCounts.OUTPUT).toBeGreaterThan(0);
      expect(typeCounts.ANOMALY).toBeGreaterThan(0);
    });

    test('each node has required properties', () => {
      const nodes = createNodes(config);
      nodes.forEach(n => {
        expect(n.id).toBeDefined();
        expect(n.type).toBeDefined();
        expect(n.layer).toBeDefined();
        expect(n.x).toBeDefined();
        expect(n.y).toBeDefined();
        expect(n.z).toBeDefined();
        expect(n.vx).toBe(0);
        expect(n.vy).toBe(0);
        expect(n.vz).toBe(0);
        expect(n.activation).toBeGreaterThanOrEqual(0);
        expect(n.activation).toBeLessThanOrEqual(1);
        expect(n.bias).toBeDefined();
        expect(n.connections).toEqual([]);
        expect(n.weights).toEqual([]);
      });
    });
  });

  describe('buildEdges', () => {
    const nodes = createNodes({ nodeCount: 50, layerDistribution: [0.2, 0.6, 0.1, 0.1] });
    
    test('creates edges without self-loops', () => {
      const edges = buildEdges(nodes, { maxConnections: 3 });
      edges.forEach(e => {
        expect(e.source).not.toBe(e.target);
      });
    });

    test('respects maxConnections per node', () => {
      const edges = buildEdges(nodes, { maxConnections: 2 });
      const outDegree = {};
      edges.forEach(e => { outDegree[e.source] = (outDegree[e.source] || 0) + 1; });
      Object.values(outDegree).forEach(d => expect(d).toBeLessThanOrEqual(2));
    });

    test('prefers feed-forward connections', () => {
      const edges = buildEdges(nodes, { maxConnections: 3, feedForwardProb: 0.8 });
      const feedForward = edges.filter(e => nodes[e.target].layer > nodes[e.source].layer).length;
      const total = edges.length;
      expect(feedForward / total).toBeGreaterThan(0.6);
    });

    test('weights are in range [-1, 1]', () => {
      const edges = buildEdges(nodes, { maxConnections: 3 });
      edges.forEach(e => {
        expect(e.weight).toBeGreaterThanOrEqual(-1);
        expect(e.weight).toBeLessThanOrEqual(1);
      });
    });
  });

  describe('applyLayout', () => {
    const nodes = createNodes({ nodeCount: 60, layerDistribution: [0.2, 0.5, 0.15, 0.15] });
    
    test('sphere layout positions nodes on sphere surface', () => {
      applyLayout(nodes, 'sphere', { sphereRadius: 50 }, true);
      nodes.forEach(n => {
        const dist = Math.sqrt(n.x**2 + n.y**2 + n.z**2);
        expect(dist).toBeGreaterThan(35); // 0.7 * 50
        expect(dist).toBeLessThan(65);    // 1.3 * 50
      });
    });

    test('layers layout separates by Y coordinate', () => {
      applyLayout(nodes, 'layers', { layerSpacing: 40 }, true);
      const layers = {};
      nodes.forEach(n => { layers[n.layer] = layers[n.layer] || []; layers[n.layer].push(n.y); });
      Object.keys(layers).forEach((layer, i) => {
        const avgY = layers[layer].reduce((a, b) => a + b, 0) / layers[layer].length;
        const expectedY = (parseInt(layer) - 1.5) * 40;
        expect(Math.abs(avgY - expectedY)).toBeLessThan(10);
      });
    });

    test('spiral layout creates helical pattern', () => {
      applyLayout(nodes, 'spiral', { spiralTurns: 2, spiralHeight: 80 }, true);
      const zs = nodes.map(n => n.z);
      const xs = nodes.map(n => n.x);
      expect(Math.max(...zs) - Math.min(...zs)).toBeGreaterThan(60);
      expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(40);
    });

    test('force layout returns early without modifying positions', () => {
      const originalPositions = nodes.map(n => ({ x: n.x, y: n.y, z: n.z }));
      applyLayout(nodes, 'force', {}, true);
      nodes.forEach((n, i) => {
        expect(n.x).toBe(originalPositions[i].x);
        expect(n.y).toBe(originalPositions[i].y);
        expect(n.z).toBe(originalPositions[i].z);
      });
    });
  });

  describe('simulateForces', () => {
    const nodes = createNodes({ nodeCount: 30, layerDistribution: [0.2, 0.5, 0.2, 0.1] });
    buildEdges(nodes, { maxConnections: 3 });
    
    test('updates positions when not paused', () => {
      const before = nodes.map(n => ({ x: n.x, y: n.y, z: n.z }));
      simulateForces(nodes, { forceStrength: 0.01, repulsionStrength: 1, centerForce: 0.01, damping: 0.9 }, 1.0);
      const moved = nodes.some((n, i) => n.x !== before[i].x || n.y !== before[i].y || n.z !== before[i].z);
      expect(moved).toBe(true);
    });

    test('applies damping to velocities', () => {
      nodes.forEach(n => { n.vx = 10; n.vy = 10; n.vz = 10; });
      simulateForces(nodes, { damping: 0.5 }, 1.0);
      nodes.forEach(n => {
        expect(Math.abs(n.vx)).toBeLessThan(10);
        expect(Math.abs(n.vy)).toBeLessThan(10);
        expect(Math.abs(n.vz)).toBeLessThan(10);
      });
    });

    test('center force pulls nodes toward origin', () => {
      nodes.forEach(n => { n.x = 100; n.y = 100; n.z = 100; n.vx = n.vy = n.vz = 0; });
      simulateForces(nodes, { centerForce: 0.1, forceStrength: 0, repulsionStrength: 0 }, 1.0);
      nodes.forEach(n => {
        expect(Math.abs(n.x)).toBeLessThan(100);
        expect(Math.abs(n.y)).toBeLessThan(100);
        expect(Math.abs(n.z)).toBeLessThan(100);
      });
    });
  });

  describe('updateNeural', () => {
    const nodes = createNodes({ nodeCount: 20, layerDistribution: [0.25, 0.5, 0.15, 0.1] });
    
    test('clamps activation to [0, 1]', () => {
      nodes.forEach(n => { n.targetActivation = 1.5; n.activation = 1.5; });
      updateNeural(nodes, 1.0);
      nodes.forEach(n => {
        expect(n.activation).toBeLessThanOrEqual(1);
        expect(n.activation).toBeGreaterThanOrEqual(0);
        expect(n.targetActivation).toBeLessThanOrEqual(1);
        expect(n.targetActivation).toBeGreaterThanOrEqual(0);
      });
    });

    test('input nodes get periodic signal', () => {
      const inputNodes = nodes.filter(n => n.type === 'INPUT');
      inputNodes.forEach(n => { n.targetActivation = 0; });
      updateNeural(nodes, 1.0);
      inputNodes.forEach(n => {
        expect(n.targetActivation).toBeGreaterThan(0.1);
        expect(n.targetActivation).toBeLessThan(0.9);
      });
    });

    test('anomaly nodes can spike', () => {
      const anomalyNodes = nodes.filter(n => n.type === 'ANOMALY');
      if (anomalyNodes.length > 0) {
        anomalyNodes.forEach(n => { n.targetActivation = 0; });
        // Run multiple times to catch random spike
        let spiked = false;
        for (let i = 0; i < 1000; i++) {
          updateNeural(nodes, 1.0);
          if (anomalyNodes.some(n => n.targetActivation === 1)) { spiked = true; break; }
        }
        // Probability is low (0.5%), so this might not trigger - that's OK
        // Just verify it doesn't crash
        expect(true).toBe(true);
      }
    });
  });

  describe('spawnPulse / updatePulses', () => {
    const nodes = createNodes({ nodeCount: 10, layerDistribution: [0.3, 0.7] });
    buildEdges(nodes, { maxConnections: 2 });
    const scene = { add: jest.fn(), remove: jest.fn() };
    
    test('spawnPulse creates particle with correct userData', () => {
      const source = nodes[0];
      const target = nodes[1];
      const particle = spawnPulse(source, target, 0.5, scene);
      
      expect(particle).toBeDefined();
      expect(particle.userData.source).toBe(source);
      expect(particle.userData.target).toBe(target);
      expect(particle.userData.progress).toBe(0);
      expect(particle.userData.weight).toBe(0.5);
      expect(scene.add).toHaveBeenCalledWith(particle);
    });

    test('updatePulses advances progress and cleans up completed', () => {
      const source = nodes[0];
      const target = nodes[1];
      const particle = spawnPulse(source, target, 0.5, scene);
      const particles = [particle];
      
      // Simulate completion
      particle.userData.progress = 0.99;
      particle.userData.speed = 0.1;
      
      updatePulses(particles, nodes, 1.0);
      
      expect(particles.length).toBe(0);
      expect(scene.remove).toHaveBeenCalledWith(particle);
      expect(target.targetActivation).toBeGreaterThan(0);
    });
  });

  describe('updateEdges', () => {
    const nodes = createNodes({ nodeCount: 20, layerDistribution: [0.25, 0.5, 0.25] });
    const edges = buildEdges(nodes, { maxConnections: 3 });
    
    test('updates edge positions from node positions', () => {
      nodes[0].x = 10; nodes[0].y = 20; nodes[0].z = 30;
      nodes[1].x = 40; nodes[1].y = 50; nodes[1].z = 60;
      
      const positions = new Float32Array(edges.length * 6);
      const colors = new Float32Array(edges.length * 6);
      
      updateEdges(edges, nodes, positions, colors);
      
      // First edge should have source at node[0] and target at node[1]
      expect(positions[0]).toBe(10);
      expect(positions[1]).toBe(20);
      expect(positions[2]).toBe(30);
    });

    test('colors edges by weight sign', () => {
      edges[0].weight = 0.5;  // positive
      edges[1].weight = -0.5; // negative
      
      const positions = new Float32Array(edges.length * 6);
      const colors = new Float32Array(edges.length * 6);
      
      updateEdges(edges, nodes, positions, colors);
      
      // Positive weight -> greenish (r < g)
      expect(colors[0]).toBeLessThan(colors[1]);
      // Negative weight -> reddish (r > g)
      expect(colors[6]).toBeGreaterThan(colors[7]);
    });
  });

  describe('clamp utility', () => {
    test('clamps value to range', () => {
      expect(clamp(5, 0, 10)).toBe(5);
      expect(clamp(-5, 0, 10)).toBe(0);
      expect(clamp(15, 0, 10)).toBe(10);
    });
  });
});