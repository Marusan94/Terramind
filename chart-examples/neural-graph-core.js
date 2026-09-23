/**
 * Core Logic for 3D Neural Graph - Extracted for Testing
 * This is the pure logic separated from Three.js rendering
 */

// ========== CONFIG ==========
export const DEFAULT_CONFIG = {
  nodeCount: 180,
  maxConnections: 4,
  forceStrength: 0.008,
  repulsionStrength: 1.2,
  centerForce: 0.003,
  damping: 0.92,
  sphereRadius: 80,
  layerSpacing: 45,
  spiralTurns: 3,
  spiralHeight: 120,
  feedForwardProb: 0.6,
  recurrentProb: 0.25,
  skipProb: 0.15,
};

export const NODE_TYPES = {
  INPUT: { color: 0x3b82f6, label: 'Input', emoji: '📥', baseSize: 5 },
  HIDDEN: { color: 0xa855f7, label: 'Hidden', emoji: '⚙️', baseSize: 4 },
  ATTENTION: { color: 0xf59e0b, label: 'Attention', emoji: '🔍', baseSize: 4.5 },
  OUTPUT: { color: 0x22c55e, label: 'Output', emoji: '📤', baseSize: 5 },
  ANOMALY: { color: 0xef4444, label: 'Anomaly', emoji: '⚠️', baseSize: 4 },
};

const LAYER_CONFIG = [
  { type: 'INPUT', ratio: 0.15 },
  { type: 'HIDDEN', ratio: 0.60 },
  { type: 'ATTENTION', ratio: 0.10 },
  { type: 'OUTPUT', ratio: 0.10 },
  { type: 'ANOMALY', ratio: 0.05 },
];

// ========== UTILITIES ==========
export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function randFloat(min, max) {
  return min + Math.random() * (max - min);
}

// ========== NODE FACTORY ==========
export function createNodes(config = {}) {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const nodes = [];
  const adjacency = new Map();
  let nodeId = 0;

  LAYER_CONFIG.forEach((layer, layerIndex) => {
    const count = Math.floor(cfg.nodeCount * layer.ratio);
    for (let i = 0; i < count; i++) {
      const typeDef = NODE_TYPES[layer.type];
      const node = {
        id: nodeId++,
        type: layer.type,
        typeDef,
        layer: layerIndex,
        x: randFloat(-100, 100),
        y: randFloat(-100, 100),
        z: randFloat(-100, 100),
        vx: 0, vy: 0, vz: 0,
        activation: randFloat(0, 0.3),
        bias: randFloat(-0.5, 0.5),
        liveValue: Math.random(),
        targetActivation: randFloat(0, 0.3),
        mesh: null, glow: null, labelSprite: null,
        connections: [], weights: [],
      };
      nodes.push(node);
      adjacency.set(node.id, []);
    }
  });

  return { nodes, adjacency };
}

// ========== EDGE BUILDER ==========
export function buildEdges(nodes, adjacency, config = {}) {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const edges = [];
  const maxConns = cfg.maxConnections;

  nodes.forEach(node => {
    const connCount = Math.floor(Math.random() * maxConns) + 1;
    
    for (let c = 0; c < connCount; c++) {
      let target = null;
      const rand = Math.random();
      
      if (rand < cfg.feedForwardProb && node.layer < LAYER_CONFIG.length - 1) {
        const candidates = nodes.filter(n => n.layer > node.layer);
        if (candidates.length) target = candidates[Math.floor(Math.random() * candidates.length)];
      } else if (rand < cfg.feedForwardProb + cfg.recurrentProb) {
        const candidates = nodes.filter(n => n.layer === node.layer && n.id !== node.id);
        if (candidates.length) target = candidates[Math.floor(Math.random() * candidates.length)];
      } else {
        const candidates = nodes.filter(n => n.layer > node.layer + 1);
        if (candidates.length) target = candidates[Math.floor(Math.random() * candidates.length)];
      }

      if (target && !adjacency.get(node.id).includes(target.id)) {
        const weight = randFloat(-1, 1);
        adjacency.get(node.id).push(target.id);
        node.connections.push(target.id);
        node.weights.push(weight);
        adjacency.get(target.id).push(node.id);
        edges.push({ source: node.id, target: target.id, weight, active: false, pulse: 0 });
      }
    }
  });

  return edges;
}

// ========== LAYOUT ENGINE ==========
export function applyLayout(nodes, mode, config = {}, instant = false) {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  
  nodes.forEach((node, i) => {
    let targetX, targetY, targetZ;
    
    switch (mode) {
      case 'sphere': {
        const phi = Math.acos(2 * (i / nodes.length) - 1);
        const theta = Math.PI * (3 - Math.sqrt(5)) * i; // Golden angle
        const r = cfg.sphereRadius * (0.7 + 0.3 * Math.random());
        targetX = r * Math.sin(phi) * Math.cos(theta);
        targetY = r * Math.sin(phi) * Math.sin(theta);
        targetZ = r * Math.cos(phi);
        break;
      }
      case 'layers': {
        const layerNodes = nodes.filter(n => n.layer === node.layer);
        const layerIndex = layerNodes.indexOf(node);
        const totalInLayer = layerNodes.length;
        const angle = (layerIndex / Math.max(1, totalInLayer)) * Math.PI * 2;
        const radius = 40 + node.layer * 25;
        targetX = Math.cos(angle) * radius;
        targetY = (node.layer - (LAYER_CONFIG.length - 1) / 2) * cfg.layerSpacing;
        targetZ = Math.sin(angle) * radius;
        break;
      }
      case 'spiral': {
        const t = i / nodes.length * cfg.spiralTurns * Math.PI * 2;
        const rSpiral = 30 + t * 4;
        targetX = Math.cos(t) * rSpiral;
        targetY = (i / nodes.length - 0.5) * cfg.spiralHeight;
        targetZ = Math.sin(t) * rSpiral;
        break;
      }
      case 'force':
      default:
        return; // Force-directed handles itself
    }
    
    if (instant) {
      node.x = targetX; node.y = targetY; node.z = targetZ;
    } else {
      node.targetX = targetX; node.targetY = targetY; node.targetZ = targetZ;
    }
  });
}

// ========== FORCE SIMULATION ==========
export function simulateForces(nodes, config = {}, dt = 1.0) {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  
  // Repulsion (sampled for performance)
  for (let i = 0; i < nodes.length; i++) {
    const a = nodes[i];
    let fx = 0, fy = 0, fz = 0;
    
    // Fixed neighbor sampling for stability
    const sampleCount = Math.min(30, nodes.length - 1);
    for (let k = 0; k < sampleCount; k++) {
      const j = (i + 1 + k * 7) % nodes.length; // Deterministic sampling
      const b = nodes[j];
      if (a === b) continue;
      
      const dx = a.x - b.x;
      const dy = a.y - b.y;
      const dz = a.z - b.z;
      const dist2 = dx*dx + dy*dy + dz*dz + 1;
      const dist = Math.sqrt(dist2);
      const force = cfg.repulsionStrength * (a.typeDef.baseSize + b.typeDef.baseSize) / dist2;
      
      fx += (dx / dist) * force;
      fy += (dy / dist) * force;
      fz += (dz / dist) * force;
    }
    
    // Attraction via edges
    a.connections.forEach((targetId, idx) => {
      const target = nodes[targetId];
      if (!target) return;
      const dx = target.x - a.x;
      const dy = target.y - a.y;
      const dz = target.z - a.z;
      const dist = Math.sqrt(dx*dx + dy*dy + dz*dz) + 0.1;
      const force = cfg.forceStrength * Math.abs(a.weights[idx]) * dist;
      fx += (dx / dist) * force;
      fy += (dy / dist) * force;
      fz += (dz / dist) * force;
    });
    
    // Center force
    const distCenter = Math.sqrt(a.x*a.x + a.y*a.y + a.z*a.z);
    if (distCenter > 1) {
      fx -= (a.x / distCenter) * cfg.centerForce * distCenter;
      fy -= (a.y / distCenter) * cfg.centerForce * distCenter;
      fz -= (a.z / distCenter) * cfg.centerForce * distCenter;
    }
    
    // Integrate
    a.vx = (a.vx + fx * dt) * cfg.damping;
    a.vy = (a.vy + fy * dt) * cfg.damping;
    a.vz = (a.vz + fz * dt) * cfg.damping;
    
    a.x += a.vx * dt;
    a.y += a.vy * dt;
    a.z += a.vz * dt;
  }
  
  // Attraction to layout targets (for non-force modes)
  nodes.forEach(node => {
    if (node.targetX !== undefined) {
      const dx = node.targetX - node.x;
      const dy = node.targetY - node.y;
      const dz = node.targetZ - node.z;
      const dist = Math.sqrt(dx*dx + dy*dy + dz*dz);
      if (dist > 0.5) {
        node.vx += (dx / dist) * 0.5;
        node.vy += (dy / dist) * 0.5;
        node.vz += (dz / dist) * 0.5;
      } else {
        node.vx *= 0.5; node.vy *= 0.5; node.vz *= 0.5;
      }
    }
  });
}

// ========== NEURAL ENGINE ==========
export function updateNeural(nodes, dt = 1.0) {
  const now = Date.now();
  
  nodes.forEach(node => {
    // Decay toward target
    node.activation += (node.targetActivation - node.activation) * 0.02 * dt;
    
    // Natural noise
    node.targetActivation += (Math.random() - 0.5) * 0.02 * dt;
    node.targetActivation = clamp(node.targetActivation, 0, 1);
    
    // Live value (deterministic per node)
    node.liveValue = Math.sin(now * 0.001 * (0.5 + node.id * 0.01)) * 0.5 + 0.5;
    
    // Fire pulses on high activation
    if (node.activation > 0.7 && Math.random() < 0.02 * dt) {
      const connIdx = Math.floor(Math.random() * node.connections.length);
      const targetId = node.connections[connIdx];
      const target = nodes[targetId];
      if (target) {
        // Return pulse data for renderer to spawn
        return { source: node, target, weight: node.weights[connIdx] };
      }
    }
  });
  
  // Input nodes: periodic signal
  nodes.filter(n => n.type === 'INPUT').forEach((node, i) => {
    node.targetActivation = 0.5 + 0.4 * Math.sin(now * 0.0005 + i);
  });
  
  // Anomaly nodes: random spikes
  nodes.filter(n => n.type === 'ANOMALY').forEach(node => {
    if (Math.random() < 0.005 * dt) node.targetActivation = 1;
  });
  
  return null;
}

// ========== PULSE MANAGER ==========
export function spawnPulse(sourceNode, targetNode, weight) {
  return {
    position: { x: sourceNode.x, y: sourceNode.y, z: sourceNode.z },
    userData: {
      source: sourceNode,
      target: targetNode,
      progress: 0,
      speed: 0.015 + Math.random() * 0.01,
      weight,
      startTime: Date.now(),
    },
  };
}

export function updatePulses(pulses, nodes, dt = 1.0) {
  for (let i = pulses.length - 1; i >= 0; i--) {
    const p = pulses[i];
    const { source, target, progress, speed, weight } = p.userData;
    
    p.userData.progress += speed * dt * 60;
    
    if (p.userData.progress >= 1) {
      // Activate target
      target.targetActivation = clamp(target.targetActivation + 0.3 * Math.abs(weight), 0, 1);
      pulses.splice(i, 1);
    } else {
      // Smooth interpolation with arc
      const t = p.userData.progress;
      const curveT = t * t * (3 - 2 * t); // smoothstep
      
      p.position.x = source.x + (target.x - source.x) * curveT;
      p.position.y = source.y + (target.y - source.y) * curveT + Math.sin(t * Math.PI) * 3;
      p.position.z = source.z + (target.z - source.z) * curveT;
    }
  }
}

// ========== EDGE RENDERER DATA ==========
export function updateEdges(edges, nodes, positions, colors) {
  let edgeIdx = 0;
  
  edges.forEach(edge => {
    const source = nodes[edge.source];
    const target = nodes[edge.target];
    if (!source || !target) return;
    
    const sx = source.x, sy = source.y, sz = source.z;
    const tx = target.x, ty = target.y, tz = target.z;
    
    // Color by weight sign
    const r = edge.weight > 0 ? 0.34 : 0.94;
    const g = edge.weight > 0 ? 0.76 : 0.27;
    const b = edge.weight > 0 ? 0.23 : 0.27;
    
    // Source vertex
    positions[edgeIdx * 6] = sx;
    positions[edgeIdx * 6 + 1] = sy;
    positions[edgeIdx * 6 + 2] = sz;
    colors[edgeIdx * 6] = r;
    colors[edgeIdx * 6 + 1] = g;
    colors[edgeIdx * 6 + 2] = b;
    
    // Target vertex
    positions[edgeIdx * 6 + 3] = tx;
    positions[edgeIdx * 6 + 4] = ty;
    positions[edgeIdx * 6 + 5] = tz;
    colors[edgeIdx * 6 + 3] = r;
    colors[edgeIdx * 6 + 5] = b;
    colors[edgeIdx * 6 + 4] = g;
    
    // Pulse decay
    if (edge.pulse > 0) edge.pulse *= 0.95;
    if (edge.active && edge.pulse < 0.05) edge.active = false;
    
    edgeIdx++;
  });
  
  return edgeIdx;
}

// ========== RESET HELPER ==========
export function resetSimulation(nodes, edges, config = {}) {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  
  nodes.forEach(node => {
    node.x = randFloat(-100, 100);
    node.y = randFloat(-100, 100);
    node.z = randFloat(-100, 100);
    node.vx = node.vy = node.vz = 0;
    node.activation = randFloat(0, 0.3);
    node.targetActivation = randFloat(0, 0.3);
    node.targetX = node.targetY = node.targetZ = undefined;
  });
  
  edges.forEach(edge => {
    edge.active = false;
    edge.pulse = 0;
  });
  
  // Clear any residual pulse particles (handled by renderer)
}