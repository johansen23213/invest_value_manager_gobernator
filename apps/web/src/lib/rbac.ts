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
  // Visitas (VIS-001..VIS-010)
  // visits:request → FAMILIAR: solicitar/cancelar sus visitas, ver las de sus residentes.
  // visits:manage  → DIRECTOR + AUXILIAR + SANITARIO: agenda del centro, aprobar/rechazar,
  //                  check-in/out, marcar no-show.
  //                  La configuración de franjas usa centers:write (solo DIRECTOR), que ya
  //                  existe y es el permiso correcto para la configuración de un centro.
  //                  Decisión documentada: no se crea un permiso "visits:config" específico
  //                  porque la gestión de franjas es configuración de centro y ya está
  //                  guardada en centers:write (mínimo privilegio, sin proliferación de permisos).
  'visits:request',   // el FAMILIAR solicita visitas para sus residentes y las gestiona
  'visits:manage',    // el staff gestiona la agenda, check-in/out, no-show
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
    'visits:manage',
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
    // SANITARIO tiene visits:manage porque puede necesitar coordinar visitas
    // con criterio clínico (p. ej. limitar visitas a un residente en aislamiento).
    // Decisión documentada: el sanitario no gestiona la agenda principal de
    // recepción pero sí puede necesitar ver/aprobar/rechazar visitas desde el
    // expediente. Mantenerlo aquí es menos restrictivo que crear un permiso
    // separado y la recepción habitualmente la llevan auxiliares o dirección.
    'visits:manage',
  ],
  // El auxiliar registra atención directa y administra medicación (MAR).
  // En muchos centros el auxiliar hace las funciones de recepción (check-in/out).
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
    'visits:manage',
  ],
  FAMILIAR: [
    'tenant:read',
    'portal:read',
    'requests:create',
    'comms:read',
    'visits:request',  // el familiar solicita/cancela/ve sus visitas
  ],
};

export function hasPermission(role: UserRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

export function permissionsFor(role: UserRole): readonly Permission[] {
  return ROLE_PERMISSIONS[role];
}
