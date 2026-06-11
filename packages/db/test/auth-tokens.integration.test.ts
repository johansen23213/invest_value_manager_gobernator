import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { asPlatformAdmin, prisma } from '../src/index';

// Integración de la tabla auth_tokens (reset/invitación): un solo uso, unicidad
// del hash y cascada al borrar el usuario. La lógica de hash/consumo vive en la
// app; aquí se verifica el contrato de datos que sostiene ese flujo.
const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)('auth_tokens — contrato de datos', () => {
  const admin = asPlatformAdmin();
  const stamp = Date.now();
  let tenantId = '';
  let userId = '';

  beforeAll(async () => {
    const tenant = await admin.tenant.create({ data: { name: 'Tok T', slug: `tok-${stamp}` } });
    tenantId = tenant.id;
    const user = await admin.user.create({
      data: { email: `tok-${stamp}@x.dev`, passwordHash: 'x', role: 'DIRECTOR', tenantId },
    });
    userId = user.id;
  });

  afterAll(async () => {
    await admin.tenant.deleteMany({ where: { id: tenantId } });
    await prisma.$disconnect();
  });

  it('el hash del token es único', async () => {
    await admin.authToken.create({
      data: { userId, tokenHash: `h-${stamp}`, type: 'PASSWORD_RESET', expiresAt: new Date(Date.now() + 1000) },
    });
    await expect(
      admin.authToken.create({
        data: { userId, tokenHash: `h-${stamp}`, type: 'PASSWORD_RESET', expiresAt: new Date() },
      }),
    ).rejects.toThrow();
  });

  it('marcar usado deja constancia (un solo uso a nivel de datos)', async () => {
    const tok = await admin.authToken.create({
      data: { userId, tokenHash: `u-${stamp}`, type: 'INVITATION', expiresAt: new Date(Date.now() + 1000) },
    });
    const used = await admin.authToken.update({
      where: { id: tok.id },
      data: { usedAt: new Date() },
    });
    expect(used.usedAt).not.toBeNull();
  });

  it('al borrar el usuario, sus tokens caen (cascade)', async () => {
    const u = await admin.user.create({
      data: { email: `tok2-${stamp}@x.dev`, passwordHash: 'x', role: 'AUXILIAR', tenantId },
    });
    await admin.authToken.create({
      data: { userId: u.id, tokenHash: `c-${stamp}`, type: 'PASSWORD_RESET', expiresAt: new Date(Date.now() + 1000) },
    });
    await admin.user.delete({ where: { id: u.id } });
    const left = await admin.authToken.findMany({ where: { userId: u.id } });
    expect(left).toHaveLength(0);
  });
});
