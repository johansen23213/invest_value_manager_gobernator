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
  // Cuadrantes/turnos del personal (Épica D — RF-PRO-003/004/008/009/010/013)
  // Dominio nuevo justificado: los turnos del personal son un recurso propio,
  // distinto de los datos clínicos (care:*) y de la gestión de usuarios (users:*).
  // shifts:read   → ver cuadrante y asignaciones (DIRECTOR + SANITARIO + AUXILIAR).
  // shifts:manage → planificar cuadrante, plantillas, ausencias (DIRECTOR + SUPERADMIN).
  // Cierre de turno firmado (handover) usa care:write/care:read (el mismo permiso
  // que habilita al responsable del turno a documentar la atención).
  'shifts:read',      // ver cuadrante mensual, asignaciones, estado de cobertura
  'shifts:manage',    // planificar cuadrante, gestionar plantillas y ausencias/sustituciones
  // Facturación (RF-ECO-001..005) — cuotas/tarifas, copagos, facturas, portal económico.
  // billing:read   → ver tarifas, perfiles y facturas del tenant (DIRECTOR, SUPERADMIN).
  // billing:manage → crear/emitir/anular facturas (DIRECTOR, SUPERADMIN).
  // FAMILIAR usa assertFamilyAccess en listMine/getMine, sin necesitar estos permisos.
  'billing:read',
  'billing:manage',
  // Admisión / Preadmisión / Forecast (RF-ADM-001..010)
  // admissions:read   → ver solicitudes y forecast (DIRECTOR, SANITARIO).
  // admissions:manage → crear/actualizar/transicionar solicitudes (DIRECTOR).
  //
  // Matriz RBAC de admisiones:
  //   SUPERADMIN → manage + read (todos los permisos)
  //   DIRECTOR   → manage + read (gestiona el proceso completo)
  //   SANITARIO  → read (participa en la evaluación clínica; solo lectura)
  //   AUXILIAR   → sin acceso (no interviene en admisiones)
  //   FAMILIAR   → sin acceso (proceso interno del centro)
  'admissions:read',
  'admissions:manage',
  // Actividades (animación sociocultural / terapia ocupacional)
  // Matriz RBAC:
  //   activities:read   → leer catálogo, sesiones e inscripciones (todos los roles del centro).
  //   activities:manage → gestionar catálogo, programar sesiones, inscribir y registrar asistencia.
  //
  //   SUPERADMIN → manage + read
  //   DIRECTOR   → manage + read (responsable del programa de actividades)
  //   AUXILIAR   → manage + read (el TASOC/animador es auxiliar en muchos centros;
  //                              la animación sociocultural la realizan los auxiliares)
  //   SANITARIO  → read (puede consultar la participación del residente)
  //   FAMILIAR   → read de las actividades de SU residente (portal), vía endpoint
  //               participationForResident con assertFamilyAccess (no usa este permiso
  //               directamente — usa portal:read + assertFamilyAccess)
  'activities:read',
  'activities:manage',
  // Indicadores de calidad asistencial — panel de cohorte del centro.
  // quality:read → leer el dashboard de indicadores (UPP, caídas, valoraciones, sujeciones).
  //
  // Matriz RBAC:
  //   SUPERADMIN → quality:read (plataforma)
  //   DIRECTOR   → quality:read (responsable de calidad y gestión del centro)
  //   SANITARIO  → quality:read (interés clínico; los indicadores orientan la atención)
  //   AUXILIAR   → sin acceso (los indicadores de cohorte son datos de gestión, no operativos)
  //   FAMILIAR   → sin acceso (datos del centro, no del residente vinculado)
  //
  // Decisión: permiso propio porque los indicadores de calidad son un dominio
  // diferente de residents:read (que da acceso al expediente individual) y de
  // care:read (que da acceso a los registros de atención). Un permiso propio
  // permite revocar el acceso al panel de calidad sin tocar otros permisos, y
  // permite que en el futuro se añada quality:write para gestionar umbrales.
  'quality:read',
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
    'shifts:read',
    'shifts:manage',
    'billing:read',
    'billing:manage',
    'admissions:read',
    'admissions:manage',
    'activities:read',
    'activities:manage',
    'quality:read',
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
    // SANITARIO puede ver el cuadrante (shifts:read): necesita saber qué equipo
    // tiene en cada turno para coordinar la atención clínica. No puede planificarlo
    // (shifts:manage es exclusivo de dirección).
    'shifts:read',
    // SANITARIO tiene admissions:read: participa en la evaluación clínica del
    // candidato (valoración de grado de dependencia, diagnósticos, necesidades).
    // No puede crear ni transicionar solicitudes (admissions:manage es solo DIRECTOR).
    'admissions:read',
    // SANITARIO tiene activities:read: puede consultar la participación del
    // residente en actividades (dato clínico relevante para el bienestar).
    // No puede gestionar el catálogo ni inscribir (activities:manage es DIRECTOR+AUXILIAR).
    'activities:read',
    // SANITARIO tiene quality:read: los indicadores de calidad asistencial (UPP,
    // caídas, valoraciones) son relevantes para la práctica clínica y la mejora
    // de la atención. El panel de calidad complementa el expediente individual.
    'quality:read',
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
    // AUXILIAR puede ver su cuadrante (shifts:read): necesita saber en qué turno
    // está asignado y quiénes son sus compañeros. No puede planificarlo (shifts:manage).
    'shifts:read',
    // AUXILIAR (TASOC/animador) gestiona el programa de actividades: catálogo,
    // programación de sesiones, inscripción de residentes y registro de asistencia.
    'activities:read',
    'activities:manage',
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
