import { cn } from './cn';

/**
 * Mensaje de error inline bajo un campo de formulario (UX-09). No renderiza nada si
 * no hay mensaje. Usa role="alert" para que el lector de pantalla lo anuncie.
 */
export function FieldError({ id, children, className }: { id?: string; children?: string; className?: string }) {
  if (!children) return null;
  return (
    <p id={id} role="alert" className={cn('mt-1 text-sm text-red-600', className)}>
      {children}
    </p>
  );
}
