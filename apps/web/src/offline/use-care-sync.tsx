'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { allOutbox, isUnsynced, putOutbox } from './db';
import { syncOutbox } from './sync';
import type { CarePayload, OutboxRecord } from './types';
import type { CareRecordType } from '@vetlla/db';

interface EnqueueInput {
  residentId: string;
  residentName?: string;
  type: CareRecordType;
  payload: CarePayload;
}

interface CareSyncContextValue {
  online: boolean;
  pending: number;
  enqueue: (input: EnqueueInput) => Promise<void>;
  syncNow: () => Promise<void>;
}

const CareSyncContext = createContext<CareSyncContextValue | null>(null);

export function CareSyncProvider({ children }: { children: ReactNode }) {
  const [online, setOnline] = useState(true);
  const [pending, setPending] = useState(0);

  const refresh = useCallback(async () => {
    const all = await allOutbox();
    setPending(all.filter(isUnsynced).length);
  }, []);

  const syncNow = useCallback(async () => {
    try {
      await syncOutbox();
    } catch {
      // sin red: queda en cola, se reintenta
    } finally {
      await refresh();
    }
  }, [refresh]);

  const enqueue = useCallback(
    async (input: EnqueueInput) => {
      const now = new Date().toISOString();
      const fieldTimestamps: Record<string, string> = {};
      for (const key of Object.keys(input.payload)) fieldTimestamps[key] = now;

      const record: OutboxRecord = {
        clientId: crypto.randomUUID(),
        residentId: input.residentId,
        residentName: input.residentName,
        type: input.type,
        recordedAt: now,
        payload: input.payload,
        fieldTimestamps,
        status: 'PENDING',
        createdAt: now,
      };
      await putOutbox(record);
      await refresh();
      if (typeof navigator !== 'undefined' && navigator.onLine) await syncNow();
    },
    [refresh, syncNow],
  );

  useEffect(() => {
    setOnline(navigator.onLine);
    const handleOnline = () => {
      setOnline(true);
      void syncNow();
    };
    const handleOffline = () => setOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    void refresh();
    void syncNow();
    const interval = setInterval(() => {
      if (navigator.onLine) void syncNow();
    }, 15_000);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearInterval(interval);
    };
  }, [refresh, syncNow]);

  return (
    <CareSyncContext.Provider value={{ online, pending, enqueue, syncNow }}>
      {children}
    </CareSyncContext.Provider>
  );
}

export function useCareSync(): CareSyncContextValue {
  const ctx = useContext(CareSyncContext);
  if (!ctx) throw new Error('useCareSync debe usarse dentro de CareSyncProvider');
  return ctx;
}
