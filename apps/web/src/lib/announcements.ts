/**
 * Lógica pura del módulo de comunicados (COM-001..COM-011).
 * Sin dependencias de BD: testeable de forma aislada.
 *
 * Función principal: dada la audiencia de un comunicado y los vínculos del
 * tenant, ¿qué usuarios (familiares) son destinatarios?
 */

// ---------------------------------------------------------------------------
// Tipos locales (espejo de los de Prisma; sin dependencias pesadas en tests)
// ---------------------------------------------------------------------------

export type AudienceType = 'TODO_EL_CENTRO' | 'POR_UNIDAD' | 'RESIDENTE';

/** Mínimo del vínculo FamilyLink necesario para el cálculo de destinatarios. */
export interface FamilyLinkMin {
  userId: string;
  residentId: string;
}

/**
 * Mínimo del residente necesario para el cálculo de destinatarios.
 * La cama vincula al residente con su unidad.
 */
export interface ResidentMin {
  id: string;
  bedId: string | null;
  bed: { unitId: string } | null;
}

/** Parámetros del comunicado para calcular destinatarios. */
export interface AnnouncementTargetInput {
  audience: AudienceType;
  /** Solo relevante si audience === 'POR_UNIDAD'. */
  unitId?: string | null;
  /** Solo relevante si audience === 'RESIDENTE'. */
  residentId?: string | null;
}

// ---------------------------------------------------------------------------
// Función pura principal (COM-001)
// ---------------------------------------------------------------------------

/**
 * Devuelve el conjunto de userIds que son destinatarios del comunicado.
 *
 * Reglas:
 *   - TODO_EL_CENTRO: todos los familiares del tenant (todos los userId de familyLinks).
 *   - POR_UNIDAD: familiares de residentes cuya cama∈unitId indicado.
 *   - RESIDENTE: familiares vinculados a ese residente concreto.
 *
 * La función es pura: recibe los datos ya cargados y no toca la BD.
 */
export function computeRecipients(
  announcement: AnnouncementTargetInput,
  familyLinks: FamilyLinkMin[],
  residents: ResidentMin[],
): string[] {
  switch (announcement.audience) {
    case 'TODO_EL_CENTRO': {
      // Todos los familiares del tenant (sin duplicados)
      return unique(familyLinks.map((fl) => fl.userId));
    }

    case 'POR_UNIDAD': {
      const { unitId } = announcement;
      if (!unitId) return [];
      // Residentes que tienen cama en esta unidad
      const residentIdsInUnit = new Set(
        residents
          .filter((r) => r.bed?.unitId === unitId)
          .map((r) => r.id),
      );
      // Familiares vinculados a alguno de esos residentes
      return unique(
        familyLinks
          .filter((fl) => residentIdsInUnit.has(fl.residentId))
          .map((fl) => fl.userId),
      );
    }

    case 'RESIDENTE': {
      const { residentId } = announcement;
      if (!residentId) return [];
      return unique(
        familyLinks
          .filter((fl) => fl.residentId === residentId)
          .map((fl) => fl.userId),
      );
    }
  }
}

/** Deduplica un array de strings preservando el primer orden de aparición. */
function unique(arr: string[]): string[] {
  return [...new Set(arr)];
}

// ---------------------------------------------------------------------------
// Helpers de validación (para el router)
// ---------------------------------------------------------------------------

/**
 * Verifica que el comunicado tiene los campos requeridos según su audiencia.
 * Devuelve null si es válido, o un string con el motivo del error.
 */
export function validateAnnouncementAudience(
  audience: AudienceType,
  unitId: string | null | undefined,
  residentId: string | null | undefined,
): string | null {
  if (audience === 'POR_UNIDAD' && !unitId) {
    return 'El campo unitId es obligatorio cuando la audiencia es POR_UNIDAD.';
  }
  if (audience === 'RESIDENTE' && !residentId) {
    return 'El campo residentId es obligatorio cuando la audiencia es RESIDENTE.';
  }
  return null;
}

// ---------------------------------------------------------------------------
// Estadísticas de un comunicado (COM-006)
// ---------------------------------------------------------------------------

export interface AnnouncementStats {
  totalRecipients: number;
  totalRead: number;
  totalAcknowledged: number;
  /** Porcentaje de lectura 0-100. null si no hay destinatarios. */
  readPct: number | null;
  /** Porcentaje de acuse 0-100. null si no hay destinatarios. */
  ackPct: number | null;
}

/** Recibo mínimo para calcular las estadísticas. */
export interface ReceiptMin {
  readAt: Date | null;
  acknowledgedAt: Date | null;
}

/**
 * Calcula estadísticas de lectura y acuse de un comunicado a partir de
 * los recibos y el número total de destinatarios calculados.
 * Función pura, sin BD.
 */
export function computeAnnouncementStats(
  recipientCount: number,
  receipts: ReceiptMin[],
): AnnouncementStats {
  const totalRead = receipts.filter((r) => r.readAt !== null).length;
  const totalAcknowledged = receipts.filter((r) => r.acknowledgedAt !== null).length;
  return {
    totalRecipients: recipientCount,
    totalRead,
    totalAcknowledged,
    readPct: recipientCount > 0 ? Math.round((totalRead / recipientCount) * 100) : null,
    ackPct: recipientCount > 0 ? Math.round((totalAcknowledged / recipientCount) * 100) : null,
  };
}
