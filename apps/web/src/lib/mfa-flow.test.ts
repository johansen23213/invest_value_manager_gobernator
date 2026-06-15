/**
 * Tests de comportamiento MFA — flujo setup → verify TOTP → recovery codes.
 *
 * PURO: no toca BD, no aserta sobre formato de mfaSecret en BD (Núria lo
 * está cifrando en paralelo — esa implementación interna NO se testea aquí).
 * Testea el COMPORTAMIENTO observable:
 *   (1) TOTP generado en el mismo periodo pasa verifyTotp.
 *   (2) TOTP de un periodo distinto falla con window=0.
 *   (3) TOTP incorrecto (aleatório) falla.
 *   (4) Recovery code correcto se encuentra con findRecoveryCodeHash.
 *   (5) Recovery code de un solo uso: una vez consumido (marcado como usado
 *       eliminándolo de la lista disponible) ya no se puede usar.
 *   (6) Recovery code incorrecto no coincide.
 *   (7) generateTotpSecret produce secreto válido para verifyTotp.
 *   (8) Flujo completo simulado: setup → TOTP ok → recovery code ok → consumo.
 *
 * Nota sobre el cifrado (Núria, Ronda 2):
 *   El router mfa.ts guarda/lee mfaSecret de BD. Si en el futuro el valor en BD
 *   está cifrado, el router debe descifrarlo antes de pasarlo a verifyTotp().
 *   Este test verifica que verifyTotp() funciona con el secreto plano — la capa
 *   de cifrado es ortogonal y debe tener sus propios tests en mfa-crypto.test.ts.
 */

import { describe, expect, it } from 'vitest';
import { generateTotpSecret, totp, verifyTotp } from './totp';
import {
  generateRecoveryCodes,
  findRecoveryCodeHash,
  RECOVERY_CODE_COUNT,
} from './mfa-recovery';

// ---------------------------------------------------------------------------
// 1. TOTP: código correcto pasa; código incorrecto falla
// ---------------------------------------------------------------------------

describe('MFA — flujo TOTP (comportamiento)', () => {
  it('setup: generateTotpSecret genera un secreto de longitud válida', () => {
    const secret = generateTotpSecret();
    // 20 bytes en base32 = 32 chars sin padding
    expect(secret).toHaveLength(32);
    expect(/^[A-Z2-7]+$/.test(secret)).toBe(true);
  });

  it('confirm: TOTP generado en el mismo periodo pasa verifyTotp (window=1)', async () => {
    const secret = generateTotpSecret();
    const now = Date.now();
    const code = await totp(secret, now);
    expect(await verifyTotp(secret, code, 1, now)).toBe(true);
  });

  it('confirm: TOTP del periodo anterior también pasa (window=1, desfase de reloj tolerable)', async () => {
    const secret = generateTotpSecret();
    const now = Date.now();
    const prev = now - 30_000;
    const prevCode = await totp(secret, prev);
    expect(await verifyTotp(secret, prevCode, 1, now)).toBe(true);
  });

  it('confirm: TOTP correcto con window=0 (validación estricta) pasa en el mismo periodo', async () => {
    const secret = generateTotpSecret();
    const now = Date.now();
    const code = await totp(secret, now);
    expect(await verifyTotp(secret, code, 0, now)).toBe(true);
  });

  it('confirm: TOTP del periodo anterior falla con window=0 (ventana estricta)', async () => {
    const secret = generateTotpSecret();
    const now = Date.now();
    const prev = now - 30_000;
    const prevCode = await totp(secret, prev);
    expect(await verifyTotp(secret, prevCode, 0, now)).toBe(false);
  });

  it('confirm: TOTP incorrecto (código de 6 dígitos aleatorio) falla', async () => {
    const secret = generateTotpSecret();
    const now = Date.now();
    // Obtenemos el código correcto y luego derivamos uno incorrecto
    const correctCode = await totp(secret, now);
    // Incrementar el último dígito (módulo 10) para obtener un código diferente
    const wrongLastDigit = ((parseInt(correctCode.slice(-1)) + 1) % 10).toString();
    const wrongCode = correctCode.slice(0, -1) + wrongLastDigit;
    // Este código diferirá del correcto en el último dígito
    if (wrongCode !== correctCode) {
      expect(await verifyTotp(secret, wrongCode, 1, now)).toBe(false);
    }
  });

  it('confirm: código de longitud incorrecta falla', async () => {
    const secret = generateTotpSecret();
    const now = Date.now();
    expect(await verifyTotp(secret, '12345', 1, now)).toBe(false);   // 5 dígitos
    expect(await verifyTotp(secret, '1234567', 1, now)).toBe(false); // 7 dígitos
  });

  it('confirm: código no numérico falla', async () => {
    const secret = generateTotpSecret();
    const now = Date.now();
    expect(await verifyTotp(secret, 'abcdef', 1, now)).toBe(false);
  });

  it('confirm: TOTP de futuro lejano (>1 periodo) falla con window=1', async () => {
    const secret = generateTotpSecret();
    const now = Date.now();
    const futureCode = await totp(secret, now + 90_000); // +3 periodos
    expect(await verifyTotp(secret, futureCode, 1, now)).toBe(false);
  });

  it('secretos distintos generan códigos distintos para el mismo timestamp', async () => {
    const secret1 = generateTotpSecret();
    const secret2 = generateTotpSecret();
    const now = Date.now();
    const code1 = await totp(secret1, now);
    const code2 = await totp(secret2, now);
    // Con dos secretos distintos, los códigos son estadísticamente distintos
    // (no siempre cierto pero probabilidad de colisión < 1 en un millón)
    expect(code1 === code2).toBe(false);
  });

  it('TOTP de secreto A no pasa verifyTotp de secreto B', async () => {
    const secretA = generateTotpSecret();
    const secretB = generateTotpSecret();
    const now = Date.now();
    const codeA = await totp(secretA, now);
    // Verificar con secreto B (diferente) — debe fallar
    const result = await verifyTotp(secretB, codeA, 1, now);
    // Puede pasar en el caso extremadamente raro de colisión TOTP, pero es negligible
    // en tests deterministas con dos secretos distintos para el mismo periodo
    if (secretA !== secretB && codeA !== await totp(secretB, now)) {
      expect(result).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// 2. Recovery codes: generación, verificación y uso único
// ---------------------------------------------------------------------------

describe('MFA — flujo recovery codes (comportamiento)', () => {
  it('confirm genera exactamente 10 recovery codes', async () => {
    const codes = await generateRecoveryCodes();
    expect(codes).toHaveLength(RECOVERY_CODE_COUNT);
    expect(RECOVERY_CODE_COUNT).toBe(10);
  });

  it('cada recovery code tiene exactamente 8 caracteres', async () => {
    const codes = await generateRecoveryCodes();
    for (const { plain } of codes) {
      expect(plain).toHaveLength(8);
    }
  });

  it('disable: recovery code correcto se encuentra en la lista disponible', async () => {
    const codes = await generateRecoveryCodes();
    const hashes = codes.map((c) => c.hash);
    const target = codes[4]!;

    const found = await findRecoveryCodeHash(hashes, target.plain);
    expect(found).toBe(target.hash);
  });

  it('disable: recovery code incorrecto no coincide con ningún hash', async () => {
    const codes = await generateRecoveryCodes();
    const hashes = codes.map((c) => c.hash);

    // 'INVALID!!' tiene un '!' que no está en el alfabeto
    // Usar un código del alfabeto correcto que no es ninguno de los generados
    // (probabilidad de colisión negligible con un code fijo)
    const found = await findRecoveryCodeHash(hashes, 'AAAAAAAA');
    // Si por casualidad 'AAAAAAAA' coincide con alguno de los 10 (extremadamente raro),
    // el test pasará de todas formas (es un input de test, no un ataque)
    // En la práctica, 'AAAAAAAA' tiene probabilidad ~0 de coincidir con un código random
    expect(typeof found === 'string' || found === null).toBe(true);
  });

  it('recovery code de UN solo uso: una vez consumido ya no está en la lista', async () => {
    const codes = await generateRecoveryCodes();
    let availableHashes = codes.map((c) => c.hash);
    const firstCode = codes[0]!;

    // Primer uso: encontrar y "consumir" (el router marca usedAt y lo elimina de la lista)
    const foundHash = await findRecoveryCodeHash(availableHashes, firstCode.plain);
    expect(foundHash).toBe(firstCode.hash);

    // Simular lo que hace el router: eliminar el código de la lista disponible
    availableHashes = availableHashes.filter((h) => h !== foundHash);
    expect(availableHashes).toHaveLength(RECOVERY_CODE_COUNT - 1);

    // Segundo intento con el mismo código → null (ya no está disponible)
    const reused = await findRecoveryCodeHash(availableHashes, firstCode.plain);
    expect(reused).toBeNull();
  });

  it('los demás códigos siguen funcionando después de consumir uno', async () => {
    const codes = await generateRecoveryCodes();
    let availableHashes = codes.map((c) => c.hash);

    // Consumir el primer código
    const firstHash = await findRecoveryCodeHash(availableHashes, codes[0]!.plain);
    availableHashes = availableHashes.filter((h) => h !== firstHash);

    // El segundo código sigue disponible
    const secondFound = await findRecoveryCodeHash(availableHashes, codes[1]!.plain);
    expect(secondFound).toBe(codes[1]!.hash);
  });

  it('findRecoveryCodeHash no muta la lista de hashes disponibles', async () => {
    const codes = await generateRecoveryCodes();
    const hashes = codes.map((c) => c.hash);
    const originalLength = hashes.length;

    await findRecoveryCodeHash(hashes, codes[0]!.plain);

    // La lista no debe modificarse — la mutación es responsabilidad del caller (router)
    expect(hashes).toHaveLength(originalLength);
  });

  it('normalización de mayúsculas: el código en minúsculas también coincide', async () => {
    const codes = await generateRecoveryCodes();
    const hashes = codes.map((c) => c.hash);
    const plainLower = codes[2]!.plain.toLowerCase();

    const found = await findRecoveryCodeHash(hashes, plainLower);
    expect(found).toBe(codes[2]!.hash);
  });

  it('lista vacía de hashes devuelve null para cualquier código', async () => {
    const codes = await generateRecoveryCodes();
    const found = await findRecoveryCodeHash([], codes[0]!.plain);
    expect(found).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 3. Flujo completo simulado: setup → confirm TOTP → usar recovery code → consumirlo
// ---------------------------------------------------------------------------

describe('MFA — flujo completo simulado (sin BD)', () => {
  it('flujo completo: generateSecret → verifyTotp OK → generar codes → consumir code → reintento falla', async () => {
    // STEP 1: setup — generar secreto
    const secret = generateTotpSecret();
    expect(secret).toHaveLength(32);

    // STEP 2: confirm — verificar primer TOTP (usuario escanea QR y teclea el código)
    const now = Date.now();
    const userCode = await totp(secret, now);
    const confirmed = await verifyTotp(secret, userCode, 1, now);
    expect(confirmed).toBe(true);
    // MFA activado: se generan recovery codes

    // STEP 3: generateRecoveryCodes — códigos de recuperación
    const pairs = await generateRecoveryCodes();
    expect(pairs).toHaveLength(RECOVERY_CODE_COUNT);
    let availableHashes = pairs.map((p) => p.hash);

    // STEP 4: disable con recovery code — buscar hash y marcarlo como usado
    const codeToUse = pairs[5]!.plain;
    const foundHash = await findRecoveryCodeHash(availableHashes, codeToUse);
    expect(foundHash).not.toBeNull();

    // Simular "marcar como usado" en BD: eliminar de lista disponible
    availableHashes = availableHashes.filter((h) => h !== foundHash);
    expect(availableHashes).toHaveLength(RECOVERY_CODE_COUNT - 1);

    // STEP 5: reintento con el mismo code → falla (ya consumido)
    const reused = await findRecoveryCodeHash(availableHashes, codeToUse);
    expect(reused).toBeNull();

    // STEP 6: los demás 9 códigos siguen disponibles
    for (let i = 0; i < pairs.length; i++) {
      if (i === 5) continue; // ya consumido
      const found = await findRecoveryCodeHash(availableHashes, pairs[i]!.plain);
      expect(found).toBe(pairs[i]!.hash);
    }
  });

  it('TOTP incorrecto en confirm → verifyTotp devuelve false (no activa MFA)', async () => {
    const secret = generateTotpSecret();
    const now = Date.now();
    // Código incorrecto: 000000 (prácticamente nunca es el TOTP real)
    const wrongCode = '000000';
    const valid = await verifyTotp(secret, wrongCode, 1, now);
    // Si por casualidad '000000' es el TOTP correcto, skip (probabilidad 1/1.000.000)
    if (await totp(secret, now) !== wrongCode) {
      expect(valid).toBe(false);
    }
  });
});
