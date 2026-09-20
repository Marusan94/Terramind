/** Posición persistente del chat: clamp al viewport + restore de localStorage. */
import { describe, it, expect, beforeEach } from 'vitest';
import { clampChatPos, loadChatPos } from '../components/ChatWidget';

const KEY = 'terramind-chat-pos';

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
});
