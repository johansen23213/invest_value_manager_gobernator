'use client';

import * as TabsPrimitive from '@radix-ui/react-tabs';
import {
  forwardRef,
  type ComponentPropsWithoutRef,
  type ElementRef,
} from 'react';
import { cn } from './cn';

// Tabs accesible sobre Radix (UX-08): navegación por teclado (flechas),
// roles tab/tablist/tabpanel y gestión de foco.
// v2: border-brand-100 en vez de border-slate-200; colores de texto navy cálido.
// API pública sin cambios.

export const Tabs = TabsPrimitive.Root;

export const TabsList = forwardRef<
  ElementRef<typeof TabsPrimitive.List>,
  ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    // brand-100 en vez de slate-200 — coherencia cromática Lifecare
    className={cn('flex flex-wrap gap-1 border-b border-brand-100', className)}
    {...props}
  />
));
TabsList.displayName = 'TabsList';

export const TabsTrigger = forwardRef<
  ElementRef<typeof TabsPrimitive.Trigger>,
  ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      // Base: min-h-touch para accesibilidad táctil (WCAG 2.5.5)
      'min-h-touch -mb-px rounded-t-md border-b-2 border-transparent px-4 py-2 text-sm font-medium',
      // Colores navy cálido en vez de slate-600/slate-900
      'text-[#1A3A3F]/60 transition-smooth hover:text-[#1A3A3F]',
      // Hover: borde brand suave
      'hover:border-brand-200',
      // Foco accesible
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500',
      // Estado activo: borde brand-700 + texto brand-800
      'data-[state=active]:border-brand-700 data-[state=active]:text-brand-800 data-[state=active]:font-semibold',
      className,
    )}
    {...props}
  />
));
TabsTrigger.displayName = 'TabsTrigger';

export const TabsContent = forwardRef<
  ElementRef<typeof TabsPrimitive.Content>,
  ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn('mt-4 focus-visible:outline-none', className)}
    {...props}
  />
));
TabsContent.displayName = 'TabsContent';
