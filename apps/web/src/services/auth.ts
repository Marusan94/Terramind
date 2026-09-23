/**
 * Auth opcional de Terramind: perfil local (sin backend).
 * Hoy solo personaliza las alertas (nombre + email para avisos).
 * Manana sirve para push real, preferencias y cuotas sin pedir login.
 */

export interface AuthProfile {
  displayName: string;
  email: string;
  wantsAlerts: boolean;
  createdAt: number;
}

const KEY = 'terramind.auth.v1';

export function loadAuth(): AuthProfile | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as Partial<AuthProfile>;
    if (typeof p.email !== 'string' || !isValidEmail(p.email)) return null;
    return {
      displayName: typeof p.displayName === 'string' ? p.displayName : '',
      email: p.email.trim(),
      wantsAlerts: p.wantsAlerts === true,
      createdAt: typeof p.createdAt === 'number' ? p.createdAt : Date.now(),
    };
  } catch {
    return null;
  }
}

export function saveAuth(p: Omit<AuthProfile, 'createdAt'> & { createdAt?: number }): AuthProfile {
  const full: AuthProfile = {
    displayName: p.displayName.trim(),
    email: p.email.trim(),
    wantsAlerts: p.wantsAlerts,
    createdAt: p.createdAt ?? Date.now(),
  };
  try {
    localStorage?.setItem(KEY, JSON.stringify(full));
  } catch {
    // sin almacenamiento: el perfil vive solo en sesion
  }
  return full;
}

export function clearAuth(): void {
  try {
    localStorage?.removeItem(KEY);
  } catch {
    // nada que limpiar
  }
}

export function isValidEmail(e: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e.trim());
}

const PROMPT_KEY = 'terramind.auth.prompted.v1';

/** ¿Ya se le sugirió registrarse al entrar? (para no insistir). */
export function hasSeenAuthPrompt(): boolean {
  try {
    return localStorage?.getItem(PROMPT_KEY) === '1';
  } catch {
    return true;
  }
}

export function markAuthPromptSeen(): void {
  try {
    localStorage?.setItem(PROMPT_KEY, '1');
  } catch {
    // sin almacenamiento: no se vuelve a sugerir en la sesión
  }
}
