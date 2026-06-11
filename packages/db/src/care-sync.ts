// Motor de sincronización de CareRecord (atención directa offline-first).
//
// Dos garantías clave:
//  1. Idempotencia: un registro se identifica por (tenantId, clientId). Reenviarlo
//     no crea duplicados; se fusiona con el existente.
//  2. Last-write-wins por campo + registro de conflictos: al fusionar, cada campo
//     gana según su timestamp de edición en el dispositivo; las divergencias se
//     registran como SyncConflict.
//
// `mergeCareRecord` es pura (sin BD) y por tanto fácil de testear de forma exhaustiva.

import { Prisma } from '@prisma/client';
import type { CareRecordType, ConflictWinner } from '@prisma/client';
import type { TenantPrisma } from './rls';

/** Adapta un valor de campo a la entrada Json de Prisma (null -> JsonNull). */
function toJsonInput(value: FieldValue): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  return value === null ? Prisma.JsonNull : value;
}

export type FieldValue = string | number | boolean | null;
export type Payload = Record<string, FieldValue>;
export type FieldTimestamps = Record<string, string>; // campo -> ISO 8601 (UTC)

export interface MergeConflict {
  field: string;
  serverValue: FieldValue;
  clientValue: FieldValue;
  winner: ConflictWinner;
}

export interface MergeResult {
  payload: Payload;
  fieldTimestamps: FieldTimestamps;
  conflicts: MergeConflict[];
}

interface RecordState {
  payload: Payload;
  fieldTimestamps: FieldTimestamps;
}

function ts(value: string | undefined): number {
  return value ? Date.parse(value) : Number.NEGATIVE_INFINITY;
}

/**
 * Fusiona un registro entrante con el estado existente, campo a campo.
 * El más reciente gana; si hay divergencia de valores se registra un conflicto.
 */
export function mergeCareRecord(existing: RecordState, incoming: RecordState): MergeResult {
  const payload: Payload = { ...existing.payload };
  const fieldTimestamps: FieldTimestamps = { ...existing.fieldTimestamps };
  const conflicts: MergeConflict[] = [];

  for (const field of Object.keys(incoming.payload)) {
    const incomingValue = incoming.payload[field] ?? null;
    const serverValue = existing.payload[field] ?? null;
    const incomingTs = ts(incoming.fieldTimestamps[field]);
    const existingTs = ts(existing.fieldTimestamps[field]);
    const isNewField = !(field in existing.payload);
    const valuesDiffer = serverValue !== incomingValue;

    if (incomingTs > existingTs) {
      // Gana el cliente. Conflicto solo si había un valor distinto previo.
      if (!isNewField && valuesDiffer) {
        conflicts.push({ field, serverValue, clientValue: incomingValue, winner: 'CLIENT' });
      }
      payload[field] = incomingValue;
      fieldTimestamps[field] = incoming.fieldTimestamps[field] ?? new Date().toISOString();
    } else if (valuesDiffer) {
      // Gana el servidor (timestamp igual o anterior) y los valores difieren.
      conflicts.push({ field, serverValue, clientValue: incomingValue, winner: 'SERVER' });
    }
  }

  return { payload, fieldTimestamps, conflicts };
}

// --- Aplicación contra la base de datos (idempotente, respeta RLS) -----------

export interface IncomingCareRecord {
  clientId: string;
  residentId: string;
  type: CareRecordType;
  recordedAt: Date;
  payload: Payload;
  fieldTimestamps: FieldTimestamps;
}

export interface PushResult {
  clientId: string;
  id: string;
  status: 'CREATED' | 'MERGED';
  conflicts: number;
}

/**
 * Aplica un lote de registros entrantes. `db` debe estar acotado al tenant (RLS).
 * Devuelve, por registro, su id de servidor y el nº de conflictos detectados.
 */
export async function applyCareRecordPush(
  db: TenantPrisma,
  tenantId: string,
  authorId: string,
  records: IncomingCareRecord[],
): Promise<PushResult[]> {
  const results: PushResult[] = [];

  for (const rec of records) {
    // El residente debe pertenecer al tenant (consulta ya acotada por RLS).
    const resident = await db.resident.findUnique({ where: { id: rec.residentId } });
    if (!resident) {
      throw new Error(`Residente ${rec.residentId} no encontrado en el tenant.`);
    }

    const existing = await db.careRecord.findUnique({
      where: { tenantId_clientId: { tenantId, clientId: rec.clientId } },
    });

    if (!existing) {
      const created = await db.careRecord.create({
        data: {
          tenantId,
          residentId: rec.residentId,
          type: rec.type,
          clientId: rec.clientId,
          payload: rec.payload,
          fieldTimestamps: rec.fieldTimestamps,
          recordedAt: rec.recordedAt,
          authorId,
          syncStatus: 'SYNCED',
        },
      });
      results.push({ clientId: rec.clientId, id: created.id, status: 'CREATED', conflicts: 0 });
      continue;
    }

    const merged = mergeCareRecord(
      {
        payload: existing.payload as Payload,
        fieldTimestamps: existing.fieldTimestamps as FieldTimestamps,
      },
      { payload: rec.payload, fieldTimestamps: rec.fieldTimestamps },
    );

    await db.careRecord.update({
      where: { id: existing.id },
      data: {
        payload: merged.payload,
        fieldTimestamps: merged.fieldTimestamps,
        syncStatus: merged.conflicts.length > 0 ? 'CONFLICT' : 'SYNCED',
      },
    });

    for (const c of merged.conflicts) {
      await db.syncConflict.create({
        data: {
          tenantId,
          careRecordId: existing.id,
          field: c.field,
          serverValue: toJsonInput(c.serverValue),
          clientValue: toJsonInput(c.clientValue),
          winner: c.winner,
        },
      });
    }

    results.push({
      clientId: rec.clientId,
      id: existing.id,
      status: 'MERGED',
      conflicts: merged.conflicts.length,
    });
  }

  return results;
}
