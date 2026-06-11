/**
 * Verifica que todas las claves de permiso del sistema tienen traducción
 * en el diccionario i18n (R-02: tarjetas de rol legibles).
 *
 * Si un permiso nuevo se añade a rbac.ts sin añadir su etiqueta en
 * dictionaries.ts, este test falla, alertando al desarrollador.
 */
import { describe, expect, it } from 'vitest';
import { PERMISSIONS, permissionsFor } from './rbac';
import { translate } from '@/i18n/dictionaries';

describe('etiquetas i18n de permisos (R-02)', () => {
  it('todos los permisos tienen traducción en es-ES', () => {
    for (const perm of PERMISSIONS) {
      const key = `rbac.perm.${perm}`;
      const label = translate('es', key);
      // Si la clave no existe, translate devuelve la propia clave.
      expect(label, `Falta etiqueta es para permiso "${perm}"`).not.toBe(key);
    }
  });

  it('todos los permisos tienen traducción en ca-ES', () => {
    for (const perm of PERMISSIONS) {
      const key = `rbac.perm.${perm}`;
      const label = translate('ca', key);
      expect(label, `Falta etiqueta ca para permiso "${perm}"`).not.toBe(key);
    }
  });

  it('permissionsFor devuelve lista no vacía para todos los roles operativos', () => {
    const roles = ['DIRECTOR', 'SANITARIO', 'AUXILIAR', 'FAMILIAR'] as const;
    for (const role of roles) {
      expect(permissionsFor(role).length, `${role} sin permisos`).toBeGreaterThan(0);
    }
  });

  it('DIRECTOR tiene users:write; AUXILIAR no', () => {
    expect(permissionsFor('DIRECTOR').includes('users:write')).toBe(true);
    expect(permissionsFor('AUXILIAR').includes('users:write')).toBe(false);
  });

  it('FAMILIAR solo tiene 2 permisos (portal:read + tenant:read)', () => {
    const perms = permissionsFor('FAMILIAR');
    expect(perms).toHaveLength(2);
    expect(perms.includes('tenant:read')).toBe(true);
    expect(perms.includes('portal:read')).toBe(true);
  });
});
