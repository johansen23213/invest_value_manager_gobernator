import type { CareRecordType, MedAdminStatus } from '@vetlla/db';

export type OutboxStatus = 'PENDING' | 'SYNCED' | 'CONFLICT' | 'ERROR';

export type CarePayload = Record<string, string | number | boolean | null>;

/** Registro de atención en la cola local (IndexedDB). */
export interface OutboxRecord {
  clientId: string; // uuid; clave de idempotencia
  residentId: string;
  residentName?: string;
  type: CareRecordType;
  recordedAt: string; // ISO
  payload: CarePayload;
  fieldTimestamps: Record<string, string>;
  status: OutboxStatus;
  conflicts?: number;
  error?: string;
  createdAt: string;
}

/**
 * Administración de medicación en la cola local (ADR-0012). La clave de
 * idempotencia es NATURAL: (medicationId, scheduledAt) — la dosis de las 08:00
 * de ese fármaco es una sola. `key` la materializa para IndexedDB.
 */
export interface MedOutboxRecord {
  key: string; // `${medicationId}|${scheduledAt ISO}`
  medicationId: string;
  medicationName?: string;
  residentId: string;
  scheduledAt: string; // ISO (hora pautada de la dosis)
  status: MedAdminStatus;
  notes?: string | null;
  administeredAt?: string | null; // ISO; hora real del acto
  recordedAt: string; // ISO; momento de registro en el dispositivo (LWW)
  syncStatus: OutboxStatus;
  conflict?: boolean;
  error?: string;
  createdAt: string;
}

export function medOutboxKey(medicationId: string, scheduledAtIso: string): string {
  return `${medicationId}|${scheduledAtIso}`;
}
