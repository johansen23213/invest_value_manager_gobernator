/**
 * Tests unitarios para lib/totp.ts — TOTP RFC 6238.
 *
 * Incluye vectores de prueba del RFC 4226 Appendix D y casos de borde.
 * hotp/totp/verifyTotp son asíncronos (Web Crypto isomórfico).
 */

import { describe, expect, it } from 'vitest';
import {
  buildOtpauthUrl,
  decodeBase32,
  encodeBase32,
  generateTotpSecret,
  hotp,
  totp,
  verifyTotp,
} from './totp';

// ---------------------------------------------------------------------------
// Vectores RFC 4226 Appendix D
// El secreto es la cadena ASCII "12345678901234567890" (20 bytes) en base32.
// HOTP(K,0)=755224, HOTP(K,1)=287082, HOTP(K,2)=359152...
// Referencia: https://datatracker.ietf.org/doc/html/rfc4226#appendix-D
// ---------------------------------------------------------------------------

const RFC_SECRET_ASCII = '12345678901234567890';

/** Codifica una cadena ASCII en base32 (sin Buffer; Uint8Array isomórfico). */
function asciiToBase32(s: string): string {
  return encodeBase32(new TextEncoder().encode(s));
}

describe('encodeBase32 / decodeBase32', () => {
  it('roundtrip para bytes aleatorios', () => {
    const buf = Uint8Array.from([0x00, 0xff, 0x12, 0xab, 0xcd]);
    const encoded = encodeBase32(buf);
    const decoded = decodeBase32(encoded);
    expect(decoded).toEqual(buf);
  });

  it('roundtrip para buffer vacío', () => {
    const buf = Uint8Array.from([]);
    expect(decodeBase32(encodeBase32(buf))).toEqual(buf);
  });

  it('acepta minúsculas en decode', () => {
    const buf = Uint8Array.from([0x48, 0x65, 0x6c, 0x6c, 0x6f]); // "Hello"
    const upper = encodeBase32(buf);
    expect(decodeBase32(upper.toLowerCase())).toEqual(buf);
  });

  it('acepta padding = en decode', () => {
    const buf = Uint8Array.from([0x48, 0x65, 0x6c]); // "Hel"
    const withPadding = encodeBase32(buf) + '===';
    expect(decodeBase32(withPadding)).toEqual(buf);
  });

  it('lanza con carácter inválido', () => {
    expect(() => decodeBase32('AAAA1')).toThrow('base32');
  });
});

describe('hotp — RFC 4226', () => {
  // RFC 4226 Appendix D: secreto = "12345678901234567890" (ASCII → 20 bytes)
  const secret = asciiToBase32(RFC_SECRET_ASCII);

  it('HOTP(K,0) = 755224', async () => {
    expect(await hotp(secret, 0)).toBe('755224');
  });

  it('HOTP(K,1) = 287082', async () => {
    expect(await hotp(secret, 1)).toBe('287082');
  });

  it('HOTP(K,2) = 359152', async () => {
    expect(await hotp(secret, 2)).toBe('359152');
  });

  it('HOTP(K,3) = 969429', async () => {
    expect(await hotp(secret, 3)).toBe('969429');
  });

  it('siempre devuelve 6 dígitos con padding', async () => {
    const code = await hotp(secret, 9);
    expect(code).toHaveLength(6);
    expect(/^\d{6}$/.test(code)).toBe(true);
  });
});

describe('totp — cálculo y verificación', () => {
  const secret = generateTotpSecret();

  it('genera secreto de 32 chars (20 bytes en base32)', () => {
    // 20 bytes = 160 bits; base32 de 20 bytes = 32 chars sin padding
    expect(secret).toHaveLength(32);
    expect(/^[A-Z2-7]+$/.test(secret)).toBe(true);
  });

  it('verifyTotp: código generado en el mismo periodo es válido', async () => {
    const nowMs = Date.now();
    const code = await totp(secret, nowMs);
    expect(await verifyTotp(secret, code, 1, nowMs)).toBe(true);
  });

  it('verifyTotp: código del periodo anterior es válido con window=1', async () => {
    const nowMs = Date.now();
    const prevMs = nowMs - 30_000;
    const prevCode = await totp(secret, prevMs);
    expect(await verifyTotp(secret, prevCode, 1, nowMs)).toBe(true);
  });

  it('verifyTotp: código del periodo anterior es inválido con window=0', async () => {
    const nowMs = Date.now();
    const prevMs = nowMs - 30_000;
    const prevCode = await totp(secret, prevMs);
    expect(await verifyTotp(secret, prevCode, 0, nowMs)).toBe(false);
  });

  it('verifyTotp: código del futuro lejano (>1 periodo) es inválido con window=1', async () => {
    const nowMs = Date.now();
    const futureMs = nowMs + 60_000 + 1; // +2 periodos
    const futureCode = await totp(secret, futureMs);
    expect(await verifyTotp(secret, futureCode, 1, nowMs)).toBe(false);
  });

  it('verifyTotp rechaza token no numérico', async () => {
    const nowMs = Date.now();
    expect(await verifyTotp(secret, 'abcdef', 1, nowMs)).toBe(false);
  });

  it('verifyTotp rechaza token de longitud incorrecta', async () => {
    const nowMs = Date.now();
    expect(await verifyTotp(secret, '12345', 1, nowMs)).toBe(false);
    expect(await verifyTotp(secret, '1234567', 1, nowMs)).toBe(false);
  });

  it('verifyTotp rechaza secreto inválido (rechaza la promesa)', async () => {
    // decodeBase32 lanza si el secreto tiene caracteres no-base32. El llamante
    // (router y auth.ts) siempre trabaja con secretos de generateTotpSecret()
    // — siempre válidos. Este test documenta el comportamiento real (rechazar).
    const nowMs = Date.now();
    await expect(verifyTotp('!!!invalid!!!', '123456', 1, nowMs)).rejects.toThrow('base32');
  });

  it('codes are deterministas con el mismo timestamp', async () => {
    const ts = 1_700_000_000_000;
    const a = await totp(secret, ts);
    const b = await totp(secret, ts);
    expect(a).toBe(b);
  });

  it('códigos de periodos distintos son distintos (estadísticamente cierto)', async () => {
    const ts1 = 1_700_000_000_000; // periodo N
    const ts2 = ts1 + 30_000; // periodo N+1
    const c1 = await totp(secret, ts1);
    const c2 = await totp(secret, ts2);
    expect(c1).not.toBe(c2);
  });
});

describe('buildOtpauthUrl', () => {
  it('construye URL otpauth con parámetros correctos', () => {
    const secret = 'JBSWY3DPEHPK3PXP';
    const url = buildOtpauthUrl(secret, 'user@vetlla.eu', 'Vetlla');
    expect(url).toMatch(/^otpauth:\/\/totp\//);
    expect(url).toContain(`secret=${secret}`);
    expect(url).toContain('issuer=Vetlla');
    expect(url).toContain('algorithm=SHA1');
    expect(url).toContain('digits=6');
    expect(url).toContain('period=30');
    expect(url).toContain(encodeURIComponent('Vetlla:user@vetlla.eu'));
  });

  it('usa "Vetlla" como issuer por defecto', () => {
    const url = buildOtpauthUrl('JBSWY3DPEHPK3PXP', 'u@v.eu');
    expect(url).toContain('issuer=Vetlla');
  });
});

describe('generateTotpSecret', () => {
  it('produce secretos distintos en cada llamada', () => {
    const s1 = generateTotpSecret();
    const s2 = generateTotpSecret();
    expect(s1).not.toBe(s2);
  });

  it('produce siempre 32 caracteres base32', () => {
    for (let i = 0; i < 10; i++) {
      const s = generateTotpSecret();
      expect(s).toHaveLength(32);
      expect(/^[A-Z2-7]+$/.test(s)).toBe(true);
    }
  });
});
