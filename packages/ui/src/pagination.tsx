import { Button } from './button';
import { cn } from './cn';

// Paginación accesible para listados (UX-10).
// Controlada: el contenedor mantiene `page` y reacciona a `onPageChange`.
export interface PaginationProps {
  page: number; // 1-based
  pageCount: number;
  onPageChange: (page: number) => void;
  className?: string;
  /** Etiqueta del nav para lectores de pantalla. */
  label?: string;
}

export function Pagination({
  page,
  pageCount,
  onPageChange,
  className,
  label = 'Paginación',
}: PaginationProps) {
  if (pageCount <= 1) return null;
  const atStart = page <= 1;
  const atEnd = page >= pageCount;

  return (
    <nav
      aria-label={label}
      className={cn('flex items-center justify-between gap-3', className)}
    >
      <Button
        variant="secondary"
        size="sm"
        onClick={() => onPageChange(page - 1)}
        disabled={atStart}
        aria-label="Página anterior"
      >
        ← Anterior
      </Button>
      <span className="text-sm text-slate-600" aria-live="polite">
        Página {page} de {pageCount}
      </span>
      <Button
        variant="secondary"
        size="sm"
        onClick={() => onPageChange(page + 1)}
        disabled={atEnd}
        aria-label="Página siguiente"
      >
        Siguiente →
      </Button>
    </nav>
  );
}
