import type { HTMLAttributes, TdHTMLAttributes, ThHTMLAttributes } from 'react';
import { cn } from './cn';

// v2: Th usa brand-50 de fondo y brand-700 para el texto (en vez de slate-600).
// Td usa border-brand-100/40 en vez de border-slate-100.
// API pública sin cambios — mismas props que v1.

export function Table({ className, ...props }: HTMLAttributes<HTMLTableElement>) {
  return (
    <div className="overflow-x-auto">
      <table className={cn('w-full border-collapse text-left text-sm', className)} {...props} />
    </div>
  );
}

export function Th({ className, ...props }: ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      className={cn(
        // brand-50 de fondo, brand-700 texto — tabla con identidad Lifecare
        'border-b border-brand-100 bg-brand-50 px-3 py-2 font-semibold text-brand-700',
        className,
      )}
      {...props}
    />
  );
}

export function Td({ className, ...props }: TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td
      className={cn(
        // brand-100/40 en vez de slate-100 — coherencia cromática
        'border-b border-brand-100/40 px-3 py-2 text-[#1A3A3F]',
        className,
      )}
      {...props}
    />
  );
}
