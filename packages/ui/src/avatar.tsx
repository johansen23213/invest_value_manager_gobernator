import type { HTMLAttributes } from 'react';
import { cn } from './cn';

// Avatar con iniciales y color estable derivado del nombre.
// Extrae la lógica de ResidentAvatar + nameColorIndex + AVATAR_PALETTES
// del resident-chrome.tsx a un componente genérico reutilizable.
// Uso: avatares de residente, usuario en nav, listas de equipo, portal familias.
// WCAG: aria-hidden="true" — las iniciales son decorativas; el texto del nombre
// debe estar en el contexto circundante para lectores de pantalla.

/** Genera un índice de color (0–7) estable a partir de cualquier string. */
function nameColorIndex(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash << 5) - hash + name.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash) % 8;
}

// Paleta Lifecare v2: teal, coral, y colores complementarios armoniosos.
// No usar slate, zinc ni gray — rompen la coherencia cromática.
const AVATAR_PALETTES = [
  { bg: 'bg-brand-100',   text: 'text-brand-800',   ring: 'ring-brand-200'   },
  { bg: 'bg-warm-100',    text: 'text-warm-800',     ring: 'ring-warm-200'    },
  { bg: 'bg-violet-100',  text: 'text-violet-800',   ring: 'ring-violet-200'  },
  { bg: 'bg-sky-100',     text: 'text-sky-800',      ring: 'ring-sky-200'     },
  { bg: 'bg-emerald-100', text: 'text-emerald-800',  ring: 'ring-emerald-200' },
  { bg: 'bg-rose-100',    text: 'text-rose-800',     ring: 'ring-rose-200'    },
  { bg: 'bg-amber-100',   text: 'text-amber-800',    ring: 'ring-amber-200'   },
  { bg: 'bg-indigo-100',  text: 'text-indigo-800',   ring: 'ring-indigo-200'  },
] as const;

const SIZE_CLASSES = {
  sm: 'h-8 w-8 text-xs font-semibold',
  md: 'h-12 w-12 text-base font-bold',
  lg: 'h-16 w-16 text-xl font-bold ring-2',
} as const;

export interface AvatarProps extends HTMLAttributes<HTMLDivElement> {
  /** Nombre completo del que se derivan las iniciales y el color. */
  name: string;
  /** Tamaño del avatar. Default: "md" (48×48px, cumple min-touch 44px). */
  size?: keyof typeof SIZE_CLASSES;
}

/**
 * Avatar de iniciales con color estable derivado del nombre.
 *
 * ```tsx
 * <Avatar name="Marta Puig" size="md" />
 * <Avatar name="Josep Sala" size="lg" aria-label="Josep Sala" />
 * ```
 *
 * WCAG: el div es aria-hidden por defecto. Si el avatar está solo (sin texto
 * de nombre visible), añadir aria-label al propio Avatar para que el lector
 * de pantalla anuncie el nombre.
 */
export function Avatar({ name, size = 'md', className, ...props }: AvatarProps) {
  // Derivar iniciales: primera letra del primer y último token del nombre.
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.charAt(0) ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1]?.charAt(0) ?? '') : '';
  const initials = `${first}${last}`.toUpperCase();

  const idx = nameColorIndex(name);
  const palette = AVATAR_PALETTES[idx] ?? AVATAR_PALETTES[0]!;
  const sizeClass = SIZE_CLASSES[size];

  return (
    <div
      aria-hidden="true"
      className={cn(
        'flex shrink-0 items-center justify-center rounded-full',
        // El sello Vetlla en avatares lg: anillo exterior (ring) en el color de la paleta
        size === 'lg' ? palette.ring : '',
        palette.bg,
        palette.text,
        sizeClass,
        className,
      )}
      {...props}
    >
      {initials}
    </div>
  );
}
