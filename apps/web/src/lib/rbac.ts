import type { UserRole } from '@vetlla/db';

// Permisos por rol (mínimo privilegio). Se amplían por hito a medida que
// aparecen recursos (residentes, atención, medicación, copiloto...).
export const PERMISSIONS = [
  'tenant:read',
  'tenant:manage',
  'users:read',
  'users:write',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const ROLE_PERMISSIONS: Record<UserRole, readonly Permission[]> = {
  SUPERADMIN: PERMISSIONS,
  DIRECTOR: ['tenant:read', 'users:read', 'users:write'],
  SANITARIO: ['tenant:read', 'users:read'],
  AUXILIAR: ['tenant:read'],
  FAMILIAR: ['tenant:read'],
};

export function hasPermission(role: UserRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

export function permissionsFor(role: UserRole): readonly Permission[] {
  return ROLE_PERMISSIONS[role];
}
