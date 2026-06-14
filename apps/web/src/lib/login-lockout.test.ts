/**
 * Tests unitarios para lib/login-lockout.ts — bloqueo por intentos fallidos (RNF-SEG-011).
 */

import { describe, expect, it } from 'vitest';
import {
  isLocked,
  lockoutRemainingMs,
  LOCKOUT_DURATION_MS,
  MAX_FAILED_ATTEMPTS,
  registerFailure,
  resetLockout,
  type LockoutState,
} from './login-lockout';

const CLEAN: LockoutState = { failedLoginAttempts: 0, lockedUntil: null };
const now = new Date('2026-06-14T12:00:00Z');

describe('isLocked', () => {
  it('devuelve false si lockedUntil es null', () => {
    expect(isLocked(CLEAN, now)).toBe(false);
  });

  it('devuelve true si lockedUntil es futuro', () => {
    const state: LockoutState = {
      failedLoginAttempts: 5,
      lockedUntil: new Date(now.getTime() + 60_000),
    };
    expect(isLocked(state, now)).toBe(true);
  });

  it('devuelve false si lockedUntil ya ha pasado', () => {
    const state: LockoutState = {
      failedLoginAttempts: 5,
      lockedUntil: new Date(now.getTime() - 1),
    };
    expect(isLocked(state, now)).toBe(false);
  });

  it('devuelve false exactamente en el instante de expiración', () => {
    // lockedUntil === now → ya expiró (>comparación es estricta)
    const state: LockoutState = {
      failedLoginAttempts: 5,
      lockedUntil: now,
    };
    expect(isLocked(state, now)).toBe(false);
  });
});

describe('lockoutRemainingMs', () => {
  it('devuelve 0 si no hay bloqueo', () => {
    expect(lockoutRemainingMs(CLEAN, now)).toBe(0);
  });

  it('devuelve el tiempo restante correcto', () => {
    const state: LockoutState = {
      failedLoginAttempts: 5,
      lockedUntil: new Date(now.getTime() + 5_000),
    };
    expect(lockoutRemainingMs(state, now)).toBe(5_000);
  });

  it('devuelve 0 si el bloqueo ya expiró', () => {
    const state: LockoutState = {
      failedLoginAttempts: 5,
      lockedUntil: new Date(now.getTime() - 1_000),
    };
    expect(lockoutRemainingMs(state, now)).toBe(0);
  });
});

describe('registerFailure', () => {
  it('incrementa el contador en 1 sin bloquear (primer fallo)', () => {
    const result = registerFailure(CLEAN, now);
    expect(result.failedLoginAttempts).toBe(1);
    expect(result.lockedUntil).toBeNull();
  });

  it(`bloquea exactamente al alcanzar ${MAX_FAILED_ATTEMPTS} fallos`, () => {
    let state: LockoutState = CLEAN;
    for (let i = 0; i < MAX_FAILED_ATTEMPTS - 1; i++) {
      state = { ...state, ...registerFailure(state, now) };
      expect(state.lockedUntil).toBeNull();
    }
    // Último fallo: dispara bloqueo
    const result = registerFailure(state, now);
    expect(result.failedLoginAttempts).toBe(MAX_FAILED_ATTEMPTS);
    expect(result.lockedUntil).not.toBeNull();
    expect(result.lockedUntil!.getTime()).toBe(now.getTime() + LOCKOUT_DURATION_MS);
  });

  it('bloquea por LOCKOUT_DURATION_MS (15 min)', () => {
    let state: LockoutState = CLEAN;
    for (let i = 0; i < MAX_FAILED_ATTEMPTS; i++) {
      state = { ...state, ...registerFailure(state, now) };
    }
    expect(state.lockedUntil!.getTime() - now.getTime()).toBe(LOCKOUT_DURATION_MS);
    expect(LOCKOUT_DURATION_MS).toBe(15 * 60 * 1000);
  });

  it('reinicia el contador si el bloqueo anterior había expirado', () => {
    // Simula: cuenta bloqueada en el pasado, el bloqueo ya expiró
    const expiredLock = new Date(now.getTime() - 1);
    const stateWithExpiredLock: LockoutState = {
      failedLoginAttempts: MAX_FAILED_ATTEMPTS,
      lockedUntil: expiredLock,
    };
    // Primer nuevo fallo tras expiración → el contador vuelve a 1 (no suma sobre 5)
    const result = registerFailure(stateWithExpiredLock, now);
    expect(result.failedLoginAttempts).toBe(1);
    expect(result.lockedUntil).toBeNull();
  });

  it('continúa acumulando si el bloqueo actual aún NO ha expirado', () => {
    // La cuenta está bloqueada pero le queda tiempo; el fallo sigue acumulando
    const activeLock = new Date(now.getTime() + 60_000);
    const state: LockoutState = {
      failedLoginAttempts: MAX_FAILED_ATTEMPTS,
      lockedUntil: activeLock,
    };
    const result = registerFailure(state, now);
    // El contador sube (ya está en MAX+1)
    expect(result.failedLoginAttempts).toBe(MAX_FAILED_ATTEMPTS + 1);
    // El lockedUntil se renueva (nuevo bloqueo calculado desde now)
    expect(result.lockedUntil).not.toBeNull();
  });

  it('no muta el estado original', () => {
    const original: LockoutState = { failedLoginAttempts: 3, lockedUntil: null };
    registerFailure(original, now);
    expect(original.failedLoginAttempts).toBe(3);
  });
});

describe('resetLockout', () => {
  it('devuelve estado limpio', () => {
    const result = resetLockout();
    expect(result.failedLoginAttempts).toBe(0);
    expect(result.lockedUntil).toBeNull();
  });

  it('el resultado de resetLockout no debe estar bloqueado', () => {
    const state: LockoutState = { ...CLEAN, ...resetLockout() };
    expect(isLocked(state, now)).toBe(false);
  });
});

describe('flujo completo de lockout', () => {
  it('5 fallos → bloqueo → reset tras login exitoso', () => {
    let state: LockoutState = CLEAN;

    // 4 fallos sin bloqueo
    for (let i = 0; i < MAX_FAILED_ATTEMPTS - 1; i++) {
      state = { ...state, ...registerFailure(state, now) };
      expect(isLocked(state, now)).toBe(false);
    }

    // 5º fallo: bloqueo
    state = { ...state, ...registerFailure(state, now) };
    expect(isLocked(state, now)).toBe(true);

    // Login exitoso: reset
    state = { ...state, ...resetLockout() };
    expect(isLocked(state, now)).toBe(false);
    expect(state.failedLoginAttempts).toBe(0);
  });

  it('bloqueo expira tras LOCKOUT_DURATION_MS', () => {
    let state: LockoutState = CLEAN;
    for (let i = 0; i < MAX_FAILED_ATTEMPTS; i++) {
      state = { ...state, ...registerFailure(state, now) };
    }
    // Antes de expirar: bloqueada
    expect(isLocked(state, now)).toBe(true);
    // Tras expirar: desbloqueada
    const afterExpiry = new Date(now.getTime() + LOCKOUT_DURATION_MS);
    expect(isLocked(state, afterExpiry)).toBe(false);
  });
});
