/**
 * Tests unitarios para lib/mfa-recovery.ts — recovery codes de MFA.
 * hashRecoveryCode/generateRecoveryCodes/findRecoveryCodeHash son asíncronos
 * (Web Crypto isomórfico).
 */

import { describe, expect, it } from 'vitest';
import {
  findRecoveryCodeHash,
  generateRecoveryCodes,
  hashRecoveryCode,
  RECOVERY_CODE_COUNT,
} from './mfa-recovery';

describe('hashRecoveryCode', () => {
  it('produce un hash hex de 64 chars (SHA-256)', async () => {
    const hash = await hashRecoveryCode('ABCDEF12');
    expect(hash).toHaveLength(64);
    expect(/^[0-9a-f]{64}$/.test(hash)).toBe(true);
  });

  it('es determinista: mismo input → mismo hash', async () => {
    const code = 'XYZABC99';
    expect(await hashRecoveryCode(code)).toBe(await hashRecoveryCode(code));
  });

  it('normaliza a mayúsculas (case insensitive)', async () => {
    expect(await hashRecoveryCode('abcdef12')).toBe(await hashRecoveryCode('ABCDEF12'));
  });

  it('hashes distintos para códigos distintos', async () => {
    const h1 = await hashRecoveryCode('AAAAAAAA');
    const h2 = await hashRecoveryCode('AAAAAAAB');
    expect(h1).not.toBe(h2);
  });
});

describe('generateRecoveryCodes', () => {
  it(`genera exactamente ${RECOVERY_CODE_COUNT} códigos`, async () => {
    const codes = await generateRecoveryCodes();
    expect(codes).toHaveLength(RECOVERY_CODE_COUNT);
  });

  it('todos los códigos tienen exactamente 8 caracteres', async () => {
    const codes = await generateRecoveryCodes();
    for (const { plain } of codes) {
      expect(plain).toHaveLength(8);
    }
  });

  it('todos los códigos son alfanuméricos sin caracteres ambiguos (0,1,O,I,l)', async () => {
    const codes = await generateRecoveryCodes();
    // El alfabeto no incluye 0, 1, O, I, L (para evitar confusión visual).
    const ambiguous = /[01OILl]/;
    for (const { plain } of codes) {
      expect(ambiguous.test(plain), `Código con carácter ambiguo: ${plain}`).toBe(false);
    }
  });

  it('cada par (plain, hash) tiene el hash correcto', async () => {
    const codes = await generateRecoveryCodes();
    for (const { plain, hash } of codes) {
      expect(await hashRecoveryCode(plain)).toBe(hash);
    }
  });

  it('genera códigos distintos en cada llamada (unicidad)', async () => {
    const codes1 = (await generateRecoveryCodes()).map((c) => c.plain);
    const codes2 = (await generateRecoveryCodes()).map((c) => c.plain);
    // Probabilidad de colisión: (10 × 30^8)^(-1) ≈ negligible.
    const overlap = codes1.filter((c) => codes2.includes(c));
    expect(overlap).toHaveLength(0);
  });

  it('dentro de un mismo batch los hashes son únicos', async () => {
    const codes = await generateRecoveryCodes();
    const hashes = codes.map((c) => c.hash);
    const uniqueHashes = new Set(hashes);
    expect(uniqueHashes.size).toBe(RECOVERY_CODE_COUNT);
  });
});

describe('findRecoveryCodeHash', () => {
  it('encuentra el hash correcto si el código existe', async () => {
    const codes = await generateRecoveryCodes();
    const hashes = codes.map((c) => c.hash);
    const targetCode = codes[3]!.plain;
    const targetHash = codes[3]!.hash;

    const found = await findRecoveryCodeHash(hashes, targetCode);
    expect(found).toBe(targetHash);
  });

  it('devuelve null si el código no existe', async () => {
    const codes = await generateRecoveryCodes();
    const hashes = codes.map((c) => c.hash);
    // 'XXXXXXXX' casi con certeza no coincide con ninguno de los 10
    const found = await findRecoveryCodeHash(hashes, 'XXXXXXXX');
    expect(found).toBeNull();
  });

  it('devuelve null si la lista de hashes está vacía', async () => {
    const found = await findRecoveryCodeHash([], 'ABCDEFGH');
    expect(found).toBeNull();
  });

  it('es case-insensitive (normaliza el input)', async () => {
    const codes = await generateRecoveryCodes();
    const hashes = codes.map((c) => c.hash);
    const plain = codes[0]!.plain.toLowerCase();
    // El hash se busca contra el hash del plain normalizado
    const found = await findRecoveryCodeHash(hashes, plain);
    expect(found).toBe(codes[0]!.hash);
  });

  it('no mutar la lista de hashes disponibles', async () => {
    const codes = await generateRecoveryCodes();
    const hashes = codes.map((c) => c.hash);
    const originalLength = hashes.length;
    await findRecoveryCodeHash(hashes, codes[0]!.plain);
    // La lista no debe modificarse (el llamante marca como usado en BD)
    expect(hashes).toHaveLength(originalLength);
  });
});

describe('flujo completo: setup → consumo → agotamiento', () => {
  it('un código consumido ya no debe encontrarse en la lista restante', async () => {
    const codes = await generateRecoveryCodes();
    let availableHashes = codes.map((c) => c.hash);

    // Consume el primer código
    const usedHash = await findRecoveryCodeHash(availableHashes, codes[0]!.plain);
    expect(usedHash).not.toBeNull();

    // Simula lo que haría el router: eliminar el hash usado de la lista disponible
    availableHashes = availableHashes.filter((h) => h !== usedHash);

    // Intentar usarlo de nuevo → null (ya no está en la lista)
    const reused = await findRecoveryCodeHash(availableHashes, codes[0]!.plain);
    expect(reused).toBeNull();
  });
});
