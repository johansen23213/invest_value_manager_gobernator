import { cva, type VariantProps } from 'class-variance-authority';
import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cn } from './cn';

// Objetivos táctiles amplios (min 44px) para el flujo de auxiliares.
const buttonVariants = cva(
  'inline-flex min-h-touch items-center justify-center rounded-md font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 disabled:cursor-not-allowed disabled:opacity-60',
  {
    variants: {
      variant: {
        primary: 'bg-slate-900 text-white hover:bg-slate-700',
        secondary: 'border border-slate-300 bg-white text-slate-900 hover:bg-slate-100',
        danger: 'bg-red-600 text-white hover:bg-red-700',
        ghost: 'text-slate-700 hover:bg-slate-100',
      },
      size: {
        md: 'px-4 py-2 text-base',
        sm: 'px-3 py-1.5 text-sm',
        lg: 'min-h-[56px] px-5 py-3 text-lg', // tablet / pie de cama
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
