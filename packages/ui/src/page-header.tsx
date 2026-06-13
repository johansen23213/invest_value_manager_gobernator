import type { ReactNode } from 'react';
import { cn } from './cn';

// PageHeader — cabecera de página con jerarquía editorial y sello Vetlla.
// El título usa font-display (DM Serif Display) para dar personalidad diferencial.
// La banda de acento izquierda (vetlla-accent-bar) aplica el "sello" cuando accent=true.
// API: title, subtitle, action, accent, className.

export interface PageHeaderProps {
  /** Título principal — se renderiza con DM Serif Display (font-display). */
  title: string;
  /** Subtítulo o conteo opcional (p. ej. "24 residentes"). */
  subtitle?: string;
  /**
   * Acción principal (botón, link, etc.) posicionado a la derecha del título.
   * Se renderiza tal cual — el consumidor gestiona el Button.
   */
  action?: ReactNode;
  /**
   * Activa el sello Vetlla: banda de acento brand-500 en el borde izquierdo.
   * Usar en páginas con PageHeader prominente (listados principales, dashboards).
   * NO usar en subpáginas con mucho contenido (añade demasiado ruido visual).
   */
  accent?: boolean;
  className?: string;
}

/**
 * Cabecera de página con jerarquía editorial y sello Vetlla opcional.
 *
 * ```tsx
 * <PageHeader
 *   title="Residentes"
 *   subtitle="24 residentes activos"
 *   action={<Button size="md">Nuevo residente</Button>}
 *   accent
 * />
 * ```
 */
export function PageHeader({
  title,
  subtitle,
  action,
  accent = false,
  className,
}: PageHeaderProps) {
  return (
    <div
      className={cn(
        'mb-6 flex flex-wrap items-end justify-between gap-3',
        // El sello: banda izquierda brand-500 cuando accent=true.
        // vetlla-accent-bar está definido en globals.css (apps/web).
        // En consumidores fuera de la app web, aplicar manualmente pl-4 border-l-[3px] border-brand-500.
        accent && 'vetlla-accent-bar',
        className,
      )}
    >
      <div>
        {/* DM Serif Display para el título — carácter editorial, no sans genérica */}
        <h1 className="font-display text-display-xl text-[#1A3A3F]">{title}</h1>
        {subtitle && (
          <p className="mt-0.5 text-sm text-[#1A3A3F]/60">{subtitle}</p>
        )}
      </div>
      {action && (
        <div className="shrink-0">{action}</div>
      )}
    </div>
  );
}
