import { cn } from '@vetlla/ui';

// Logotipo de Vetlla: marca "V" en teal con degradado sutil + wordmark.
export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <span
        aria-hidden
        className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-brand-600 to-brand-800 text-sm font-extrabold text-white shadow-sm"
      >
        V
      </span>
      <span className="text-lg font-extrabold tracking-tight text-slate-900">Vetlla</span>
    </span>
  );
}
