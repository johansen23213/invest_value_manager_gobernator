/**
 * Tests unitarios para lib/mfa-crypto.ts — SEC-C01.
 *
 * Cubre:
 *   1. Roundtrip: encrypt → decrypt devuelve el secreto original.
 *   2. El valor almacenado NO es el texto plano (cifrado real).
 *   3. Un authTag manipulado provoca error en descifrado.
 *   4. Formato inválido (no iv:ciphertext:authTag) lanza error descriptivo.
 *   5. Cada llamada a encryptSecret genera un IV distinto (nonce único).
 */

import { describe, it, expect, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Clave de test — 32 bytes en base64 (valor fijo, no usada en producción)
// ---------------------------------------------------------------------------
const TEST_KEY_B64 = Buffer.from(new Uint8Array(32).fill(0xab)).toString('base64');

// Mockear el módulo @/env ANTES de importar mfa-crypto para que getKey() use
// la clave de test. El mock debe declararse antes del import dinámico.
vi.mock('@/env', () => ({
  env: {
    MFA_ENCRYPTION_KEY: TEST_KEY_B64,
  },
}));

// Importación dinámica para asegurarnos de que el mock está activo cuando
// el módulo se carga por primera vez.
const { encryptSecret, decryptSecret } = await import('./mfa-crypto');

// ---------------------------------------------------------------------------
// Helper: fuerza la recarga del módulo para limpiar la clave cacheada entre tests.
// No es necesario si todos los tests usan la misma clave de test.
// ---------------------------------------------------------------------------

describe('mfa-crypto — AES-256-GCM en reposo', () => {
  const SAMPLE_SECRET = 'JBSWY3DPEHPK3PXP'; // secreto TOTP base32 típico (16 chars)

  // -------------------------------------------------------------------------
  // 1. Roundtrip
  // -------------------------------------------------------------------------
  it('roundtrip: decrypt(encrypt(plain)) === plain', async () => {
    const stored = await encryptSecret(SAMPLE_SECRET);
    const recovered = await decryptSecret(stored);
    expect(recovered).toBe(SAMPLE_SECRET);
  });

  // -------------------------------------------------------------------------
  // 2. El almacenado NO es el texto plano
  // -------------------------------------------------------------------------
  it('el valor almacenado no contiene el secreto en claro', async () => {
    const stored = await encryptSecret(SAMPLE_SECRET);
    // No debe aparecer la cadena plana en ninguna parte del string almacenado
    expect(stored).not.toContain(SAMPLE_SECRET);
    // Debe tener formato iv:ciphertext:authTag (tres partes separadas por ':')
    const parts = stored.split(':');
    expect(parts).toHaveLength(3);
  });

  // -------------------------------------------------------------------------
  // 3. authTag manipulado provoca error
  // -------------------------------------------------------------------------
  it('descifrado falla si el authTag está manipulado', async () => {
    const stored = await encryptSecret(SAMPLE_SECRET);
    const [iv, ciphertext] = stored.split(':');
    // Substituir el authTag por basura (mismo length en base64 pero valor distinto)
    const fakeTag = Buffer.from(new Uint8Array(16).fill(0x00)).toString('base64');
    const tampered = `${iv}:${ciphertext}:${fakeTag}`;

    await expect(decryptSecret(tampered)).rejects.toThrow('authTag inválido');
  });

  // -------------------------------------------------------------------------
  // 4. Formato inválido lanza error descriptivo
  // -------------------------------------------------------------------------
  it('lanza error descriptivo si el formato almacenado no es iv:ciphertext:authTag', async () => {
    // Un secreto en claro (sin cifrar) tendría formato base32, no tres partes
    await expect(decryptSecret('JBSWY3DPEHPK3PXP')).rejects.toThrow(
      'formato de secreto almacenado inválido',
    );
  });

  // -------------------------------------------------------------------------
  // 5. Nonce único por llamada (no reutilización de IV)
  // -------------------------------------------------------------------------
  it('cada cifrado genera un IV diferente (nonce único por operación)', async () => {
    const stored1 = await encryptSecret(SAMPLE_SECRET);
    const stored2 = await encryptSecret(SAMPLE_SECRET);
    const iv1 = stored1.split(':')[0];
    const iv2 = stored2.split(':')[0];
    expect(iv1).not.toBe(iv2);
  });

  // -------------------------------------------------------------------------
  // 6. Roundtrip con secreto largo (20 bytes base32 = 32 chars estándar TOTP)
  // -------------------------------------------------------------------------
  it('roundtrip con secreto de 20 bytes (estándar RFC 4226)', async () => {
    // generateTotpSecret produce ~32 chars base32 (20 bytes * 8/5 = 32)
    const longSecret = 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PX'; // 32 chars
    const stored = await encryptSecret(longSecret);
    const recovered = await decryptSecret(stored);
    expect(recovered).toBe(longSecret);
  });
});
