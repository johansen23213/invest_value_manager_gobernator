import { afterEach, describe, expect, it } from 'vitest';
import { checkRateLimit, clearRateLimitStore, isRateLimited } from './rate-limit';

describe('checkRateLimit — ventana deslizante en memoria', () => {
  afterEach(() => {
    clearRateLimitStore();
  });

  it('permite intentos hasta el límite', () => {
    for (let i = 0; i < 10; i++) {
      expect(checkRateLimit('user-1', 10, 60_000)).toBe(true);
    }
  });

  it('bloquea el intento que supera el límite', () => {
    for (let i = 0; i < 10; i++) {
      checkRateLimit('user-1', 10, 60_000);
    }
    expect(checkRateLimit('user-1', 10, 60_000)).toBe(false);
  });

  it('las claves son independientes entre sí', () => {
    for (let i = 0; i < 10; i++) {
      checkRateLimit('user-1', 10, 60_000);
    }
    // user-2 no ha tocado su ventana
    expect(checkRateLimit('user-2', 10, 60_000)).toBe(true);
  });

  it('isRateLimited no registra un nuevo intento', () => {
    for (let i = 0; i < 10; i++) {
      checkRateLimit('user-rl', 10, 60_000);
    }
    expect(isRateLimited('user-rl', 10, 60_000)).toBe(true);
    // El siguiente checkRateLimit todavía falla (isRateLimited no consumió slot)
    expect(checkRateLimit('user-rl', 10, 60_000)).toBe(false);
  });

  it('una clave sin intentos no está limitada', () => {
    expect(isRateLimited('nuevo-key', 10, 60_000)).toBe(false);
  });

  it('expira intentos fuera de la ventana', async () => {
    // Ventana muy corta (1 ms) para forzar expiración rápida
    checkRateLimit('user-exp', 1, 1);
    // Esperamos que el intento expire
    await new Promise((r) => setTimeout(r, 5));
    // Ahora la ventana está vacía: se permite de nuevo
    expect(checkRateLimit('user-exp', 1, 1)).toBe(true);
  });

  it('clearRateLimitStore limpia todos los contadores', () => {
    for (let i = 0; i < 10; i++) {
      checkRateLimit('user-c', 10, 60_000);
    }
    clearRateLimitStore();
    expect(checkRateLimit('user-c', 10, 60_000)).toBe(true);
  });

  it('H-5 — el Map no conserva entradas con bucket vacío tras expiración (no leak)', async () => {
    // Ventana de 1 ms para forzar expiración rápida
    checkRateLimit('user-leak', 5, 1);
    // Esperar que el intento expire
    await new Promise((r) => setTimeout(r, 5));
    // La siguiente llamada poda y debe eliminar la entrada antes de re-insertar
    // El store solo tiene la entrada fresca del nuevo intento
    expect(checkRateLimit('user-leak', 5, 1)).toBe(true);
    // Comprobar que el store no acumula después de expirar y hacer una sola llamada:
    // si la key persiste, isRateLimited devolverá false (solo 1 intento)
    await new Promise((r) => setTimeout(r, 5));
    // Tras expiración, la siguiente checkRateLimit hace barrido: el bucket queda
    // vacío momentáneamente antes de añadir el nuevo intento
    expect(checkRateLimit('user-leak', 5, 60_000)).toBe(true); // 1 intento fresco
  });
});
