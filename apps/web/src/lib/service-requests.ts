// Lógica pura del módulo de solicitudes (REQ-001..REQ-011).
// Sin dependencias de BD: testeable de forma aislada.

// ---------------------------------------------------------------------------
// Enums locales (espejo de los de Prisma; no importamos @vetlla/db aquí
// para mantener la función pura sin dependencias pesadas en tests unitarios).
// ---------------------------------------------------------------------------

export type SRCategory =
  | 'ADMINISTRACION'
  | 'DOCUMENTACION'
  | 'VISITAS'
  | 'ACTIVIDADES'
  | 'MANTENIMIENTO'
  | 'ALIMENTACION'
  | 'COMUNICACION'
  | 'OBJETOS_PERSONALES'
  | 'INCIDENCIA_APP'
  | 'OTRA';

export type SRPriority = 'BAJA' | 'NORMAL' | 'ALTA' | 'URGENTE';

export type SRStatus =
  | 'RECIBIDA'
  | 'ASIGNADA'
  | 'EN_CURSO'
  | 'PENDIENTE_INFO'
  | 'RESUELTA'
  | 'CERRADA'
  | 'REABIERTA';

// ---------------------------------------------------------------------------
// SLA (REQ-007)
// ---------------------------------------------------------------------------

/**
 * Horas de SLA por prioridad.
 * La categoría queda como parámetro para permitir ajustes futuros por
 * tipo de solicitud (p. ej. INCIDENCIA_APP podría tener SLA reducido).
 * Por ahora el SLA depende solo de la prioridad.
 *
 *   URGENTE  →  4h  (situación que requiere respuesta inmediata del equipo)
 *   ALTA     → 24h  (un día laborable)
 *   NORMAL   → 72h  (tres días laborables)
 *   BAJA     → 120h (cinco días laborables / una semana hábil)
 */
export function slaHoursFor(_category: SRCategory, priority: SRPriority): number {
  switch (priority) {
    case 'URGENTE': return 4;
    case 'ALTA':    return 24;
    case 'NORMAL':  return 72;
    case 'BAJA':    return 120;
  }
}

/**
 * Fecha límite de SLA calculada a partir de la creación.
 */
export function slaDueAt(
  createdAt: Date,
  category: SRCategory,
  priority: SRPriority,
): Date {
  const hours = slaHoursFor(category, priority);
  const due = new Date(createdAt.getTime() + hours * 60 * 60 * 1000);
  return due;
}

// ---------------------------------------------------------------------------
// Overdue (REQ-007 / REQ-011)
// ---------------------------------------------------------------------------

/** Tipo mínimo necesario para verificar si una solicitud está fuera de SLA. */
export interface SRForOverdue {
  slaDueAt: Date | null;
  status: SRStatus;
}

/** Estados que indican que la solicitud ya fue resuelta o cerrada. */
const TERMINAL_STATUSES: SRStatus[] = ['RESUELTA', 'CERRADA'];

/**
 * Devuelve true si la solicitud ha superado su fecha de SLA y todavía
 * está activa (no resuelta ni cerrada). Permite escalado automático (REQ-011).
 */
export function isOverdue(req: SRForOverdue, now: Date): boolean {
  if (req.slaDueAt === null) return false;
  if (TERMINAL_STATUSES.includes(req.status)) return false;
  return now > req.slaDueAt;
}

// ---------------------------------------------------------------------------
// Máquina de estados (REQ-003, REQ-010)
// ---------------------------------------------------------------------------

/**
 * Transiciones válidas del ciclo de vida de una solicitud.
 *
 * Diagrama:
 *
 *   RECIBIDA  ──→  ASIGNADA
 *   RECIBIDA  ──→  EN_CURSO       (staff acepta directamente)
 *   RECIBIDA  ──→  CERRADA        (rechazada/duplicada antes de asignar)
 *   ASIGNADA  ──→  EN_CURSO
 *   ASIGNADA  ──→  PENDIENTE_INFO
 *   ASIGNADA  ──→  RESUELTA
 *   ASIGNADA  ──→  CERRADA
 *   EN_CURSO  ──→  PENDIENTE_INFO
 *   EN_CURSO  ──→  RESUELTA
 *   EN_CURSO  ──→  CERRADA
 *   PENDIENTE_INFO ──→ EN_CURSO   (se recibió la información solicitada)
 *   PENDIENTE_INFO ──→ RESUELTA
 *   PENDIENTE_INFO ──→ CERRADA
 *   RESUELTA  ──→  CERRADA        (cierre formal tras confirmación)
 *   RESUELTA  ──→  REABIERTA      (REQ-010: el familiar no está conforme)
 *   CERRADA   ──→  REABIERTA      (REQ-010)
 *   REABIERTA ──→  EN_CURSO
 *   REABIERTA ──→  ASIGNADA
 *   REABIERTA ──→  CERRADA
 */
const VALID_TRANSITIONS: Record<SRStatus, SRStatus[]> = {
  RECIBIDA:       ['ASIGNADA', 'EN_CURSO', 'CERRADA'],
  ASIGNADA:       ['EN_CURSO', 'PENDIENTE_INFO', 'RESUELTA', 'CERRADA'],
  EN_CURSO:       ['PENDIENTE_INFO', 'RESUELTA', 'CERRADA'],
  PENDIENTE_INFO: ['EN_CURSO', 'RESUELTA', 'CERRADA'],
  RESUELTA:       ['CERRADA', 'REABIERTA'],
  CERRADA:        ['REABIERTA'],
  REABIERTA:      ['ASIGNADA', 'EN_CURSO', 'CERRADA'],
};

/**
 * Devuelve true si la transición `from` → `to` es válida según la máquina
 * de estados del módulo de solicitudes.
 */
export function canTransition(from: SRStatus, to: SRStatus): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}
