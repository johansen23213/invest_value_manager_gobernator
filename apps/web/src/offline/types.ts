import type { CareRecordType } from '@vetlla/db';

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
