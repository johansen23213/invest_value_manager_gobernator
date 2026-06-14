/**
 * Lógica pura de bloqueo de cuenta por intentos fallidos (RNF-SEG-011).
 *
 * Diseño:
 *   - N=5 intentos fallidos disparan el bloqueo.
 *   - Bloqueo de 15 minutos fijo (ventana progresiva añade complejidad sin
 *     ganancia significativa para el perfil de amenaza: brute-force remoto ya
 *     está mitigado por rate-limiting de red; 15 min es suficiente freno).
 *   - Estado persistido en User.failedLoginAttempts + User.lockedUntil.
 *   - Las funciones son PURAS: reciben estado y retornan estado nuevo.
 *     La escritura en BD la hace el llamante (authorize en auth.ts).
 *
 * Por qué estado en User y no tabla LoginAttempt:
 *   - Para lockout basta contador + timestamp; no necesitamos historial por IP.
 *   - Un historial de intentos por IP requeriría tabla separada + limpieza periódica.
 *   - Si en el futuro se necesita trazabilidad forense, AuditLog ya la provee.
 */

// ---------------------------------------------------------------------------
// Tipos y constantes
// ---------------------------------------------------------------------------

export const MAX_FAILED_ATTEMPTS = 5;
export const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutos

/** Estado de bloqueo persistido en la tabla User (subset de campos). */
export interface LockoutState {
  failedLoginAttempts: number;
  lockedUntil: Date | null;
}

/** Estado actualizado que el llamante debe persistir en BD. */
export interface LockoutUpdate {
  failedLoginAttempts: number;
  lockedUntil: Date | null;
}

// ---------------------------------------------------------------------------
// Funciones puras
// ---------------------------------------------------------------------------

/**
 * Indica si la cuenta está bloqueada en el instante `now`.
 * Bloqueada = lockedUntil existe Y es futuro respecto a `now`.
 */
export function isLocked(state: LockoutState, now: Date = new Date()): boolean {
  if (!state.lockedUntil) return false;
  return state.lockedUntil > now;
}

/**
 * Cuántos ms faltan para que expire el bloqueo (0 si no está bloqueada o ya expiró).
 * Útil para devolver al cliente un tiempo de espera sin revelar detalles.
 */
export function lockoutRemainingMs(state: LockoutState, now: Date = new Date()): number {
  if (!state.lockedUntil) return 0;
  const remaining = state.lockedUntil.getTime() - now.getTime();
  return Math.max(0, remaining);
}

/**
 * Registra un fallo de autenticación. Devuelve el estado actualizado.
 *
 * Si se alcanza MAX_FAILED_ATTEMPTS, fija lockedUntil = now + LOCKOUT_DURATION_MS.
 * Si la cuenta ya estaba bloqueada y ha expirado el bloqueo, reinicia el contador
 * antes de acumular (el bloqueo anterior ya cumplió su función).
 */
export function registerFailure(
  state: LockoutState,
  now: Date = new Date(),
): LockoutUpdate {
  // Si había un bloqueo previo ya expirado, empezamos desde cero.
  const currentAttempts =
    state.lockedUntil && state.lockedUntil <= now ? 0 : state.failedLoginAttempts;

  const newAttempts = currentAttempts + 1;

  if (newAttempts >= MAX_FAILED_ATTEMPTS) {
    return {
      failedLoginAttempts: newAttempts,
      lockedUntil: new Date(now.getTime() + LOCKOUT_DURATION_MS),
    };
  }

  return {
    failedLoginAttempts: newAttempts,
    lockedUntil: null,
  };
}

/**
 * Resetea el estado de bloqueo tras un login exitoso.
 * Siempre devuelve { failedLoginAttempts: 0, lockedUntil: null }.
 */
export function resetLockout(): LockoutUpdate {
  return { failedLoginAttempts: 0, lockedUntil: null };
}
