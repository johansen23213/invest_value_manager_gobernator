import type { ReactNode } from 'react';

// Ilustraciones SVG inline ligeras por variante. Decorativas (aria-hidden).
function IllustrationCheck() {
  return (
    <svg aria-hidden="true" focusable="false" width="48" height="48" viewBox="0 0 48 48" fill="none">
      <circle cx="24" cy="24" r="20" fill="#f0fdfa" stroke="#0d9488" strokeWidth="1.5" />
      <path d="M15 24l6 6 12-12" stroke="#0d9488" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IllustrationEmpty() {
  return (
    <svg aria-hidden="true" focusable="false" width="48" height="48" viewBox="0 0 48 48" fill="none">
      <rect x="8" y="12" width="32" height="28" rx="4" fill="#f5f5f4" stroke="#d1d5db" strokeWidth="1.5" />
      <path d="M16 20h16M16 26h10" stroke="#9ca3af" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="36" cy="36" r="7" fill="#f0fdfa" stroke="#0d9488" strokeWidth="1.5" />
      <path d="M33 36h6M36 33v6" stroke="#0d9488" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function IllustrationAlert() {
  return (
    <svg aria-hidden="true" focusable="false" width="48" height="48" viewBox="0 0 48 48" fill="none">
      <circle cx="24" cy="24" r="20" fill="#f0fdfa" stroke="#0d9488" strokeWidth="1.5" />
      <path d="M24 14v12M24 30v2" stroke="#0d9488" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

const ILLUSTRATIONS = {
  empty: IllustrationEmpty,
  check: IllustrationCheck,
  alert: IllustrationAlert,
};

export type EmptyStateVariant = keyof typeof ILLUSTRATIONS;

/** Estado vacío con ilustración SVG inline ligera, mensaje claro y CTA opcional. */
export function EmptyState({
  title,
  description,
  action,
  variant = 'empty',
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  variant?: EmptyStateVariant;
}) {
  const Illustration = ILLUSTRATIONS[variant];
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-surface p-10 text-center">
      <div className="mb-3">
        <Illustration />
      </div>
      <p className="font-semibold text-slate-700">{title}</p>
      {description && <p className="mt-1 max-w-xs text-sm text-slate-500">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
