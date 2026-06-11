// Tokens de cuenta (reset de contraseña / invitación). Infraestructura de auth
// cross-tenant: se opera con el cliente de plataforma. Se guarda el HASH del
// token; el valor en claro solo viaja en el enlace que recibe el usuario.

import { asPlatformAdmin, type AuthTokenType } from '@vetlla/db';

const authDb = asPlatformAdmin();

/** SHA-256 hex isomórfico (Web Crypto; sin node:crypto para no romper el bundle). */
async function sha256Hex(input: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(input),
  );
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** 256 bits de aleatoriedad criptográfica en hex (el secreto del enlace). */
function randomToken(): string {
  const bytes = new Uint8Array(32);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

const DEFAULT_TTL_MS = { PASSWORD_RESET: 60 * 60 * 1000, INVITATION: 7 * 24 * 60 * 60 * 1000 };

/**
 * Crea un token y devuelve su valor en claro (para el enlace). Invalida los
 * tokens previos del mismo usuario y tipo aún sin usar (un enlace vigente a la vez).
 */
export async function createAuthToken(userId: string, type: AuthTokenType): Promise<string> {
  await authDb.authToken.updateMany({
    where: { userId, type, usedAt: null },
    data: { usedAt: new Date() },
  });
  const token = randomToken();
  const tokenHash = await sha256Hex(token);
  await authDb.authToken.create({
    data: {
      userId,
      tokenHash,
      type,
      expiresAt: new Date(Date.now() + DEFAULT_TTL_MS[type]),
    },
  });
  return token;
}

export interface ConsumedToken {
  userId: string;
}

/**
 * Valida y consume un token (un solo uso). Devuelve el userId si es válido,
 * vigente y del tipo esperado; null en cualquier otro caso (sin filtrar el motivo).
 */
export async function consumeAuthToken(
  token: string,
  type: AuthTokenType,
): Promise<ConsumedToken | null> {
  const tokenHash = await sha256Hex(token);
  const row = await authDb.authToken.findUnique({ where: { tokenHash } });
  if (!row || row.type !== type || row.usedAt || row.expiresAt.getTime() < Date.now()) {
    return null;
  }
  await authDb.authToken.update({ where: { id: row.id }, data: { usedAt: new Date() } });
  return { userId: row.userId };
}
