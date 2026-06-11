// Motor de sincronización del MAR (administraciones de medicación offline, ADR-0012).
//
// Diferencias deliberadas con care-sync (LWW por campo):
//  1. Identidad idempotente NATURAL: una administración es (tenantId, medicationId,
//     scheduledAt) — la dosis de las 08:00 de ese fármaco es una sola. Reenviar
//     actualiza, no duplica (es la clave única en BD).
//  2. LWW por EVENTO, no por campo: una administración es un hecho atómico
//     (se dio / no se dio / se rechazó, con su motivo). Mezclar campos de dos
//     dispositivos produciría registros clínicos incoherentes. Gana el evento con
//     `recordedAt` (momento de registro en el dispositivo) más reciente; la
//     divergencia completa se persiste como MedicationSyncConflict para revisión.
//
// `mergeAdministration` es pura (sin BD) y se testea de forma exhaustiva.

import type { MedAdminStatus, ConflictWinner } from '@prisma/client';
import type { TenantPrisma } from './rls';

/** Estado completo de un evento de administración (un lado de la fusión). */
export interface AdminEvent {
  status: MedAdminStatus;
  notes: string | null;
  administeredAt: Date | null;
  administeredById: string | null;
  recordedAt: Date; // momento de registro en el dispositivo: decide el LWW
}

export interface AdminMergeResult {
  winner: ConflictWinner;
  event: AdminEvent;
  /** true si los dos lados divergen clínicamente (status o notas distintos). */
  conflict: boolean;
}

/** Divergencia clínica real entre dos eventos (ignora metadatos de autor/hora exacta). */
function eventsDiverge(a: AdminEvent, b: AdminEvent): boolean {
  return a.status !== b.status || (a.notes ?? null) !== (b.notes ?? null);
}

/**
 * Fusiona dos eventos de la MISMA dosis (misma clave natural): gana el de
 * `recordedAt` más reciente, como evento completo. Empate -> gana el servidor
 * (determinista y conservador: lo ya persistido prevalece).
 */
export function mergeAdministration(existing: AdminEvent, incoming: AdminEvent): AdminMergeResult {
  const clientWins = incoming.recordedAt.getTime() > existing.recordedAt.getTime();
  return {
    winner: clientWins ? 'CLIENT' : 'SERVER',
    event: clientWins ? incoming : existing,
    conflict: eventsDiverge(existing, incoming),
  };
}

// --- Aplicación contra la base de datos (idempotente, respeta RLS) -----------

export interface IncomingMedAdminEvent {
  medicationId: string;
  scheduledAt: Date;
  status: MedAdminStatus;
  notes?: string | null;
  /** Hora real del acto (puede diferir de la pautada al ir offline). */
  administeredAt?: Date | null;
  /** Momento de registro en el dispositivo (clave del LWW). */
  recordedAt: Date;
}

export interface MedPushResult {
  medicationId: string;
  scheduledAt: Date;
  id: string;
  status: 'CREATED' | 'MERGED';
  winner: ConflictWinner | null; // null en CREATED (no hubo fusión)
  conflict: boolean;
}

/** Serializa un evento para persistirlo en el registro de conflictos (JSON). */
function eventToJson(e: AdminEvent) {
  return {
    status: e.status,
    notes: e.notes,
    administeredAt: e.administeredAt?.toISOString() ?? null,
    administeredById: e.administeredById,
    recordedAt: e.recordedAt.toISOString(),
  };
}

/**
 * Aplica un lote de administraciones offline. `db` debe estar acotado al tenant
 * (RLS). Idempotente por la clave natural: reenviar el mismo evento no duplica
 * ni genera conflictos espurios (mismos valores -> sin divergencia).
 */
export async function applyMedicationAdminPush(
  db: TenantPrisma,
  tenantId: string,
  authorId: string,
  events: IncomingMedAdminEvent[],
): Promise<MedPushResult[]> {
  const results: MedPushResult[] = [];

  for (const ev of events) {
    // La medicación debe pertenecer al tenant (consulta ya acotada por RLS).
    const med = await db.medication.findUnique({ where: { id: ev.medicationId } });
    if (!med) {
      throw new Error(`Medicación ${ev.medicationId} no encontrada en el tenant.`);
    }

    const incoming: AdminEvent = {
      status: ev.status,
      notes: ev.notes ?? null,
      administeredAt:
        ev.administeredAt ?? (ev.status === 'ADMINISTRADO' ? ev.recordedAt : null),
      administeredById: authorId,
      recordedAt: ev.recordedAt,
    };

    const existing = await db.medicationAdministration.findUnique({
      where: {
        tenantId_medicationId_scheduledAt: {
          tenantId,
          medicationId: ev.medicationId,
          scheduledAt: ev.scheduledAt,
        },
      },
    });

    if (!existing) {
      const created = await db.medicationAdministration.create({
        data: {
          tenantId,
          residentId: med.residentId,
          medicationId: ev.medicationId,
          scheduledAt: ev.scheduledAt,
          status: incoming.status,
          notes: incoming.notes,
          administeredAt: incoming.administeredAt,
          administeredById: incoming.administeredById,
          recordedAt: incoming.recordedAt,
        },
      });
      results.push({
        medicationId: ev.medicationId,
        scheduledAt: ev.scheduledAt,
        id: created.id,
        status: 'CREATED',
        winner: null,
        conflict: false,
      });
      continue;
    }

    const serverEvent: AdminEvent = {
      status: existing.status,
      notes: existing.notes,
      administeredAt: existing.administeredAt,
      administeredById: existing.administeredById,
      recordedAt: existing.recordedAt,
    };

    const merged = mergeAdministration(serverEvent, incoming);

    if (merged.winner === 'CLIENT') {
      await db.medicationAdministration.update({
        where: { id: existing.id },
        data: {
          status: merged.event.status,
          notes: merged.event.notes,
          administeredAt: merged.event.administeredAt,
          administeredById: merged.event.administeredById,
          recordedAt: merged.event.recordedAt,
        },
      });
    }

    if (merged.conflict) {
      await db.medicationSyncConflict.create({
        data: {
          tenantId,
          administrationId: existing.id,
          serverEvent: eventToJson(serverEvent),
          clientEvent: eventToJson(incoming),
          winner: merged.winner,
        },
      });
    }

    results.push({
      medicationId: ev.medicationId,
      scheduledAt: ev.scheduledAt,
      id: existing.id,
      status: 'MERGED',
      winner: merged.winner,
      conflict: merged.conflict,
    });
  }

  return results;
}
