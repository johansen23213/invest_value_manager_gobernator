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
  'conflicts:review', // validar divergencias de sincronización offline (juicio clínico)
  'requests:create',  // el FAMILIAR crea solicitudes y comenta las suyas
  'requests:manage',  // el staff ve todas las solicitudes del tenant, asigna, gestiona estado
  'comms:read',       // leer comunicados y mensajes que corresponden al usuario
  'comms:broadcast',  // publicar comunicados al centro/unidad/residente
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
    'conflicts:review',
    'requests:manage',
    'comms:read',
    'comms:broadcast',
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
    'conflicts:review',
    'requests:manage',
    'comms:read',
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
    'requests:manage',
    'comms:read',
  ],
  FAMILIAR: ['tenant:read', 'portal:read', 'requests:create', 'comms:read'], // portal: lectura + solicitudes propias + comunicados
};

export function hasPermission(role: UserRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

export function permissionsFor(role: UserRole): readonly Permission[] {
  return ROLE_PERMISSIONS[role];
}
