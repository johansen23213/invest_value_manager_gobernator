/**
 * Cifrado simétrico del secreto TOTP en reposo (SEC-C01).
 *
 * Algoritmo: AES-256-GCM (autenticado, resistente a manipulación del authTag).
 * Formato en BD:  "<iv_b64>:<ciphertext_b64>:<authTag_b64>"
 *   iv         — 12 bytes aleatorios (nonce GCM estándar)
 *   ciphertext — secreto TOTP base32 cifrado
 *   authTag    — 16 bytes de tag de autenticación GCM
 *
 * Fuente de la clave: variable de entorno MFA_ENCRYPTION_KEY (32 bytes en base64).
 * La clave se deriva una sola vez en `getKey()` y se cachea en memoria por proceso.
 *
 * KMS-ready (Q-SEC, bloqueado por Angel):
 *   Hoy la clave viene de `MFA_ENCRYPTION_KEY` (entorno). Cuando se integre un KMS
 *   soberano UE (p. ej. Scaleway KMS, OVHcloud Keys), basta con sustituir `getKey()`
 *   para que llame al KMS en lugar de leer la variable de entorno. La interfaz de
 *   `encryptSecret` / `decryptSecret` y el formato en BD NO cambian.
 *
 * NOTA DE MIGRACIÓN:
 *   Un despliegue sobre una BD con secretos TOTP previos en claro requeriría un
 *   re-enrolment (el usuario desactiva MFA y lo reactiva) o una migración de cifrado
 *   que lea cada fila, cifre y actualice. En CI/demo el seed re-crea los datos desde
 *   cero, por lo que no hay datos previos que migrar.
 *
 * Uso:
 *   import { encryptSecret, decryptSecret } from '@/lib/mfa-crypto';
 *
 *   // Al guardar (setup):
 *   const stored = await encryptSecret(plainBase32);
 *   await db.user.update({ data: { mfaSecret: stored } });
 *
 *   // Al verificar:
 *   const plainBase32 = await decryptSecret(stored);
 *   await verifyTotp(plainBase32, userInput);
 */

import { env } from '@/env';

// ---------------------------------------------------------------------------
// Clave AES-256-GCM derivada de la variable de entorno
// ---------------------------------------------------------------------------

let _cachedKey: CryptoKey | null = null;

/**
 * Importa y cachea la CryptoKey AES-256-GCM desde MFA_ENCRYPTION_KEY.
 *
 * KMS-ready: para migrar a KMS, sustituir esta función por una que solicite la
 * clave al KMS en cada llamada (o con TTL) y devuelva igualmente un CryptoKey.
 */
async function getKey(): Promise<CryptoKey> {
  if (_cachedKey) return _cachedKey;

  const keyB64 = env.MFA_ENCRYPTION_KEY;
  const nodeBuf = Buffer.from(keyB64, 'base64');

  if (nodeBuf.length !== 32) {
    throw new Error(
      `MFA_ENCRYPTION_KEY debe ser exactamente 32 bytes en base64 (got ${nodeBuf.length}). ` +
        'Genera una con: openssl rand -base64 32',
    );
  }

  // Extraer un ArrayBuffer puro (Web Crypto requiere ArrayBuffer, no Buffer de Node).
  const keyAb = nodeBuf.buffer.slice(
    nodeBuf.byteOffset,
    nodeBuf.byteOffset + nodeBuf.byteLength,
  ) as ArrayBuffer;

  _cachedKey = await globalThis.crypto.subtle.importKey(
    'raw',
    keyAb,
    { name: 'AES-GCM' },
    false,       // no exportable
    ['encrypt', 'decrypt'],
  );

  return _cachedKey;
}

// ---------------------------------------------------------------------------
// Utilidades de codificación
// ---------------------------------------------------------------------------

function bufToB64(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  return Buffer.from(bytes).toString('base64');
}

function b64ToBuf(b64: string): Uint8Array<ArrayBuffer> {
  // Convertir vía ArrayBuffer explícito para que TypeScript infiera ArrayBuffer
  // (en lugar de ArrayBufferLike que produce Buffer.from).
  // Web Crypto requiere ArrayBufferView<ArrayBuffer> en sus APIs.
  const nodeBuf = Buffer.from(b64, 'base64');
  const ab = nodeBuf.buffer.slice(
    nodeBuf.byteOffset,
    nodeBuf.byteOffset + nodeBuf.byteLength,
  ) as ArrayBuffer;
  return new Uint8Array(ab);
}

// ---------------------------------------------------------------------------
// Cifrar
// ---------------------------------------------------------------------------

/**
 * Cifra un secreto TOTP en claro y devuelve el string almacenable en BD.
 * Formato: "<iv_b64>:<ciphertext_b64>:<authTag_b64>"
 *
 * Cada llamada genera un IV aleatorio nuevo (nonce único por operación).
 */
export async function encryptSecret(plain: string): Promise<string> {
  const key = await getKey();

  // IV aleatorio de 12 bytes (recomendado por NIST SP 800-38D para AES-GCM)
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));

  const encoder = new TextEncoder();
  const result = await globalThis.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, tagLength: 128 },
    key,
    encoder.encode(plain),
  );

  // Web Crypto devuelve ciphertext + authTag concatenados al final (últimos 16 bytes)
  const fullBuf = new Uint8Array(result);
  const ciphertext = fullBuf.slice(0, fullBuf.length - 16);
  const authTag    = fullBuf.slice(fullBuf.length - 16);

  return `${bufToB64(iv)}:${bufToB64(ciphertext)}:${bufToB64(authTag)}`;
}

// ---------------------------------------------------------------------------
// Descifrar
// ---------------------------------------------------------------------------

/**
 * Descifra un secreto TOTP almacenado en BD y devuelve el valor en claro.
 * Lanza si el formato es incorrecto o el authTag no coincide (manipulación).
 */
export async function decryptSecret(stored: string): Promise<string> {
  const parts = stored.split(':');
  if (parts.length !== 3) {
    throw new Error('mfa-crypto: formato de secreto almacenado inválido (esperado iv:ciphertext:authTag)');
  }

  const [ivB64, ciphertextB64, authTagB64] = parts as [string, string, string];

  const iv         = b64ToBuf(ivB64);
  const ciphertext = b64ToBuf(ciphertextB64);
  const authTag    = b64ToBuf(authTagB64);

  const key = await getKey();

  // AES-GCM espera ciphertext + authTag concatenados
  const combined = new Uint8Array(ciphertext.length + authTag.length);
  combined.set(ciphertext, 0);
  combined.set(authTag, ciphertext.length);

  let plainBuf: ArrayBuffer;
  try {
    plainBuf = await globalThis.crypto.subtle.decrypt(
      { name: 'AES-GCM', iv, tagLength: 128 },
      key,
      combined,
    );
  } catch {
    // Web Crypto lanza OperationError si el authTag no coincide (manipulación o clave incorrecta)
    throw new Error('mfa-crypto: descifrado fallido — authTag inválido o clave incorrecta');
  }

  return new TextDecoder().decode(plainBuf);
}
