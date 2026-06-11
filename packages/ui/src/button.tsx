import { cva, type VariantProps } from 'class-variance-authority';
import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cn } from './cn';

// Objetivos táctiles amplios (min 44px) para el flujo de auxiliares.
// Forma píldora (rounded-full) conforme a la dirección de arte Lifecare.
const buttonVariants = cva(
  'inline-flex min-h-touch items-center justify-center rounded-full font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-60',
  {
    variants: {
      variant: {
        primary:   'bg-brand-700 text-white hover:bg-brand-800 active:bg-brand-900',
        secondary: 'border border-brand-200 bg-white text-brand-700 hover:bg-brand-50 active:bg-brand-100',
        danger:    'bg-red-600 text-white hover:bg-red-700',
        ghost:     'text-brand-700 hover:bg-brand-50 active:bg-brand-100',
        warm:      'bg-warm-500 text-white hover:bg-warm-600 active:bg-warm-700',
      },
      size: {
        md: 'px-5 py-2 text-base',
        sm: 'px-3.5 py-1.5 text-sm',
        lg: 'min-h-[56px] px-6 py-3 text-lg', // tablet / pie de cama
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, type = 'button', ...props }, ref) => (
    <button ref={ref} type={type} className={cn(buttonVariants({ variant, size }), className)} {...props} />
  ),
);
Button.displayName = 'Button';
