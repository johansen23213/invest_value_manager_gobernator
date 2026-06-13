import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from './cn';

// SectionCard — tarjeta con cabecera de sección.
// Patrón "CardHeader + CardTitle + CardContent" que se repite en expediente,
// PIA, resumen 360 y centros. Lo extrae a un componente reutilizable.
// v2: usa la paleta Lifecare (brand-100 en vez de slate-200).
// API: title, aside, className, children.

export interface SectionCardProps extends HTMLAttributes<HTMLDivElement> {
  /** Título de la sección (texto, no display — es UI funcional). */
  title: string;
  /**
   * Elemento a la derecha del título (p. ej. badge con conteo, botón de acción).
   * Se renderiza tal cual en el lado derecho de la cabecera.
   */
  aside?: ReactNode;
}

/**
 * Tarjeta con cabecera de sección reutilizable.
 *
 * ```tsx
 * <SectionCard title="Alergias conocidas" aside={<Badge tone="red">3</Badge>}>
 *   <AllergyList />
 * </SectionCard>
 *
 * <SectionCard
 *   title="Diagnósticos activos"
 *   aside={<Button size="sm" variant="ghost">Añadir</Button>}
 * >
 *   <DiagnosesList />
 * </SectionCard>
 * ```
 */
export function SectionCard({
  title,
  aside,
  className,
  children,
  ...props
}: SectionCardProps) {
  return (
    <div
      className={cn(
        'rounded-2xl border border-brand-100/60 bg-white shadow-card',
        className,
      )}
      {...props}
    >
      {/* Cabecera */}
      <div className="flex items-center justify-between border-b border-brand-100/50 px-6 py-4">
        {/* text-lg font-semibold — UI funcional, no display */}
        <h2 className="text-lg font-semibold text-[#1A3A3F]">{title}</h2>
        {aside && (
          <div className="shrink-0">{aside}</div>
        )}
      </div>

      {/* Contenido */}
      <div className="px-6 py-4">{children}</div>
    </div>
  );
}
