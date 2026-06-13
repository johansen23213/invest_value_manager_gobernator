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
// v2: tone "success" usa delight-* en vez de green-*; tone "info" usa navy
// en vez de slate. Entrada con animate-fade-in (respeta prefers-reduced-motion).
// API pública sin cambios — mismas props/exports que v1.

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

// Tones v2: success usa delight (verde salvia cálido), info usa navy suave.
const TONE: Record<string, string> = {
  // delight-700 sobre delight-50: 7.5:1 AAA
  success: 'border-delight-100 bg-delight-50 text-delight-700',
  // warm-700 sobre warm-50: 6.9:1 AA
  error:   'border-warm-200 bg-warm-50 text-warm-700',
  // navy/80 sobre blanco: suficiente contraste (derivado de brand-700)
  info:    'border-brand-100 bg-white text-[#1A3A3F]',
};

export const ToastRoot = forwardRef<
  ElementRef<typeof ToastPrimitive.Root>,
  ComponentPropsWithoutRef<typeof ToastPrimitive.Root> & { tone?: 'success' | 'error' | 'info' }
>(({ className, tone = 'info', ...props }, ref) => (
  <ToastPrimitive.Root
    ref={ref}
    className={cn(
      'flex items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-sm',
      'shadow-card',
      // Entrada animada (globals.css con guard prefers-reduced-motion)
      'animate-fade-in',
      // Estado cerrado: opacidad 0 (transición de salida de Radix)
      'data-[state=closed]:opacity-0 data-[swipe=end]:translate-x-full',
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
  <ToastPrimitive.Title
    ref={ref}
    className={cn('text-sm font-medium', className)}
    {...props}
  />
));
ToastTitle.displayName = 'ToastTitle';
