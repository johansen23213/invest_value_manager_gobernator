import { describe, expect, it } from 'vitest';
import { hasPermission } from './rbac';

describe('hasPermission', () => {
  it('SUPERADMIN tiene todos los permisos', () => {
    expect(hasPermission('SUPERADMIN', 'tenant:manage')).toBe(true);
    expect(hasPermission('SUPERADMIN', 'users:write')).toBe(true);
  });

  it('DIRECTOR puede gestionar usuarios pero no la plataforma', () => {
    expect(hasPermission('DIRECTOR', 'users:write')).toBe(true);
    expect(hasPermission('DIRECTOR', 'tenant:manage')).toBe(false);
  });

  it('SANITARIO puede leer usuarios pero no escribirlos', () => {
    expect(hasPermission('SANITARIO', 'users:read')).toBe(true);
    expect(hasPermission('SANITARIO', 'users:write')).toBe(false);
  });

  it('AUXILIAR y FAMILIAR no pueden leer el listado de usuarios', () => {
    expect(hasPermission('AUXILIAR', 'users:read')).toBe(false);
    expect(hasPermission('FAMILIAR', 'users:read')).toBe(false);
  });

  it('todos los roles pueden leer su tenant', () => {
    for (const role of ['SUPERADMIN', 'DIRECTOR', 'SANITARIO', 'AUXILIAR', 'FAMILIAR'] as const) {
      expect(hasPermission(role, 'tenant:read')).toBe(true);
    }
  });
});
