/** Posición persistente del chat: clamp al viewport + restore de localStorage. */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { clampChatPos, fitAbove, isSmallScreen, loadChatPos } from '../components/ChatWidget';

const KEY = 'terramind-chat-pos';
const REAL_WIDTH = window.innerWidth;

function setWidth(w: number) {
  Object.defineProperty(window, 'innerWidth', { value: w, configurable: true });
}

afterEach(() => {
  setWidth(REAL_WIDTH);
});

beforeEach(() => {
  window.localStorage.clear();
});

describe('clampChatPos', () => {
  it('recorta fuera del viewport', () => {
    const p = clampChatPos({ left: -500, top: 99999 });
    expect(p.left).toBeGreaterThanOrEqual(8);
    expect(p.top).toBeLessThanOrEqual(window.innerHeight - 8);
  });

  it('conserva posición válida', () => {
    expect(clampChatPos({ left: 100, top: 100 })).toEqual({ left: 100, top: 100 });
  });
});

describe('loadChatPos', () => {
  it('null sin nada guardado', () => {
    expect(loadChatPos()).toBeNull();
  });

  it('restaura lo guardado', () => {
    window.localStorage.setItem(KEY, JSON.stringify({ left: 120, top: 200 }));
    expect(loadChatPos()).toEqual({ left: 120, top: 200 });
  });

  it('ignora basura', () => {
    window.localStorage.setItem(KEY, 'no-json{{{');
    expect(loadChatPos()).toBeNull();
    window.localStorage.setItem(KEY, JSON.stringify({ left: 'x' }));
    expect(loadChatPos()).toBeNull();
  });

  it('en móvil ignora lo guardado (chat anclado, abre hacia arriba)', () => {
    window.localStorage.setItem(KEY, JSON.stringify({ left: 120, top: 200 }));
    setWidth(390);
    expect(isSmallScreen()).toBe(true);
    expect(loadChatPos()).toBeNull();
  });

  it('en escritorio sí restaura', () => {
    window.localStorage.setItem(KEY, JSON.stringify({ left: 120, top: 200 }));
    setWidth(1280);
    expect(isSmallScreen()).toBe(false);
    expect(loadChatPos()).toEqual({ left: 120, top: 200 });
  });
});

describe('fitAbove (el panel abre hacia arriba)', () => {
  it('baja el botón si está muy alto', () => {
    expect(fitAbove({ left: 900, top: 50 }, 900)).toEqual({ left: 900, top: 560 });
  });

  it('deja quieto si ya cabe el panel', () => {
    expect(fitAbove({ left: 900, top: 700 }, 900)).toEqual({ left: 900, top: 700 });
  });

  it('nunca saca el botón por abajo', () => {
    expect(fitAbove({ left: 900, top: 950 }, 900)).toEqual({ left: 900, top: 830 });
  });

  it('en viewport corto usa el máximo posible', () => {
    expect(fitAbove({ left: 900, top: 50 }, 600)).toEqual({ left: 900, top: 522 });
  });
});
