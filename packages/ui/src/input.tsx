import { forwardRef, type InputHTMLAttributes, type SelectHTMLAttributes } from 'react';
import { cn } from './cn';

// v2: añade transition-shadow para glow en foco (shadow-glow-brand).
// El glow complementa el focus ring visible (outline brand-600 en globals.css).
// API pública sin cambios — mismas props que v1.

const fieldClasses = [
  'min-h-touch w-full rounded-2xl border border-brand-200 px-3 py-2 text-base',
  // Transición de sombra para el glow de foco (200ms — no motion crítico)
  'transition-[border-color,box-shadow] duration-150',
  // Estado focus: ring brand + glow sutil (shadow-glow-brand)
  'focus:border-brand-500 focus:outline-none',
  'focus:ring-2 focus:ring-brand-500/30',
  'focus:shadow-[0_0_0_3px_rgb(20_102_107_/_0.25)]',
  // Disabled: fondo brand-50 cálido en vez de gris
  'disabled:bg-brand-50 disabled:text-[#1A3A3F]/40 disabled:cursor-not-allowed',
].join(' ');

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input ref={ref} className={cn(fieldClasses, className)} {...props} />
  ),
);
Input.displayName = 'Input';

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, ...props }, ref) => (
    <select ref={ref} className={cn(fieldClasses, 'bg-white', className)} {...props} />
  ),
);
Select.displayName = 'Select';

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      className={cn('mb-1 block font-medium text-[#1A3A3F]', className)}
      {...props}
    />
  );
}
