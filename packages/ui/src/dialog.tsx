'use client';

import * as DialogPrimitive from '@radix-ui/react-dialog';
import {
  forwardRef,
  type ComponentPropsWithoutRef,
  type ElementRef,
} from 'react';
import { cn } from './cn';

// Dialog accesible sobre Radix (UX-08): focus-trap, scroll-lock, retorno de
// foco, cierre con Escape y aria-modal correctos sin esfuerzo manual.
// v2: overlay navy cálido (en vez de slate-900), sombra shadow-dialog profunda,
// animate-scale-in en apertura (respeta prefers-reduced-motion via CSS global),
// DialogTitle usa navy cálido, DialogDescription usa navy/60.
// API pública sin cambios — mismos exports que v1.

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;
export const DialogPortal = DialogPrimitive.Portal;

export const DialogOverlay = forwardRef<
  ElementRef<typeof DialogPrimitive.Overlay>,
  ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    // navy cálido en vez de slate-900 — coherencia con la paleta
    className={cn('fixed inset-0 z-50 bg-[#1A3A3F]/50', className)}
    {...props}
  />
));
DialogOverlay.displayName = 'DialogOverlay';

export const DialogContent = forwardRef<
  ElementRef<typeof DialogPrimitive.Content>,
  ComponentPropsWithoutRef<typeof DialogPrimitive.Content>
>(({ className, children, ...props }, ref) => (
  <DialogPortal>
    <DialogOverlay />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        // Posición centrada
        'fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2',
        // Superficie y forma Lifecare
        'rounded-2xl bg-white p-6',
        // Sombra profunda dialog v2 (shadow-dialog)
        'shadow-[0_24px_64px_0_rgb(15_82_87_/_0.20),0_8px_24px_-4px_rgb(15_82_87_/_0.10)]',
        // Entrada animada — la clase animate-scale-in está en globals.css con
        // guard prefers-reduced-motion, por lo que es segura aquí.
        'animate-scale-in',
        'focus:outline-none',
        className,
      )}
      {...props}
    >
      {children}
    </DialogPrimitive.Content>
  </DialogPortal>
));
DialogContent.displayName = 'DialogContent';

export const DialogTitle = forwardRef<
  ElementRef<typeof DialogPrimitive.Title>,
  ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    // navy cálido en vez de slate-900
    className={cn('text-lg font-semibold text-[#1A3A3F]', className)}
    {...props}
  />
));
DialogTitle.displayName = 'DialogTitle';

export const DialogDescription = forwardRef<
  ElementRef<typeof DialogPrimitive.Description>,
  ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    // navy/60 en vez de slate-600
    className={cn('mt-2 text-sm text-[#1A3A3F]/60', className)}
    {...props}
  />
));
DialogDescription.displayName = 'DialogDescription';

export function DialogFooter({
  className,
  ...props
}: ComponentPropsWithoutRef<'div'>) {
  return (
    <div
      className={cn('mt-6 flex justify-end gap-2', className)}
      {...props}
    />
  );
}
