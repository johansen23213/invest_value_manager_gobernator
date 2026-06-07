import { describe, expect, it } from 'vitest';
import { UserRole } from '@prisma/client';

// Verifica que el cliente Prisma está generado y expone los roles esperados.
describe('UserRole', () => {
  it('incluye los cinco roles del sistema', () => {
    expect(Object.values(UserRole).sort()).toEqual(
      ['AUXILIAR', 'DIRECTOR', 'FAMILIAR', 'SANITARIO', 'SUPERADMIN'].sort(),
    );
  });
});
