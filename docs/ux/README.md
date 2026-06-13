# Equipo de UX — Vetlla

> **Lead:** Elena (UX Lead)
> **Misión:** que Vetlla sea, de verdad, "para auxiliares, no para informáticos" — accesible, clara y agradable, sin sacrificar la seguridad clínica.

## Forma de trabajo

1. **Auditoría** del estado actual (ver `informes/`).
2. **Backlog priorizado** por impacto × esfuerzo; se refleja en `project_state.yaml` y/o issues.
3. **Sprints** cortos con entregables verificables (componentes, flujos).
4. **Test con usuarios reales** (auxiliares, enfermería, familias) e iteración.

## Principios de diseño (no negociables)

- **Accesibilidad WCAG 2.1 AA** como requisito, no como extra.
- **Tablet-first** para el flujo de atención directa; pocos toques, objetivos grandes.
- **Lenguaje claro** del dominio sociosanitario, nunca jerga técnica.
- **Consistencia** vía design system (`packages/ui`).
- **Seguridad clínica primero**: confirmaciones, motivos y trazabilidad donde el error tiene consecuencias.

## Documentos

- [`informes/2026-06-07-auditoria-ux.md`](informes/2026-06-07-auditoria-ux.md) — Auditoría inicial y backlog priorizado.
- [`arquetipos.md`](arquetipos.md) — Arquetipos de usuario (personas) y mapa de mejoras.
- [`medicacion-y-rbac.md`](medicacion-y-rbac.md) — Diseño priorizado de medicación (prescripción + MAR) y RBAC, con análisis del competidor (ResiPlus), delta de modelo, asistencia IA (H5) y decisiones arquitectónicas abiertas.
- [`direccion-de-arte.md`](direccion-de-arte.md) — Dirección de arte v1 "Lifecare": paleta teal/coral/crema, radios orgánicos. Referencia de base.
- [`direccion-de-arte-v2.md`](direccion-de-arte-v2.md) — Fundación Visual v2 (Ola 1, 2026-06-13): tipografía display DM Serif Display, rampa delight, motion con propósito, el Sello Vetlla, ilustraciones SVG propias, 4 componentes nuevos en @vetlla/ui. Guía completa para la Ola 2 (Dani).

## Olas de diseño

**Ola 1 — Fundación Visual v2 (2026-06-13, Elena):** sistema y tokens. No rediseña pantalla por pantalla: define el lenguaje visual, lo materializa en tokens (tailwind.config.ts, globals.css), eleva las primitivas de @vetlla/ui y añade 4 componentes nuevos de personalidad (Avatar, PageHeader, StatCard, SectionCard).

**Ola 2 — Aplicación pantalla por pantalla (pendiente, Dani):** aplica el sistema v2 a todas las rutas de la app usando la guía de la sección 8 de direccion-de-arte-v2.md.

El backlog vivo está en `project_state.yaml` (sección `ux_backlog`). Sprint 1 (UX-01…04)
implementado: fechas/horas localizadas, editor de horas de medicación, confirmación en
acciones destructivas, sistema de avisos (toasts) y motivo obligatorio al rechazar dosis.
