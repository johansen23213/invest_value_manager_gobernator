import { cn } from '@vetlla/ui';

// Logotipo de Vetlla: marca "V" en teal + wordmark.
export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <span
        aria-hidden
        className="flex h-7 w-7 items-center justify-center rounded-md bg-brand-700 text-sm font-extrabold text-white"
      >
        V
      </span>
      <span className="text-lg font-extrabold tracking-tight text-slate-900">Vetlla</span>
    </span>
  );
}
