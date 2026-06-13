import type { HTMLAttributes } from 'react';
import { cn } from './cn';

/**
 * Bloque de carga (placeholder animado).
 * v2: usa brand-100 en vez de slate-200 — tono cálido Lifecare.
 * La animación pulse es CSS pura (no motion), safe sin guard.
 */
export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('animate-pulse rounded-md bg-brand-100', className)}
      {...props}
    />
  );
}
