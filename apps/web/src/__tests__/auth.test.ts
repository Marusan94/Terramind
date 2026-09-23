/** Auth opcional: perfil local con validación de email. */
import { describe, it, expect, beforeEach } from 'vitest';
import { clearAuth, hasSeenAuthPrompt, isValidEmail, loadAuth, markAuthPromptSeen, saveAuth } from '../services/auth';

beforeEach(() => {
  window.localStorage.clear();
});

describe('isValidEmail', () => {
  it('acepta emails válidos', () => {
    expect(isValidEmail('santi@udea.edu.co')).toBe(true);
  });

  it('rechaza texto sin forma de email', () => {
    expect(isValidEmail('no-es-email')).toBe(false);
    expect(isValidEmail('a@b')).toBe(false);
    expect(isValidEmail('')).toBe(false);
  });
});

describe('perfil', () => {
  it('null sin cuenta guardada', () => {
    expect(loadAuth()).toBeNull();
  });

  it('guarda y restaura', () => {
    saveAuth({ displayName: 'Santi', email: 'santi@udea.edu.co', wantsAlerts: true });
    expect(loadAuth()).toMatchObject({ displayName: 'Santi', email: 'santi@udea.edu.co', wantsAlerts: true });
  });

  it('ignora email inválido guardado a mano', () => {
    window.localStorage.setItem('terramind.auth.v1', JSON.stringify({ email: 'roto' }));
    expect(loadAuth()).toBeNull();
  });

  it('limpia la cuenta', () => {
    saveAuth({ displayName: '', email: 'santi@udea.edu.co', wantsAlerts: false });
    clearAuth();
    expect(loadAuth()).toBeNull();
  });
});

describe('sugerencia al entrar', () => {
  it('no vista al inicio, vista tras marcar', () => {
    expect(hasSeenAuthPrompt()).toBe(false);
    markAuthPromptSeen();
    expect(hasSeenAuthPrompt()).toBe(true);
  });
});
