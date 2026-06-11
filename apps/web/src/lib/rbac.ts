import type { UserRole } from '@vetlla/db';

// Permisos por rol (mínimo privilegio). Se amplían por hito a medida que
// aparecen recursos (atención, medicación, copiloto...).
export const PERMISSIONS = [
  'tenant:read',
  'tenant:manage',
  'users:read',
  'users:write',
  'centers:read', // centros, unidades, plazas
  'centers:write',
  'residents:read', // expediente del residente
  'residents:write',
  'clinical:write', // diagnósticos, alergias, valoraciones
  'care:read', // registros de atención directa
  'care:write',
  'medication:read',
  'medication:prescribe',
  'medication:administer', // MAR
  'careplan:read', // PIA
  'careplan:write',
  'portal:read', // portal de familias (solo el residente vinculado)
  'audit:read', // registro de actividad (RGPD)
  'dsar:manage', // derechos del interesado: export (art. 15) y supresión (art. 17)
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const ROLE_PERMISSIONS: Record<UserRole, readonly Permission[]> = {
  SUPERADMIN: PERMISSIONS,
  DIRECTOR: [
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
  ],
  SANITARIO: [
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
  ],
  // El auxiliar registra atención directa y administra medicación (MAR).
  AUXILIAR: [
    'tenant:read',
    'centers:read',
    'residents:read',
    'care:read',
    'care:write',
    'medication:read',
    'medication:administer',
    'careplan:read',
  ],
  FAMILIAR: ['tenant:read', 'portal:read'], // solo lectura del residente vinculado
};

export function hasPermission(role: UserRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

export function permissionsFor(role: UserRole): readonly Permission[] {
  return ROLE_PERMISSIONS[role];
}
