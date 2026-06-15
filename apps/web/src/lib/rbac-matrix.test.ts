/**
 * Matriz RBAC completa — tests exhaustivos rol×permiso.
 *
 * Objetivo: bloquear cambios accidentales en la política de permisos.
 * Cada combinación rol×permiso queda asercionada como allow o deny explícito.
 *
 * Si se detecta una incoherencia real con la intención documentada en rbac.ts
 * (comentarios "Matriz RBAC de ..."), se reporta sin modificar la política.
 *
 * PURO: sin BD, sin mocks, sin imports externos a @vetlla/db. Ejecutable siempre.
 */

import { describe, expect, it } from 'vitest';
import { hasPermission, permissionsFor, PERMISSIONS } from './rbac';
import type { Permission } from './rbac';

// Todos los roles del sistema
const ALL_ROLES = ['SUPERADMIN', 'DIRECTOR', 'SANITARIO', 'AUXILIAR', 'FAMILIAR'] as const;
type Role = (typeof ALL_ROLES)[number];

// ---------------------------------------------------------------------------
// Helper: asiert allow/deny con mensaje claro en caso de fallo
// ---------------------------------------------------------------------------
function assertAllow(role: Role, perm: Permission) {
  expect(
    hasPermission(role, perm),
    `EXPECTED ALLOW: ${role} debería tener '${perm}'`,
  ).toBe(true);
}

function assertDeny(role: Role, perm: Permission) {
  expect(
    hasPermission(role, perm),
    `EXPECTED DENY: ${role} NO debería tener '${perm}'`,
  ).toBe(false);
}

// ---------------------------------------------------------------------------
// 1. SUPERADMIN — tiene todos los permisos sin excepción
// ---------------------------------------------------------------------------

describe('SUPERADMIN — tiene todos los permisos del sistema', () => {
  for (const perm of PERMISSIONS) {
    it(`tiene '${perm}'`, () => {
      assertAllow('SUPERADMIN', perm);
    });
  }

  it('permissionsFor(SUPERADMIN) tiene exactamente los mismos que PERMISSIONS', () => {
    const perms = permissionsFor('SUPERADMIN');
    expect(perms.length).toBe(PERMISSIONS.length);
    for (const p of PERMISSIONS) {
      expect(perms).toContain(p);
    }
  });
});

// ---------------------------------------------------------------------------
// 2. DIRECTOR — casi todos, excepto tenant:manage y portal:read
// ---------------------------------------------------------------------------

describe('DIRECTOR — permisos de gestión del centro', () => {
  // Permisos que tiene
  const allowed: Permission[] = [
    'tenant:read',
    'users:read',
    'users:write',
    'centers:read',
    'centers:write',
    'residents:read',
    'residents:write',
    'clinical:write',
    'care:read',
    'care:write',
    'medication:read',
    'medication:prescribe',
    'medication:administer',
    'careplan:read',
    'careplan:write',
    'audit:read',
    'dsar:manage',
    'conflicts:review',
    'requests:manage',
    'comms:read',
    'comms:broadcast',
    'visits:manage',
    'shifts:read',
    'shifts:manage',
    'billing:read',
    'billing:manage',
    'admissions:read',
    'admissions:manage',
    'activities:read',
    'activities:manage',
    'quality:read',
    'inventory:read',
    'inventory:manage',
  ];

  // Permisos que NO tiene
  const denied: Permission[] = [
    'tenant:manage',   // gestión de plataforma: solo SUPERADMIN
    'portal:read',     // portal de familias: solo FAMILIAR
    'requests:create', // el familiar crea solicitudes; el director las gestiona (requests:manage)
    'visits:request',  // el familiar solicita visitas; el director las gestiona (visits:manage)
  ];

  for (const perm of allowed) {
    it(`tiene '${perm}'`, () => assertAllow('DIRECTOR', perm));
  }

  for (const perm of denied) {
    it(`NO tiene '${perm}'`, () => assertDeny('DIRECTOR', perm));
  }
});

// ---------------------------------------------------------------------------
// 3. SANITARIO — clínico con acceso de lectura en módulos nuevos
// ---------------------------------------------------------------------------

describe('SANITARIO — permisos clínicos y de consulta', () => {
  const allowed: Permission[] = [
    'tenant:read',
    'users:read',
    'centers:read',
    'residents:read',
    'residents:write',
    'clinical:write',
    'care:read',
    'care:write',
    'medication:read',
    'medication:prescribe',
    'medication:administer',
    'careplan:read',
    'careplan:write',
    'conflicts:review',
    'requests:manage',
    'comms:read',
    'visits:manage',
    'shifts:read',
    'admissions:read',
    'activities:read',
    'quality:read',
    'inventory:read',
  ];

  const denied: Permission[] = [
    'tenant:manage',
    'users:write',
    'centers:write',
    'audit:read',
    'dsar:manage',
    'comms:broadcast',
    'shifts:manage',
    'billing:read',
    'billing:manage',
    'admissions:manage',
    'activities:manage',
    'inventory:manage',
    'portal:read',
    'requests:create',
    'visits:request',
  ];

  for (const perm of allowed) {
    it(`tiene '${perm}'`, () => assertAllow('SANITARIO', perm));
  }

  for (const perm of denied) {
    it(`NO tiene '${perm}'`, () => assertDeny('SANITARIO', perm));
  }
});

// ---------------------------------------------------------------------------
// 4. AUXILIAR — atención directa, actividades, inventario; sin clínica ni gestión
// ---------------------------------------------------------------------------

describe('AUXILIAR — permisos operativos de atención directa', () => {
  const allowed: Permission[] = [
    'tenant:read',
    'centers:read',
    'residents:read',
    'care:read',
    'care:write',
    'medication:read',
    'medication:administer',
    'careplan:read',
    'requests:manage',
    'comms:read',
    'visits:manage',
    'shifts:read',
    'activities:read',
    'activities:manage',
    'inventory:read',
    'inventory:manage',
  ];

  const denied: Permission[] = [
    'tenant:manage',
    'users:read',
    'users:write',
    'centers:write',
    'residents:write',
    'clinical:write',
    'medication:prescribe',
    'careplan:write',
    'audit:read',
    'dsar:manage',
    'conflicts:review',
    'comms:broadcast',
    'shifts:manage',
    'billing:read',
    'billing:manage',
    'admissions:read',
    'admissions:manage',
    'quality:read',
    'portal:read',
    'requests:create',
    'visits:request',
  ];

  for (const perm of allowed) {
    it(`tiene '${perm}'`, () => assertAllow('AUXILIAR', perm));
  }

  for (const perm of denied) {
    it(`NO tiene '${perm}'`, () => assertDeny('AUXILIAR', perm));
  }
});

// ---------------------------------------------------------------------------
// 5. FAMILIAR — solo portal, solicitudes y visitas propias
// ---------------------------------------------------------------------------

describe('FAMILIAR — permisos del portal de familias', () => {
  const allowed: Permission[] = [
    'tenant:read',
    'portal:read',
    'requests:create',
    'comms:read',
    'visits:request',
  ];

  // El FAMILIAR no tiene acceso a ningún dato del centro (clínico, gestión, etc.)
  const denied: Permission[] = [
    'tenant:manage',
    'users:read',
    'users:write',
    'centers:read',
    'centers:write',
    'residents:read',
    'residents:write',
    'clinical:write',
    'care:read',
    'care:write',
    'medication:read',
    'medication:prescribe',
    'medication:administer',
    'careplan:read',
    'careplan:write',
    'audit:read',
    'dsar:manage',
    'conflicts:review',
    'requests:manage',
    'comms:broadcast',
    'visits:manage',
    'shifts:read',
    'shifts:manage',
    'billing:read',
    'billing:manage',
    'admissions:read',
    'admissions:manage',
    'activities:read',
    'activities:manage',
    'quality:read',
    'inventory:read',
    'inventory:manage',
  ];

  for (const perm of allowed) {
    it(`tiene '${perm}'`, () => assertAllow('FAMILIAR', perm));
  }

  for (const perm of denied) {
    it(`NO tiene '${perm}'`, () => assertDeny('FAMILIAR', perm));
  }
});

// ---------------------------------------------------------------------------
// 6. Invariantes de seguridad críticos (checks transversales)
// ---------------------------------------------------------------------------

describe('Invariantes de seguridad transversales', () => {
  it('solo SUPERADMIN tiene tenant:manage', () => {
    assertAllow('SUPERADMIN', 'tenant:manage');
    for (const role of ['DIRECTOR', 'SANITARIO', 'AUXILIAR', 'FAMILIAR'] as const) {
      assertDeny(role, 'tenant:manage');
    }
  });

  it('solo DIRECTOR y SUPERADMIN tienen audit:read', () => {
    assertAllow('SUPERADMIN', 'audit:read');
    assertAllow('DIRECTOR', 'audit:read');
    assertDeny('SANITARIO', 'audit:read');
    assertDeny('AUXILIAR', 'audit:read');
    assertDeny('FAMILIAR', 'audit:read');
  });

  it('solo DIRECTOR y SUPERADMIN tienen dsar:manage', () => {
    assertAllow('SUPERADMIN', 'dsar:manage');
    assertAllow('DIRECTOR', 'dsar:manage');
    assertDeny('SANITARIO', 'dsar:manage');
    assertDeny('AUXILIAR', 'dsar:manage');
    assertDeny('FAMILIAR', 'dsar:manage');
  });

  it('solo DIRECTOR y SUPERADMIN tienen billing:manage', () => {
    assertAllow('SUPERADMIN', 'billing:manage');
    assertAllow('DIRECTOR', 'billing:manage');
    assertDeny('SANITARIO', 'billing:manage');
    assertDeny('AUXILIAR', 'billing:manage');
    assertDeny('FAMILIAR', 'billing:manage');
  });

  it('solo DIRECTOR y SUPERADMIN tienen billing:read', () => {
    assertAllow('SUPERADMIN', 'billing:read');
    assertAllow('DIRECTOR', 'billing:read');
    assertDeny('SANITARIO', 'billing:read');
    assertDeny('AUXILIAR', 'billing:read');
    assertDeny('FAMILIAR', 'billing:read');
  });

  it('solo DIRECTOR y SUPERADMIN tienen admissions:manage', () => {
    assertAllow('SUPERADMIN', 'admissions:manage');
    assertAllow('DIRECTOR', 'admissions:manage');
    assertDeny('SANITARIO', 'admissions:manage');
    assertDeny('AUXILIAR', 'admissions:manage');
    assertDeny('FAMILIAR', 'admissions:manage');
  });

  it('AUXILIAR y FAMILIAR no tienen admissions:read', () => {
    assertDeny('AUXILIAR', 'admissions:read');
    assertDeny('FAMILIAR', 'admissions:read');
  });

  it('solo DIRECTOR y SUPERADMIN tienen shifts:manage', () => {
    assertAllow('SUPERADMIN', 'shifts:manage');
    assertAllow('DIRECTOR', 'shifts:manage');
    assertDeny('SANITARIO', 'shifts:manage');
    assertDeny('AUXILIAR', 'shifts:manage');
    assertDeny('FAMILIAR', 'shifts:manage');
  });

  it('FAMILIAR no tiene shifts:read', () => {
    assertDeny('FAMILIAR', 'shifts:read');
  });

  it('solo SUPERADMIN, DIRECTOR y AUXILIAR tienen activities:manage', () => {
    assertAllow('SUPERADMIN', 'activities:manage');
    assertAllow('DIRECTOR', 'activities:manage');
    assertAllow('AUXILIAR', 'activities:manage');
    assertDeny('SANITARIO', 'activities:manage');
    assertDeny('FAMILIAR', 'activities:manage');
  });

  it('FAMILIAR no accede a activities:read (usa endpoint dedicado con portal:read)', () => {
    assertDeny('FAMILIAR', 'activities:read');
  });

  it('AUXILIAR y FAMILIAR no tienen quality:read', () => {
    assertDeny('AUXILIAR', 'quality:read');
    assertDeny('FAMILIAR', 'quality:read');
  });

  it('FAMILIAR no tiene inventory:read ni inventory:manage', () => {
    assertDeny('FAMILIAR', 'inventory:read');
    assertDeny('FAMILIAR', 'inventory:manage');
  });

  it('solo SANITARIO, DIRECTOR y SUPERADMIN prescriben medicación', () => {
    assertAllow('SUPERADMIN', 'medication:prescribe');
    assertAllow('DIRECTOR', 'medication:prescribe');
    assertAllow('SANITARIO', 'medication:prescribe');
    assertDeny('AUXILIAR', 'medication:prescribe');
    assertDeny('FAMILIAR', 'medication:prescribe');
  });

  it('AUXILIAR administra medicación pero no prescribe', () => {
    assertAllow('AUXILIAR', 'medication:administer');
    assertDeny('AUXILIAR', 'medication:prescribe');
  });

  it('FAMILIAR no ve ni administra medicación', () => {
    assertDeny('FAMILIAR', 'medication:read');
    assertDeny('FAMILIAR', 'medication:prescribe');
    assertDeny('FAMILIAR', 'medication:administer');
  });

  it('FAMILIAR y SUPERADMIN tienen visits:request; el resto del staff no', () => {
    // SUPERADMIN tiene todos los permisos por diseño (SUPERADMIN: PERMISSIONS).
    // Entre el staff del centro solo el FAMILIAR solicita visitas.
    assertAllow('FAMILIAR', 'visits:request');
    assertAllow('SUPERADMIN', 'visits:request'); // SUPERADMIN = todos los permisos
    assertDeny('DIRECTOR', 'visits:request');
    assertDeny('SANITARIO', 'visits:request');
    assertDeny('AUXILIAR', 'visits:request');
  });

  it('FAMILIAR y SUPERADMIN tienen requests:create; el resto del staff no', () => {
    // SUPERADMIN tiene todos los permisos por diseño.
    // Entre el staff del centro solo el FAMILIAR crea solicitudes (el staff las gestiona).
    assertAllow('FAMILIAR', 'requests:create');
    assertAllow('SUPERADMIN', 'requests:create'); // SUPERADMIN = todos los permisos
    assertDeny('DIRECTOR', 'requests:create');
    assertDeny('SANITARIO', 'requests:create');
    assertDeny('AUXILIAR', 'requests:create');
  });

  it('FAMILIAR y SUPERADMIN tienen portal:read; el resto del staff no', () => {
    // SUPERADMIN tiene todos los permisos por diseño.
    // Entre el staff del centro solo el FAMILIAR accede al portal de familias.
    assertAllow('FAMILIAR', 'portal:read');
    assertAllow('SUPERADMIN', 'portal:read'); // SUPERADMIN = todos los permisos
    assertDeny('DIRECTOR', 'portal:read');
    assertDeny('SANITARIO', 'portal:read');
    assertDeny('AUXILIAR', 'portal:read');
  });

  it('FAMILIAR no puede emitir comunicados (comms:broadcast)', () => {
    assertDeny('FAMILIAR', 'comms:broadcast');
  });

  it('todos los roles del personal tienen comms:read', () => {
    for (const role of ['SUPERADMIN', 'DIRECTOR', 'SANITARIO', 'AUXILIAR', 'FAMILIAR'] as const) {
      assertAllow(role, 'comms:read');
    }
  });

  it('AUXILIAR no puede escribir datos de centros (centers:write)', () => {
    assertDeny('AUXILIAR', 'centers:write');
  });

  it('AUXILIAR no puede editar datos clínicos (clinical:write)', () => {
    assertDeny('AUXILIAR', 'clinical:write');
  });

  it('AUXILIAR no puede editar el PIA (careplan:write)', () => {
    assertDeny('AUXILIAR', 'careplan:write');
  });

  it('ningún rol tiene un permiso fuera de PERMISSIONS', () => {
    // Sanity check: permissionsFor no devuelve permisos que no existan en PERMISSIONS
    for (const role of ALL_ROLES) {
      const perms = permissionsFor(role);
      for (const p of perms) {
        expect(PERMISSIONS).toContain(p);
      }
    }
  });

  it('la cobertura de la matriz es exhaustiva: todos los permisos están en al menos un rol', () => {
    for (const perm of PERMISSIONS) {
      const rolesWithPerm = ALL_ROLES.filter((r) => hasPermission(r, perm));
      expect(
        rolesWithPerm.length,
        `El permiso '${perm}' no está asignado a ningún rol — posible permiso huérfano`,
      ).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// 7. Coherencia interna de la política (detecta incoherencias reportables al CIO)
// ---------------------------------------------------------------------------

describe('Coherencia interna — detecta incoherencias entre allow y deny declarados', () => {
  it('todo rol con users:write también tiene users:read (jerarquía de privilegio)', () => {
    for (const role of ALL_ROLES) {
      if (hasPermission(role, 'users:write')) {
        expect(
          hasPermission(role, 'users:read'),
          `${role} tiene users:write pero NO tiene users:read — incoherencia`,
        ).toBe(true);
      }
    }
  });

  it('todo rol con billing:manage también tiene billing:read', () => {
    for (const role of ALL_ROLES) {
      if (hasPermission(role, 'billing:manage')) {
        expect(
          hasPermission(role, 'billing:read'),
          `${role} tiene billing:manage pero NO tiene billing:read — incoherencia`,
        ).toBe(true);
      }
    }
  });

  it('todo rol con admissions:manage también tiene admissions:read', () => {
    for (const role of ALL_ROLES) {
      if (hasPermission(role, 'admissions:manage')) {
        expect(
          hasPermission(role, 'admissions:read'),
          `${role} tiene admissions:manage pero NO tiene admissions:read — incoherencia`,
        ).toBe(true);
      }
    }
  });

  it('todo rol con activities:manage también tiene activities:read', () => {
    for (const role of ALL_ROLES) {
      if (hasPermission(role, 'activities:manage')) {
        expect(
          hasPermission(role, 'activities:read'),
          `${role} tiene activities:manage pero NO tiene activities:read — incoherencia`,
        ).toBe(true);
      }
    }
  });

  it('todo rol con inventory:manage también tiene inventory:read', () => {
    for (const role of ALL_ROLES) {
      if (hasPermission(role, 'inventory:manage')) {
        expect(
          hasPermission(role, 'inventory:read'),
          `${role} tiene inventory:manage pero NO tiene inventory:read — incoherencia`,
        ).toBe(true);
      }
    }
  });

  it('todo rol con shifts:manage también tiene shifts:read', () => {
    for (const role of ALL_ROLES) {
      if (hasPermission(role, 'shifts:manage')) {
        expect(
          hasPermission(role, 'shifts:read'),
          `${role} tiene shifts:manage pero NO tiene shifts:read — incoherencia`,
        ).toBe(true);
      }
    }
  });

  it('todo rol con centers:write también tiene centers:read', () => {
    for (const role of ALL_ROLES) {
      if (hasPermission(role, 'centers:write')) {
        expect(
          hasPermission(role, 'centers:read'),
          `${role} tiene centers:write pero NO tiene centers:read — incoherencia`,
        ).toBe(true);
      }
    }
  });
});
