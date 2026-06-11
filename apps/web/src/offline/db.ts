import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { MedOutboxRecord, OutboxRecord } from './types';

interface VetllaDB extends DBSchema {
  outbox: { key: string; value: OutboxRecord };
  // ADR-0012: cola propia del MAR (clave natural medicationId|scheduledAt).
  medOutbox: { key: string; value: MedOutboxRecord };
}

let dbPromise: Promise<IDBPDatabase<VetllaDB>> | null = null;

function getDb() {
  if (!dbPromise) {
    dbPromise = openDB<VetllaDB>('vetlla-offline', 2, {
      upgrade(db, oldVersion) {
        if (oldVersion < 1) {
          db.createObjectStore('outbox', { keyPath: 'clientId' });
        }
        if (oldVersion < 2) {
          db.createObjectStore('medOutbox', { keyPath: 'key' });
        }
      },
    });
  }
  return dbPromise;
}

export async function putOutbox(record: OutboxRecord): Promise<void> {
  const db = await getDb();
  await db.put('outbox', record);
}

export async function allOutbox(): Promise<OutboxRecord[]> {
  const db = await getDb();
  return db.getAll('outbox');
}

export async function deleteOutbox(clientId: string): Promise<void> {
  const db = await getDb();
  await db.delete('outbox', clientId);
}

export function isUnsynced(r: OutboxRecord): boolean {
  return r.status === 'PENDING' || r.status === 'ERROR';
}

// --- Cola del MAR (medicación offline, ADR-0012) -----------------------------

export async function putMedOutbox(record: MedOutboxRecord): Promise<void> {
  const db = await getDb();
  await db.put('medOutbox', record);
}

export async function allMedOutbox(): Promise<MedOutboxRecord[]> {
  const db = await getDb();
  return db.getAll('medOutbox');
}

export async function deleteMedOutbox(key: string): Promise<void> {
  const db = await getDb();
  await db.delete('medOutbox', key);
}

export function isMedUnsynced(r: MedOutboxRecord): boolean {
  return r.syncStatus === 'PENDING' || r.syncStatus === 'ERROR';
}
