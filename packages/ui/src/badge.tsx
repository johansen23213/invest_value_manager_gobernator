import { cva, type VariantProps } from 'class-variance-authority';
import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from './cn';

// Badge con rounded-full y paleta Lifecare. neutral usa brand-50/700 en vez de slate.
const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium',
  {
    variants: {
      tone: {
        neutral: 'bg-brand-50 text-brand-700',
        green:   'bg-green-100 text-green-800',
        amber:   'bg-amber-100 text-amber-800',
        red:     'bg-red-100 text-red-800',
        blue:    'bg-blue-100 text-blue-800',
        warm:    'bg-warm-100 text-warm-700',
      },
    },
    defaultVariants: { tone: 'neutral' },
  },
);

export interface BadgeProps
  extends HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {
  /**
   * Icono decorativo que se renderiza como prefijo del texto.
   * Debe llevar aria-hidden="true" en el propio elemento SVG/imagen.
   * El texto del Badge es el canal principal de información (WCAG 1.4.1).
   */
  icon?: ReactNode;
}

export function Badge({ className, tone, icon, children, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ tone }), className)} {...props}>
      {icon}
      {children}
    </span>
  );
}
