# Auditoría UX inicial — Vetlla

- **Autora:** Elena — UX Lead
- **Fecha:** 2026-06-07
- **Estado del producto:** MVP funcional (H0–H4 + H6; H5 IA diferido)
- **Método:** evaluación heurística (Nielsen) + revisión de los flujos reales por rol
  (Dirección, Sanitario, Auxiliar, Familia) sobre la build actual, contrastada con el
  código de `apps/web`. Sin test con usuarios todavía (siguiente paso).

---

## 1. Resumen ejecutivo

La plataforma ya **funciona y cubre el bucle de uso diario**: la arquitectura, los datos
y los flujos están bien planteados. Pero la capa de experiencia está en **estado
"funcional, no de producto"**: UI genérica sin identidad, formularios manuales, feedback
inconsistente y varias fricciones que en un entorno clínico **pueden inducir error**
(formato de fecha en inglés, pauta de medicación escrita a mano, borrados sin confirmar).

**Tesis:** con un **Sprint 1 de fundaciones + quick wins clínicos** subimos de forma
notable la percepción de producto y la seguridad, sin tocar la arquitectura. El mayor
retorno está en (1) un **design system real y accesible**, (2) **patrones de formulario y
feedback** unificados y (3) el **flujo del auxiliar en tablet**, que es quien determina la
adopción.

**Top 5 para empezar HOY:**
1. Localizar fechas/horas (hoy se ven en formato `mm/dd/yyyy` y `es-ES` fijo). → seguridad
2. Editor de horas de medicación (hoy se teclea `08:00,20:00`). → seguridad
3. Confirmación en acciones destructivas (borrar unidad/plaza). → pérdida de datos
4. Sistema de notificaciones (toasts) y manejo de errores consistente. → confianza
5. Estados de carga/vacío (skeletons) y reequilibrio del Panel. → percepción

---

## 2. Hallazgos priorizados

Impacto: **Alto / Medio / Bajo** · Esfuerzo: **S / M / L** · Prioridad: **🔴 Ya · 🟠 Sprint 1 · 🟡 Backlog**

| ID | Área | Hallazgo | Imp. | Esf. | Pri. | Dónde |
|----|------|----------|------|------|------|-------|
| UX-01 | i18n/Clínico | Fechas en formato US (`mm/dd/yyyy`) y `toLocaleString('es-ES')` fijo: en catalán y para evitar errores deben localizarse con `Intl` según el idioma activo. | Alto | S | 🔴 | `medicacion/page.tsx`, 5 usos de `toLocale*` |
| UX-02 | Clínico | La pauta horaria se introduce como texto `08:00,20:00`: propenso a error de medicación. Necesita editor de horas (chips + time pickers). | Alto | M | 🔴 | `medicacion/page.tsx` |
| UX-03 | Seguridad | Borrar unidad/plaza se ejecuta sin confirmación. | Alto | S | 🔴 | `centros/[id]/page.tsx` |
| UX-04 | Feedback | No hay sistema de notificaciones; varias mutaciones no muestran error y el "éxito" es un texto plano. | Alto | M | 🔴 | global (solo 6 ficheros tratan `.error`) |
| UX-05 | Feedback | Estados de carga = "Cargando…" en texto; sin skeletons ni estados vacíos con CTA. | Medio | M | 🟠 | 5 pantallas |
| UX-06 | IA/Layout | El Panel deja ~medio folio en blanco; falta jerarquía y accesos rápidos por rol/tareas del día. | Medio | M | 🟠 | `dashboard-client.tsx` |
| UX-07 | Fundaciones | Sin identidad visual: paleta `slate` genérica, sin tokens de marca, tipografía ni modo de contraste. | Alto | L | 🟠 | `tailwind.config`, `packages/ui` |
| UX-08 | Fundaciones | `@vetlla/ui` es mínimo: faltan Dialog, Toast, Tabs, Tooltip, Skeleton, EmptyState, FormField, DatePicker, TimeField, Combobox accesible, Pagination, DataTable. Adoptar **Radix/shadcn** para accesibilidad real (foco/teclado). | Alto | L | 🟠 | `packages/ui` |
| UX-09 | Formularios | Formularios `useState` manuales, sin validación inline ni errores por campo (reutilizar los esquemas Zod en cliente). | Alto | M | 🟠 | todas las pantallas con formulario |
| UX-10 | Listados | Sin búsqueda, filtros ni paginación (28 residentes hoy, escalará). | Alto | M | 🟠 | `residentes/page.tsx`, `centros/page.tsx` |
| UX-11 | Navegación | Sin migas de pan ni cabecera de residente persistente en subpáginas. | Medio | S | 🟡 | `medicacion`, `pia` |
| UX-12 | Expediente | Todo en una página larga; mejor en pestañas (Resumen/Clínico/Atención/Medicación/PIA). | Medio | M | 🟡 | `residentes/[id]/page.tsx` |
| UX-13 | Auxiliar | El flujo `/atencion` parte de un desplegable; a pie de cama debe partir de "mi unidad" → lista de residentes con cama y acceso de 1 toque. | Alto | M | 🟠 | `atencion/page.tsx` |
| UX-14 | Auxiliar | Tras registrar, solo un flash: falta confirmación clara, **deshacer**, y vista de "pendientes de sincronizar". | Alto | M | 🟠 | `atencion`, `use-care-sync` |
| UX-15 | Auxiliar | Entrada táctil mejorable: teclado numérico (`inputMode`), steppers de %, botones 48–56px en tablet. | Medio | S | 🟠 | `atencion/page.tsx` |
| UX-16 | Auxiliar | El indicador offline es discreto y no explica qué pasa con los datos. | Medio | S | 🟡 | `sync-status-badge.tsx` |
| UX-17 | Sanitario | MAR como lista plana; falta pase por turno, registro múltiple y **motivo obligatorio** al marcar No administrado/Rechazado. | Alto | M | 🟠 | `medicacion/page.tsx` |
| UX-18 | Sanitario/Dir. | El panel solo lista 3 alertas; falta un **centro de alertas** (no-administrado, valoraciones caducadas, PIA sin revisar). | Alto | M | 🟡 | `dashboard`, nuevo |
| UX-19 | Dirección | Ocupación como chips; añadir plano/mapa de ocupación y KPIs (% ocupación, altas/bajas). | Medio | M | 🟡 | `centros/[id]/page.tsx` |
| UX-20 | Familia | Portal correcto pero con tono "de gestión": añadir foto, último contacto y calidez; control de privacidad de lo compartido. | Medio | M | 🟡 | `portal/page.tsx` |

---

## 3. Profundización por flujo

### 3.1 Auxiliar (atención directa, tablet) — *el flujo que decide la adopción*
Es donde más se juega Vetlla y donde más margen hay. Hoy es funcional pero "de
formulario web". Prioridades: **arrancar desde la unidad/cama** (UX-13), **confirmación
con deshacer** (UX-14), **entrada táctil real** (UX-15) y **claridad del estado offline**
(UX-16). Objetivo medible: registrar un evento en **≤3 toques** y **≤10 s**.

### 3.2 Sanitario / Enfermería
El **MAR** necesita convertirse en un **pase de medicación** por turno, con registro
múltiple y motivo obligatorio en las excepciones (UX-17) — esto es seguridad del paciente,
no estética. Y un **centro de alertas** que priorice lo clínico (UX-18).

### 3.3 Dirección / gestor
Necesita **visión y KPIs**: ocupación visual, altas/bajas, alertas agregadas. El Panel hoy
desaprovecha el espacio (UX-06) y no ofrece "qué requiere mi atención hoy".

### 3.4 Familia
El portal cumple y transmite confianza, pero puede ser más **humano** (foto, novedades en
lenguaje cálido) y dar **control de privacidad** (UX-20).

---

## 4. Fundaciones / Design System (la inversión de mayor retorno)

1. **Tokens de marca** (UX-07): definir color primario/acento, tipografía (legible y con
   carácter), escala tipográfica, radios, sombras, espaciado y estados. Documentar.
2. **Componentes accesibles** (UX-08): migrar `@vetlla/ui` a **Radix + shadcn** para
   obtener gestión de foco y teclado correctas. Catálogo mínimo: `Dialog`, `Toast`,
   `Tabs`, `Tooltip`, `Skeleton`, `EmptyState`, `FormField` (label+hint+error),
   `DatePicker`/`TimeField` localizados, `Combobox`, `Pagination`, `DataTable`, `Avatar`.
3. **Patrón de formularios** (UX-09): `react-hook-form` + los **mismos esquemas Zod** del
   backend, validación inline, estados `pending`/`disabled`, errores por campo asociados
   por `aria-describedby`.

---

## 5. Accesibilidad (WCAG 2.1 AA) — auditar y corregir

- **Contraste**: revisar textos `slate-400/500` sobre blanco (varios por debajo de 4.5:1).
- **Foco visible** consistente en enlaces, chips y botones (los inputs ya lo tienen).
- **Cambios de página en SPA**: anunciar con `aria-live`/título para lectores de pantalla.
- **Errores de formulario**: asociar con `aria-describedby` y `aria-invalid`.
- **Tablas**: `caption` y `scope` en cabeceras.
- **Automatizar**: pase de **axe** en CI y en revisión de PRs.

## 6. i18n / localización

- Solo login, shell y portal están traducidos; **las pantallas de gestión no** → en
  catalán hay mezcla. Extraer todas las cadenas y completar catálogos (o adoptar un
  framework de i18n escalable).
- **Fechas/números** con `Intl` según el idioma activo (UX-01).

---

## 7. Propuesta de Sprint 1 (2 semanas) — "empezar ya"

**Objetivo:** subir el listón de producto y seguridad sin tocar arquitectura.

- **Fundaciones:** tokens de marca v1 + Radix/shadcn con `Dialog`, `Toast`, `Skeleton`,
  `FormField` (UX-07 parcial, UX-08, UX-09).
- **Quick wins clínicos:** fechas/horas localizadas (UX-01), editor de horas de
  medicación (UX-02), confirmación en destructivos (UX-03), toasts + errores (UX-04),
  motivo obligatorio en No administrado (parte de UX-17).
- **Auxiliar:** lista "mi unidad" de 1 toque + confirmación con deshacer (UX-13, UX-14).
- **A11y:** pase axe y corrección de contraste/foco.

**Criterio de cierre:** flujos de auxiliar y medicación rediseñados sobre el nuevo design
system, axe sin errores críticos, y demo actualizada.

## 8. Métricas UX a instrumentar

- Toques y tiempo para registrar un evento de atención (objetivo ≤3 / ≤10 s).
- % de registros offline sincronizados sin error / sin duplicado.
- % de dosis administradas a tiempo vs. no administradas.
- Errores de validación por sesión.
- **SUS** y entrevistas con auxiliares/enfermería.
- Adopción por rol (usuarios activos diarios por perfil).

## 9. Roadmap UX (más allá de Sprint 1)

Design system completo + modo oscuro · búsqueda global · pestañas de expediente · plano de
ocupación · onboarding guiado de centro · **UX del copiloto de IA** (cuando llegue H5:
confirmación humana, edición de borradores, transparencia de lo que propone la IA).

---

*Siguiente paso recomendado:* convertir los ítems 🔴/🟠 en tareas en `project_state.yaml`
o issues, y agendar 2–3 sesiones de observación con auxiliares reales para validar UX-13/14.
