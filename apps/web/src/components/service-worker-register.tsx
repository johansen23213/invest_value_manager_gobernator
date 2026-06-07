'use client';

import { useEffect } from 'react';

export function ServiceWorkerRegister() {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        // El registro del SW es best-effort; la app funciona sin él.
      });
    }
  }, []);
  return null;
}
