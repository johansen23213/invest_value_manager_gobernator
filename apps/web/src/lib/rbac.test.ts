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

  it('solo sanitarios y dirección registran datos clínicos', () => {
    expect(hasPermission('SANITARIO', 'clinical:write')).toBe(true);
    expect(hasPermission('DIRECTOR', 'clinical:write')).toBe(true);
    expect(hasPermission('AUXILIAR', 'clinical:write')).toBe(false);
  });

  it('dirección gestiona centros; el auxiliar solo los lee', () => {
    expect(hasPermission('DIRECTOR', 'centers:write')).toBe(true);
    expect(hasPermission('AUXILIAR', 'centers:write')).toBe(false);
    expect(hasPermission('AUXILIAR', 'centers:read')).toBe(true);
  });

  it('el familiar no accede al listado general de residentes', () => {
    expect(hasPermission('FAMILIAR', 'residents:read')).toBe(false);
  });

  it('el auxiliar registra atención directa', () => {
    expect(hasPermission('AUXILIAR', 'care:write')).toBe(true);
    expect(hasPermission('AUXILIAR', 'care:read')).toBe(true);
  });

  it('el auxiliar administra medicación pero no prescribe', () => {
    expect(hasPermission('AUXILIAR', 'medication:administer')).toBe(true);
    expect(hasPermission('AUXILIAR', 'medication:prescribe')).toBe(false);
  });

  it('solo sanitario y dirección prescriben y editan el PIA', () => {
    expect(hasPermission('SANITARIO', 'medication:prescribe')).toBe(true);
    expect(hasPermission('SANITARIO', 'careplan:write')).toBe(true);
    expect(hasPermission('DIRECTOR', 'careplan:write')).toBe(true);
    expect(hasPermission('AUXILIAR', 'careplan:write')).toBe(false);
  });
});
