'use client';

import * as ToastPrimitive from '@radix-ui/react-toast';
import {
  forwardRef,
  type ComponentPropsWithoutRef,
  type ElementRef,
} from 'react';
import { cn } from './cn';

// Primitivas de Toast accesibles sobre Radix (UX-08): región aria-live
// gestionada, foco con teclado (F8), descarte por gesto/teclado y pausa al
// pasar el ratón. El provider imperativo de la app compone estas piezas.
export const ToastProviderPrimitive = ToastPrimitive.Provider;
export const ToastAction = ToastPrimitive.Action;
export const ToastClose = ToastPrimitive.Close;

export const ToastViewport = forwardRef<
  ElementRef<typeof ToastPrimitive.Viewport>,
  ComponentPropsWithoutRef<typeof ToastPrimitive.Viewport>
>(({ className, ...props }, ref) => (
  <ToastPrimitive.Viewport
    ref={ref}
    className={cn(
      'fixed bottom-4 right-4 z-50 m-0 flex w-full max-w-sm list-none flex-col gap-2 p-0 outline-none',
      className,
    )}
    {...props}
  />
));
ToastViewport.displayName = 'ToastViewport';

const TONE: Record<string, string> = {
  success: 'border-green-200 bg-green-50 text-green-900',
  error: 'border-red-200 bg-red-50 text-red-900',
  info: 'border-slate-200 bg-white text-slate-900',
};

export const ToastRoot = forwardRef<
  ElementRef<typeof ToastPrimitive.Root>,
  ComponentPropsWithoutRef<typeof ToastPrimitive.Root> & { tone?: 'success' | 'error' | 'info' }
>(({ className, tone = 'info', ...props }, ref) => (
  <ToastPrimitive.Root
    ref={ref}
    className={cn(
      'flex items-center justify-between gap-3 rounded-lg border px-4 py-3 text-sm shadow-md data-[state=closed]:opacity-0 data-[swipe=end]:translate-x-full',
      TONE[tone],
      className,
    )}
    {...props}
  />
));
ToastRoot.displayName = 'ToastRoot';

export const ToastTitle = forwardRef<
  ElementRef<typeof ToastPrimitive.Title>,
  ComponentPropsWithoutRef<typeof ToastPrimitive.Title>
>(({ className, ...props }, ref) => (
  <ToastPrimitive.Title ref={ref} className={cn('text-sm', className)} {...props} />
));
ToastTitle.displayName = 'ToastTitle';
