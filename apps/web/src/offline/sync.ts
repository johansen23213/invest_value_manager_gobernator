import { trpcVanilla } from '@/trpc/vanilla';
import { allOutbox, isUnsynced, putOutbox } from './db';

export interface SyncOutcome {
  pushed: number;
  conflicts: number;
}

/**
 * Empuja los registros pendientes de la cola al servidor. Idempotente por
 * clientId: reenviar no duplica. Si falla (sin red), marca ERROR para reintentar.
 */
export async function syncOutbox(): Promise<SyncOutcome> {
  const pending = (await allOutbox()).filter(isUnsynced);
  if (pending.length === 0) return { pushed: 0, conflicts: 0 };

  try {
    const results = await trpcVanilla.care.push.mutate({
      records: pending.map((r) => ({
        clientId: r.clientId,
        residentId: r.residentId,
        type: r.type,
        recordedAt: new Date(r.recordedAt),
        payload: r.payload,
        fieldTimestamps: r.fieldTimestamps,
      })),
    });

    let conflicts = 0;
    for (const res of results) {
      const rec = pending.find((p) => p.clientId === res.clientId);
      if (!rec) continue;
      rec.status = res.conflicts > 0 ? 'CONFLICT' : 'SYNCED';
      rec.conflicts = res.conflicts;
      rec.error = undefined;
      conflicts += res.conflicts;
      await putOutbox(rec);
    }
    return { pushed: results.length, conflicts };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error de sincronización';
    for (const rec of pending) {
      rec.status = 'ERROR';
      rec.error = message;
      await putOutbox(rec);
    }
    throw error;
  }
}
