/**
 * Utilidades puras para recovery codes de MFA (RNF-SEG-002).
 *
 * Diseño:
 *   - 10 códigos de 8 caracteres alfanuméricos (sin ambiguos: 0/O, 1/I/l).
 *   - Se almacena el hash SHA-256 en hex (64 chars). El código plano solo se
 *     muestra al usuario una única vez (en la pantalla de confirmación MFA).
 *   - hashRecoveryCode: determinista (SHA-256). Permite buscar por hash en BD.
 *   - generateRecoveryCodes: devuelve { plain, hash } para cada código.
 *   - verifyRecoveryCode: dada una lista de hashes disponibles (sin usedAt) y
 *     el código introducido, devuelve el hash si coincide (para marcarlo usado).
 *
 * TODO Q-SEC: los códigos tienen entropía de ~47 bits (8 chars × 5.9 bits).
 * Si en el futuro se eleva el nivel de seguridad, aumentar a 12 chars (~71 bits).
 */

// Web Crypto isomórfico (sin node:crypto) para no romper el bundle de Next.js:
// este módulo es alcanzable desde `auth.ts`, que entra en el grafo del cliente
// vía tRPC (mismo motivo que `tokens.ts`/`totp.ts`). SHA-256 es asíncrono.

// ---------------------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------------------

/** Número de recovery codes generados al activar MFA. */
export const RECOVERY_CODE_COUNT = 10;

/**
 * Alfabeto sin caracteres ambiguos (0/O, 1/I/l) para máxima legibilidad.
 * 32 caracteres → ~5 bits por carácter.
 */
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/** Longitud de cada código en caracteres. */
const CODE_LENGTH = 8;

// ---------------------------------------------------------------------------
// Funciones puras
// ---------------------------------------------------------------------------

/**
 * Genera un código de recuperación aleatorio de CODE_LENGTH caracteres.
 * Usa randomBytes para criptografía segura.
 */
function generateSingleCode(): string {
  const bytes = new Uint8Array(CODE_LENGTH);
  globalThis.crypto.getRandomValues(bytes);
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    // Modulo bias es mínimo (256 % 32 = 0; división exacta — sin sesgo).
    code += ALPHABET[bytes[i]! % ALPHABET.length];
  }
  return code;
}

/**
 * Calcula el hash SHA-256 de un recovery code en formato hex.
 * Determinista: el mismo código siempre produce el mismo hash.
 * Se normaliza a mayúsculas antes de hashear para tolerar errores de casing.
 */
export async function hashRecoveryCode(code: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(code.toUpperCase()),
  );
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** Par de código plano + su hash para almacenar en BD. */
export interface RecoveryCodePair {
  plain: string; // mostrar al usuario (solo una vez)
  hash: string;  // almacenar en BD (mfa_recovery_codes.code_hash)
}

/**
 * Genera RECOVERY_CODE_COUNT códigos de recuperación.
 * Devuelve los pares { plain, hash }.
 * El llamante (router) devuelve los `plain` al usuario y persiste solo los `hash`.
 */
export async function generateRecoveryCodes(): Promise<RecoveryCodePair[]> {
  const pairs: RecoveryCodePair[] = [];
  for (let i = 0; i < RECOVERY_CODE_COUNT; i++) {
    const plain = generateSingleCode();
    pairs.push({ plain, hash: await hashRecoveryCode(plain) });
  }
  return pairs;
}

/**
 * Verifica si un código plano coincide con alguno de los hashes disponibles.
 *
 * @param availableHashes - hashes de los recovery codes disponibles (sin usedAt)
 * @param inputCode       - código introducido por el usuario
 * @returns el hash del código encontrado (para marcar como usado en BD), o null si no coincide
 */
export async function findRecoveryCodeHash(
  availableHashes: string[],
  inputCode: string,
): Promise<string | null> {
  const inputHash = await hashRecoveryCode(inputCode);
  return availableHashes.find((h) => h === inputHash) ?? null;
}
