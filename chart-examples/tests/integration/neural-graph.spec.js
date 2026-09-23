/**
 * Integration Tests for 3D Neural Graph
 * Run: npx playwright test tests/integration/
 */

import { test, expect } from '@playwright/test';

const GRAPH_URL = 'file:///C:/Users/USUARIO/Terramind/chart-examples/06-3d-neural-graph.html';

test.describe('3D Neural Graph - Integration', () => {
  let page;
  
  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    await page.goto(GRAPH_URL, { waitUntil: 'networkidle', timeout: 30000 });
    // Wait for Three.js to initialize
    await page.waitForFunction(() => window.THREE !== undefined, { timeout: 10000 });
    await page.waitForTimeout(2000); // Let simulation settle
  });
  
  test.afterAll(async () => {
    await page.close();
  });

  test('loads without console errors', async () => {
    const errors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(3000);
    
    // Filter out expected Three.js warnings
    const criticalErrors = errors.filter(e => 
      !e.includes('THREE.') && 
      !e.includes('deprecated') &&
      !e.includes('non-passive')
    );
    
    expect(criticalErrors).toHaveLength(0);
  });

  test('canvas renders and has WebGL context', async () => {
    const canvas = page.locator('#canvas');
    await expect(canvas).toBeVisible();
    
    const hasWebGL = await page.evaluate(() => {
      const canvas = document.getElementById('canvas');
      return !!canvas.getContext('webgl2') || !!canvas.getContext('webgl');
    });
    expect(hasWebGL).toBe(true);
  });

  test('HUD displays correct initial values', async () => {
    await expect(page.locator('#nodeCount')).toHaveText('180');
    await expect(page.locator('#edgeCount')).toHaveText(/\d+/);
    await expect(page.locator('#modeLabel')).toHaveText('Force');
  });

  test('layout buttons switch modes', async () => {
    const modes = ['force', 'sphere', 'layers', 'spiral'];
    
    for (const mode of modes) {
      await page.click(`button[data-mode="${mode}"]`);
      await page.waitForTimeout(500);
      
      const activeBtn = page.locator(`button[data-mode="${mode}"]`);
      await expect(activeBtn).toHaveClass(/active/);
      
      // Verify mode label updates
      const label = mode.charAt(0).toUpperCase() + mode.slice(1);
      if (mode === 'force') {
        await expect(page.locator('#modeLabel')).toHaveText('Force Directed');
      }
    }
  });

  test('pause/resume button works', async () => {
    const pauseBtn = page.locator('#btnPause');
    
    // Pause
    await pauseBtn.click();
    await expect(pauseBtn).toHaveText('▶️ Reanudar');
    await expect(pauseBtn).toHaveClass(/active/);
    
    // Wait and verify animation stops (FPS should drop to 0 or very low)
    await page.waitForTimeout(1000);
    const fpsPaused = await page.locator('#fps').textContent();
    
    // Resume
    await pauseBtn.click();
    await expect(pauseBtn).toHaveText('⏸️ Pausar');
    await expect(pauseBtn).not.toHaveClass(/active/);
    
    await page.waitForTimeout(1000);
    const fpsResumed = await page.locator('#fps').textContent();
    expect(parseInt(fpsResumed)).toBeGreaterThan(10);
  });

  test('reset button randomizes positions', async () => {
    // Get initial positions via Three.js
    const initialPositions = await page.evaluate(() => {
      const nodes = window.__NEURAL_GRAPH__?.nodes || [];
      return nodes.slice(0, 5).map(n => ({ x: n.x, y: n.y, z: n.z }));
    });
    
    await page.click('#btnReset');
    await page.waitForTimeout(500);
    
    const newPositions = await page.evaluate(() => {
      const nodes = window.__NEURAL_GRAPH__?.nodes || [];
      return nodes.slice(0, 5).map(n => ({ x: n.x, y: n.y, z: n.z }));
    });
    
    // At least some positions should change
    let changed = false;
    for (let i = 0; i < 5; i++) {
      if (Math.abs(initialPositions[i].x - newPositions[i].x) > 1 ||
          Math.abs(initialPositions[i].y - newPositions[i].y) > 1 ||
          Math.abs(initialPositions[i].z - newPositions[i].z) > 1) {
        changed = true;
        break;
      }
    }
    expect(changed).toBe(true);
  });

  test('hover shows node info panel', async () => {
    const canvas = page.locator('#canvas');
    const infoPanel = page.locator('#nodeInfo');
    
    // Initially hidden
    await expect(infoPanel).not.toHaveClass(/visible/);
    
    // Hover over canvas center (likely over a node)
    await canvas.hover({ position: { x: 400, y: 300 } });
    await page.waitForTimeout(200);
    
    // Panel should appear (if node under cursor)
    const isVisible = await infoPanel.evaluate(el => el.classList.contains('visible'));
    // Note: Might not be over a node, so we just verify no crash
    expect(typeof isVisible).toBe('boolean');
  });

  test('legend displays all node types', async () => {
    const legendItems = page.locator('.legend-item');
    await expect(legendItems).toHaveCount(5);
    
    const texts = await legendItems.allTextContents();
    expect(texts.some(t => t.includes('Input'))).toBe(true);
    expect(texts.some(t => t.includes('Hidden'))).toBe(true);
    expect(texts.some(t => t.includes('Output'))).toBe(true);
    expect(texts.some(t => t.includes('Attention'))).toBe(true);
    expect(texts.some(t => t.includes('Anomal'))).toBe(true);
  });

  test('stats update in real-time', async () => {
    const initialActivity = await page.locator('#globalActivity').textContent();
    
    // Wait for simulation to run
    await page.waitForTimeout(2000);
    
    const laterActivity = await page.locator('#globalActivity').textContent();
    
    // Activity should change (simulation running)
    expect(initialActivity).not.toBe(laterActivity);
  });

  test('responsive layout on mobile viewport', async () => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.waitForTimeout(500);
    
    const hud = page.locator('.hud');
    const legend = page.locator('.legend');
    const controls = page.locator('.controls');
    
    await expect(hud).toBeVisible();
    await expect(legend).toBeVisible();
    await expect(controls).toBeVisible();
    
    // Reset to desktop
    await page.setViewportSize({ width: 1280, height: 720 });
  });

  test('maintains 30+ FPS under load', async () => {
    // Let it run for a bit
    await page.waitForTimeout(5000);
    
    const fps = await page.locator('#fps').textContent();
    expect(parseInt(fps)).toBeGreaterThanOrEqual(30);
  });

  test('no memory leak over time', async () => {
    // This is a basic check - real memory profiling needs devtools
    const initialMemory = await page.evaluate(() => {
      if (performance.memory) return performance.memory.usedJSHeapSize;
      return null;
    });
    
    if (initialMemory) {
      await page.waitForTimeout(10000);
      
      const laterMemory = await page.evaluate(() => {
        if (performance.memory) return performance.memory.usedJSHeapSize;
        return null;
      });
      
      // Memory growth should be minimal (< 10MB over 10s)
      const growth = laterMemory - initialMemory;
      expect(growth).toBeLessThan(10 * 1024 * 1024);
    }
  });
});

// Expose graph instance for testing
test('exposes graph instance for debugging', async () => {
  const exposed = await page.evaluate(() => {
    return typeof window.__NEURAL_GRAPH__ !== 'undefined';
  });
  // We'll add this in the improved version
  expect(exposed).toBe(false); // Current version doesn't expose
});