import type { HTMLAttributes } from 'react';
import { cn } from './cn';

/** Bloque de carga (placeholder animado). */
export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('animate-pulse rounded-md bg-slate-200', className)} {...props} />;
}
