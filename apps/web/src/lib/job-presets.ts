/**
 * Presets función → rol por defecto (R-01, Wave B Sprint M).
 *
 * El campo `jobTitle` es una etiqueta de presentación libre; el rol efectivo
 * (y por tanto los permisos reales) los decide siempre quien gestiona el tenant.
 * Este mapa solo sirve como SUGERENCIA en la UI al crear o editar un usuario.
 *
 * Fuente: docs/ux/medicacion-y-rbac.md §3.2.
 */

import type { UserRole } from '@vetlla/db';

/** Funciones habituales en centros sociosanitarios españoles. */
export const JOB_TITLE_OPTIONS = [
  'Director/a',
  'Gerente',
  'Médico/a',
  'Enfermero/a (DUE)',
  'Fisioterapeuta',
  'Terapeuta ocupacional',
  'Trabajador/a social',
  'Animador/a sociocultural',
  'Auxiliar de atención directa',
  'Recepcionista',
  'Mantenimiento',
  'Familiar',
] as const;

export type JobTitle = (typeof JOB_TITLE_OPTIONS)[number];

/**
 * Sugerencia de rol para una función dada.
 * Siempre es revisable: el usuario final puede escoger cualquier rol.
 *
 * Nota sobre RECEPCIONISTA → DIRECTOR: tiene acceso a `users:write` y
 * `centers:write`, que es demasiado para recepción. Documentado en R5
 * (docs/ux/medicacion-y-rbac.md §5). Ajustar el rol manualmente si aplica.
 */
export const JOB_TITLE_ROLE_PRESETS: Record<JobTitle, UserRole> = {
  'Director/a': 'DIRECTOR',
  'Gerente': 'DIRECTOR',
  'Médico/a': 'SANITARIO',
  'Enfermero/a (DUE)': 'SANITARIO',
  'Fisioterapeuta': 'SANITARIO',
  'Terapeuta ocupacional': 'SANITARIO',
  'Trabajador/a social': 'SANITARIO',
  'Animador/a sociocultural': 'AUXILIAR',
  'Auxiliar de atención directa': 'AUXILIAR',
  'Recepcionista': 'DIRECTOR', // revisable (ver R5)
  'Mantenimiento': 'AUXILIAR',
  'Familiar': 'FAMILIAR',
};

/**
 * Devuelve el rol sugerido para una etiqueta de función.
 * Si la etiqueta no coincide con ningún preset, devuelve undefined (sin sugerencia).
 */
export function suggestRoleForJobTitle(jobTitle: string): UserRole | undefined {
  return JOB_TITLE_ROLE_PRESETS[jobTitle as JobTitle];
}

/**
 * Nota sobre el preset RECEPCIONISTA: el director puede cambiar el rol a AUXILIAR
 * si la recepción no necesita gestionar usuarios ni configurar el centro.
 */
export const JOB_TITLE_PRESET_NOTES: Partial<Record<JobTitle, string>> = {
  Recepcionista:
    'El preset sugerido (Dirección) incluye gestión de usuarios y centros. ' +
    'Cambia a Auxiliar si la recepción solo necesita acceso de consulta.',
};
