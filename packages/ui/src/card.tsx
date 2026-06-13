import type { HTMLAttributes } from 'react';
import { cn } from './cn';

// Tarjeta con radio Lifecare (rounded-2xl) y sombra cálida sutil.
// v2: transition-lift disponible como clase adicional para cards clickables.
// Usar cn('shadow-card transition-lift hover:shadow-card-hover', className)
// en el consumidor cuando la card sea interactiva.
// API pública sin cambios — mismos subcomponentes y props que v1.

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'rounded-2xl border border-brand-100/60 bg-white shadow-card',
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('border-b border-brand-100/50 px-6 py-4', className)}
      {...props}
    />
  );
}

export function CardTitle({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  // text-[#1A3A3F] en vez de text-slate-900 — navy cálido Lifecare.
  return (
    <h2
      className={cn('text-lg font-semibold text-[#1A3A3F]', className)}
      {...props}
    />
  );
}

export function CardContent({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('px-6 py-4', className)} {...props} />;
}
