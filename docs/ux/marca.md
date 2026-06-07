# Marca — Vetlla (v1)

- **Autora:** Elena — UX Lead · **Fecha:** 2026-06-07

## Concepto

**Vetlla** viene de *vetllar* (catalán): velar, cuidar, estar al lado. La identidad debe
transmitir **calma, cercanía y confianza** — es un producto de salud usado por personas con
prisa y consultado por familias preocupadas.

## Color

- **Primario (marca):** teal — transmite cuidado/salud sin caer en el azul corporativo
  genérico. Escala `brand` (Tailwind), acción principal `brand-700` (#0f766e), hover
  `brand-800`.
- **Neutros:** slate para texto y superficies.
- **Estados (no marca):** verde = activo/en línea; ámbar = aviso/pendiente; rojo = alerta.
  El verde puro se reserva para estados, no para acciones, para no competir con el teal.
- **Tokens:** definidos en `apps/web/tailwind.config.ts` (`colors.brand.50..900`).

## Tipografía

- v1: stack de sistema (legible, rendimiento, sin dependencia de red). Tamaño base elevado
  (1.0625rem) por legibilidad a pie de cama.
- Pendiente: incorporar una tipográfica propia con `next/font/local` cuando dispongamos de
  los ficheros (el entorno actual bloquea la descarga de fuentes web).

## Logotipo

- Marca "V" en cuadrado redondeado `brand-700` + wordmark "Vetlla" (`components/logo.tsx`).
- Icono PWA (`public/icon.svg`) y `theme_color` alineados al teal de marca.

## Aplicación (UX-07)

- Botón primario, focus rings y enlaces usan la marca (`brand-700`).
- Login con fondo degradado suave `brand-50 → slate-50` y logotipo.

## Pendiente (UX-08)

Migrar `@vetlla/ui` a primitivas accesibles (Radix/shadcn) y completar el catálogo
(Dialog, Tabs, Tooltip, DatePicker localizado…) sobre estos tokens.
