import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { OutboxRecord } from './types';

interface VetllaDB extends DBSchema {
  outbox: { key: string; value: OutboxRecord };
}

let dbPromise: Promise<IDBPDatabase<VetllaDB>> | null = null;

function getDb() {
  if (!dbPromise) {
    dbPromise = openDB<VetllaDB>('vetlla-offline', 1, {
      upgrade(db) {
        db.createObjectStore('outbox', { keyPath: 'clientId' });
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

export function isUnsynced(r: OutboxRecord): boolean {
  return r.status === 'PENDING' || r.status === 'ERROR';
}
