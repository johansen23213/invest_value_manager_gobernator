import type { ReactNode } from 'react';

// Ilustraciones SVG inline con paleta Lifecare v2:
// - brand-100/200 para fondos y blob
// - warm-300/400 para acentos de acción (signo +)
// - delight-200/500 para estados de éxito
// - brand-300/400 para ilustración de búsqueda
// Todas: aria-hidden="true" focusable="false" — decorativas.
// Tamaño: 64×64 (subido de 48px para más impacto visual).
// API pública: mismas props + variante nueva "search" (EmptyStateVariant ampliado).

function BlobBackground() {
  // Blob teal suave como fondo de la ilustración — sello Vetlla en estado vacío.
  return (
    <circle
      cx="32"
      cy="32"
      r="28"
      fill="url(#blob-grad)"
      opacity="0.18"
    />
  );
}

function IllustrationEmpty() {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      width="64"
      height="64"
      viewBox="0 0 64 64"
      fill="none"
    >
      <defs>
        <radialGradient id="blob-grad" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#a9d9d9" />
          <stop offset="100%" stopColor="#eef7f7" />
        </radialGradient>
      </defs>
      <BlobBackground />
      {/* Documento */}
      <rect x="16" y="14" width="32" height="38" rx="4" fill="#d4ecec" stroke="#6fbfc0" strokeWidth="1.5" />
      {/* Líneas de contenido */}
      <path d="M22 26h20M22 32h14" stroke="#1e8a8c" strokeWidth="1.5" strokeLinecap="round" />
      {/* Signo + coral — acento "añadir algo" */}
      <circle cx="44" cy="46" r="9" fill="#fff4f0" stroke="#ffc9b5" strokeWidth="1.5" />
      <path d="M40 46h8M44 42v8" stroke="#E76F51" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function IllustrationCheck() {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      width="64"
      height="64"
      viewBox="0 0 64 64"
      fill="none"
    >
      <defs>
        <radialGradient id="blob-grad-check" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#a8e4bc" />
          <stop offset="100%" stopColor="#f0faf4" />
        </radialGradient>
      </defs>
      {/* Blob delight */}
      <circle cx="32" cy="32" r="28" fill="url(#blob-grad-check)" opacity="0.25" />
      {/* Círculo de éxito */}
      <circle cx="32" cy="32" r="20" fill="#d6f2e0" stroke="#22a05a" strokeWidth="1.5" />
      {/* Checkmark */}
      <path
        d="M21 32l7 7 15-15"
        stroke="#166534"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IllustrationAlert() {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      width="64"
      height="64"
      viewBox="0 0 64 64"
      fill="none"
    >
      <defs>
        <radialGradient id="blob-grad-alert" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#ffc9b5" />
          <stop offset="100%" stopColor="#fff4f0" />
        </radialGradient>
      </defs>
      {/* Blob warm */}
      <circle cx="32" cy="32" r="28" fill="url(#blob-grad-alert)" opacity="0.25" />
      {/* Triángulo de atención con esquinas redondeadas — forma Lifecare */}
      <path
        d="M32 14L8 52h48L32 14z"
        fill="#ffe5db"
        stroke="#ffa98a"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      {/* ! interior */}
      <path d="M32 28v12" stroke="#b03e1e" strokeWidth="2.5" strokeLinecap="round" />
      <circle cx="32" cy="44" r="1.5" fill="#b03e1e" />
    </svg>
  );
}

function IllustrationSearch() {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      width="64"
      height="64"
      viewBox="0 0 64 64"
      fill="none"
    >
      <defs>
        <radialGradient id="blob-grad-search" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#a9d9d9" />
          <stop offset="100%" stopColor="#eef7f7" />
        </radialGradient>
      </defs>
      {/* Blob teal */}
      <circle cx="32" cy="32" r="28" fill="url(#blob-grad-search)" opacity="0.18" />
      {/* Lupa */}
      <circle cx="28" cy="28" r="12" fill="#d4ecec" stroke="#6fbfc0" strokeWidth="1.5" />
      <circle cx="28" cy="28" r="7" fill="#eef7f7" />
      {/* Mango */}
      <path d="M37 37l9 9" stroke="#14666B" strokeWidth="2.5" strokeLinecap="round" />
      {/* Líneas dentro de la lupa — "sin resultados" */}
      <path d="M24 28h8" stroke="#3da3a5" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

const ILLUSTRATIONS = {
  empty:  IllustrationEmpty,
  check:  IllustrationCheck,
  alert:  IllustrationAlert,
  search: IllustrationSearch,
};

export type EmptyStateVariant = keyof typeof ILLUSTRATIONS;

/**
 * Estado vacío con ilustración SVG inline ligera, mensaje claro y CTA opcional.
 * v2: ilustraciones con paleta Lifecare (brand/warm/delight), tamaño 64px,
 * blob de fondo integrado, texto en navy cálido en vez de slate.
 * Nueva variante "search" para listados filtrados sin resultados.
 * API pública: mismas props que v1 + variante "search" adicional.
 */
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
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-brand-200 bg-surface p-10 text-center">
      <div className="mb-4">
        <Illustration />
      </div>
      {/* navy cálido en vez de slate-700 */}
      <p className="font-semibold text-[#1A3A3F]">{title}</p>
      {description && (
        <p className="mt-1 max-w-xs text-sm text-[#1A3A3F]/60">{description}</p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
