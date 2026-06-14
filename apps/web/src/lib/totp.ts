/**
 * TOTP RFC 6238 — implementación pura con Web Crypto (isomórfica).
 *
 * Diseño deliberado sin dependencias externas:
 *   - Implementa HOTP (RFC 4226) + TOTP (RFC 6238) con HMAC-SHA1, periodo 30s, 6 dígitos.
 *   - Usa Web Crypto (`globalThis.crypto.subtle`) en vez de `node:crypto` para no
 *     romper el bundle de Next.js: este módulo es alcanzable desde `auth.ts`, que
 *     a su vez entra en el grafo del cliente vía tRPC (mismo motivo que `tokens.ts`
 *     y `visits.ts` usan Web Crypto). Disponible en server, edge y navegador.
 *   - Totalmente testable sin mocks: la función recibe el timestamp como parámetro.
 *   - HMAC-SHA1 con Web Crypto es asíncrono → hotp/totp/verifyTotp devuelven Promise.
 *
 * Parámetros RFC 6238:
 *   - Algorithm: HMAC-SHA1
 *   - Period: 30 segundos
 *   - Digits: 6
 *   - Window: ±1 periodo (configurable por llamante, 0 = validación estricta)
 */

// ---------------------------------------------------------------------------
// Constantes TOTP (RFC 6238)
// ---------------------------------------------------------------------------
const PERIOD_SECONDS = 30;
const DIGITS = 6;
const DIGITS_DIVISOR = 10 ** DIGITS; // 1_000_000

// Alfabeto base32 RFC 4648 (sin padding)
const BASE32_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

// ---------------------------------------------------------------------------
// Encode / decode base32 (RFC 4648 — sin padding)
// ---------------------------------------------------------------------------

/**
 * Codifica un buffer de bytes como cadena base32 uppercase.
 * Se usa para generar el secreto en formato estándar para QR/authenticators.
 */
export function encodeBase32(buf: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let output = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_CHARS[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += BASE32_CHARS[(value << (5 - bits)) & 31];
  }
  return output;
}

/**
 * Decodifica una cadena base32 a bytes.
 * Acepta caracteres en mayúsculas/minúsculas y espacios (tolerante a formatos de app).
 * Lanza si hay caracteres inválidos.
 */
export function decodeBase32(input: string): Uint8Array<ArrayBuffer> {
  const cleaned = input.toUpperCase().replace(/\s+/g, '').replace(/=/g, '');
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const char of cleaned) {
    const idx = BASE32_CHARS.indexOf(char);
    if (idx === -1) throw new Error(`Carácter base32 inválido: ${char}`);
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Uint8Array.from(bytes);
}

// ---------------------------------------------------------------------------
// HMAC-SHA1 isomórfico (Web Crypto)
// ---------------------------------------------------------------------------

/** Calcula HMAC-SHA1(key, msg) con Web Crypto. Devuelve los 20 bytes del MAC. */
async function hmacSha1(key: BufferSource, msg: BufferSource): Promise<Uint8Array> {
  const cryptoKey = await globalThis.crypto.subtle.importKey(
    'raw',
    key,
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign'],
  );
  const sig = await globalThis.crypto.subtle.sign('HMAC', cryptoKey, msg);
  return new Uint8Array(sig);
}

// ---------------------------------------------------------------------------
// HOTP (RFC 4226)
// ---------------------------------------------------------------------------

/**
 * Calcula el código HOTP para un secreto base32 y un contador dado.
 * Algoritmo: HMAC-SHA1(secret, counter_big_endian_8bytes) → truncate → mod 10^6
 */
export async function hotp(secretBase32: string, counter: number): Promise<string> {
  const key = decodeBase32(secretBase32);

  // RFC 4226 §5: el contador va en big-endian 8 bytes
  const msg = new Uint8Array(8);
  // JS números seguros hasta 2^53; counter TOTP nunca superará Number.MAX_SAFE_INTEGER
  let c = counter;
  for (let i = 7; i >= 0; i--) {
    msg[i] = c & 0xff;
    c = Math.floor(c / 256);
  }

  const hmac = await hmacSha1(key, msg);

  // Dynamic truncation (RFC 4226 §5.4)
  const offset = hmac[hmac.length - 1]! & 0x0f;
  const bin = (
    ((hmac[offset]! & 0x7f) << 24) |
    ((hmac[offset + 1]! & 0xff) << 16) |
    ((hmac[offset + 2]! & 0xff) << 8) |
    (hmac[offset + 3]! & 0xff)
  );

  const otp = bin % DIGITS_DIVISOR;
  return otp.toString().padStart(DIGITS, '0');
}

// ---------------------------------------------------------------------------
// TOTP (RFC 6238)
// ---------------------------------------------------------------------------

/**
 * Calcula el código TOTP actual (o para un timestamp dado).
 * Para tests deterministas, pasa `nowMs` explícito.
 */
export async function totp(secretBase32: string, nowMs?: number): Promise<string> {
  const ts = nowMs ?? Date.now();
  const counter = Math.floor(ts / 1000 / PERIOD_SECONDS);
  return hotp(secretBase32, counter);
}

/**
 * Verifica un token TOTP con ventana de ±window periodos (default 1).
 * Devuelve true si el token es válido en algún periodo de la ventana.
 *
 * window=1 acepta el periodo anterior, el actual y el siguiente
 * (tolerancia de ±30s; estándar de facto en todos los authenticators).
 */
export async function verifyTotp(
  secretBase32: string,
  token: string,
  window = 1,
  nowMs?: number,
): Promise<boolean> {
  if (!/^\d{6}$/.test(token)) return false;
  const ts = nowMs ?? Date.now();
  const counter = Math.floor(ts / 1000 / PERIOD_SECONDS);
  for (let delta = -window; delta <= window; delta++) {
    if ((await hotp(secretBase32, counter + delta)) === token) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Generación de secreto
// ---------------------------------------------------------------------------

/**
 * Genera un secreto TOTP aleatorio de 20 bytes (160 bits) en base32.
 * 160 bits es el tamaño recomendado por RFC 4226 §4.
 */
export function generateTotpSecret(): string {
  const bytes = new Uint8Array(20);
  globalThis.crypto.getRandomValues(bytes);
  return encodeBase32(bytes);
}

/**
 * Construye el otpauth:// URI para generar el QR de onboarding.
 *
 * @param secret  Secreto base32
 * @param email   Email del usuario (label del authenticator)
 * @param issuer  Nombre del servicio (default "Vetlla")
 */
export function buildOtpauthUrl(secret: string, email: string, issuer = 'Vetlla'): string {
  const label = encodeURIComponent(`${issuer}:${email}`);
  const params = new URLSearchParams({
    secret,
    issuer,
    algorithm: 'SHA1',
    digits: String(DIGITS),
    period: String(PERIOD_SECONDS),
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}
