# Rediseño "efecto wow" — Informe y backlog
Autora: Elena — UX Lead · Fecha: 2026-06-11
Sprint: rediseño visual y de interacción del MVP tras primera prueba en local.

---

## Diagnóstico inicial

La app era funcional pero genérica: cards blancas con borde gris, fondo blanco puro,
jerarquía visual plana, dashboard vacío de significado. Para una demo a una directora
o para la adopción diaria de un auxiliar, el primer impacto era neutro.

Problemas concretos identificados:

1. **Dashboard**: título "Panel" + 3 KPIs de texto plano. Sin saludo, sin fecha, sin
   jerarquía entre "qué necesita atención ahora" y "datos de contexto".
2. **Cabecera del residente**: nombre en texto, sin avatar, sin edad calculada, alergias
   en chips idénticos independientemente de la severidad. Una ALERGIA GRAVE no
   destacaba visualmente más que "leve".
3. **Paleta**: teal en toda la superficie, sin acento cálido. Un SaaS de cuidado de
   personas no debería parecer una fintech.
4. **Cards**: `rounded-xl` con `shadow-sm`, correctas pero sin personalidad.
5. **Estados vacíos**: `EmptyState` funcional pero sin ilustración ni CTA visual.
6. **Header**: `max-w-5xl`, fondo blanco plano, sin backdrop blur, controles de usuario
   sin agrupación visual.
7. **Focus ring**: heredado del navegador, inconsistente entre elementos.
8. **Body**: fondo blanco puro, sin calidez.

---

## Mejoras implementadas

### 1. Identidad visual — tokens (Alta)

**Ficheros:** `apps/web/tailwind.config.ts`, `apps/web/src/app/globals.css`

- Paleta `warm` (amber/terracota, 9 tonos) como acento cálido para elementos "humanos":
  saludos, KPIs de alerta, estado vacío positivo.
- Token `surface` (blanco hueso `#fafaf9`) aplicado al `body` y fondo general.
- Tokens de sombra: `shadow-card` (muy sutil), `shadow-card-hover`, `shadow-kpi`.
- `border-radius` extendido a `2xl`/`3xl` para las cards y quick links.
- Focus ring consistente (`#0d9488`, 2px) vía `:focus-visible` global.
- Animación `animate-fade-in-up` (respecta `prefers-reduced-motion`) para cards del
  dashboard.
- Clase utilitaria `transition-smooth` para transiciones de color/sombra.

### 2. Dashboard — efecto wow n.1 (Alta)

**Fichero:** `apps/web/src/app/(app)/dashboard-client.tsx`

- **Saludo personalizado** con nombre del usuario y franja horaria (buenos días/tardes/
  noches) en 3 variantes, con fecha localizada via `Intl`.
- **Panel "Necesita atención ahora"**: banner verde (todo ok) o rojo prominente con
  dosis sin administrar + lista de residentes afectados, enlace directo.
- **KPIs visuales mejorados**: tipografía extralarge, sub-labels, animación de entrada.
- **Anillo de ocupación SVG**: ring circular sin dependencias externas que muestra el
  % visualmente; cambia de color (verde/amber/rojo) según el nivel de ocupación.
- **Quick links** rediseñados: tarjetas con icono en contenedor teal, hover con borde
  brand, descripciones contextuales según idioma (es/ca).
- Toda la string es i18n: claves `dashboard.*` y `resident.*` añadidas a es y ca.

### 3. Cabecera del residente — efecto wow n.2 (Alta)

**Fichero:** `apps/web/src/app/(app)/residentes/[id]/resident-chrome.tsx`

- **Avatar con iniciales**: `[A-Z][A-Z]` del nombre y apellido, con color estable
  derivado de un hash del nombre (8 paletas, consistente entre sesiones).
- **Edad calculada**: a partir de `birthDate` del residente, con fallback a
  "Edad no registrada". Formato: "78 años · n. 15 mar 1947" localizado.
- **Banner ALERGIA GRAVE**: las alergias con `severity === 'GRAVE'` ahora muestran
  un banner rojo sólido ancho con texto en negrita, claramente diferenciado de las
  alergias no-graves (que siguen siendo chips compactos). Conserva `data-testid=
  "allergy-banner"` y `role="list"` para los tests e2e existentes.
- Subtítulo de metadatos reorganizado: edad · grado dependencia · centro/plaza.

### 4. Layout/header (Media)

**Fichero:** `apps/web/src/app/(app)/layout.tsx`

- Sticky header con `backdrop-blur-sm` y fondo semitransparente.
- Nav links con `rounded-lg` y `transition-smooth`.
- `max-w-6xl` (era `max-w-5xl`) para aprovechar mejor pantallas de dirección/PC.
- Indicador de usuario con fondo `bg-slate-100` tipo pill.
- Skip-to-content link añadido correctamente (WCAG 2.4.1), estaba ausente.

### 5. Logo (Baja)

**Fichero:** `apps/web/src/components/logo.tsx`

- El contenedor de la "V" ahora tiene `rounded-xl` y degradado `from-brand-600
  to-brand-800` con `shadow-sm`. Más pulido.

### 6. Card component (Media)

**Fichero:** `packages/ui/src/card.tsx`

- `rounded-xl` → `rounded-2xl`.
- `shadow-sm` → `shadow-card` (token propio, más sutil que el Tailwind por defecto).
- `CardTitle` con `text-slate-900` explícito.

### 7. EmptyState con ilustraciones SVG (Media)

**Fichero:** `packages/ui/src/empty-state.tsx`

- Tres variantes de ilustración SVG inline: `empty` (por defecto), `check` (estado
  positivo) y `alert`.
- `variant` prop opcional con `'empty'` por defecto; retrocompatible con todo el
  código existente que no pasa `variant`.
- Fondo `bg-surface` y borde `rounded-2xl border-slate-200` (vs el anterior dashed).

### 8. i18n (es + ca)

**Fichero:** `apps/web/src/i18n/dictionaries.ts`

Claves añadidas: `dashboard.greeting.*`, `dashboard.kpi.*`, `dashboard.attention`,
`dashboard.medAlert`, `resident.age`, `resident.ageBirthDate`, `resident.noBirthDate`,
`resident.allergyBannerGrave`, `resident.allergyBannerOther`, `empty.alerts.*`.
Todas con paridad es/ca verificada por el test de paridad (se añadió el bloque
`paridad es/ca — Rediseño Dashboard + Residente`).

---

## Verificación final

```
pnpm typecheck   OK — sin errores
pnpm lint        OK — solo warning pre-existente (resumen/page.tsx, no en nuestros cambios)
pnpm --filter @vetlla/web test   160/160 pasan (3 tests nuevos de paridad i18n)
pnpm build       OK — build completo, 27 rutas
```

---

## Backlog priorizado (lo que NO dio tiempo)

| # | Mejora | Impacto | Esfuerzo | Prioridad |
|---|--------|---------|----------|-----------|
| 1 | **MAR filtrado por turno** (mañana / tarde / noche): la pantalla de medicación hoy muestra todas las dosis del día; David (DUE) necesita ver solo las de su turno. Requiere lógica de franja horaria y posiblemente un campo de turno en el perfil de usuario. | Alto (seguridad clínica) | Medio | Alta |
| 2 | **Lista "Mis residentes" para auxiliar**: al entrar como AUXILIAR, el dashboard debería mostrar directamente la lista de residentes asignados a su unidad/turno, no el panel de KPIs de dirección. Requiere modelo de asignación de unidad por usuario. | Alto (adopción auxiliar) | Medio | Alta |
| 3 | **Exportación de KPIs / informe mensual**: Carmen (directora) necesita exportar ocupación y KPIs del mes en PDF o Excel para el Consejo de Administración. Requiere una ruta de server-side rendering del informe. | Alto (demo/ventas) | Medio | Alta |
| 4 | **Animación de entrada en el anillo de ocupación**: el SVG ring ya tiene `transition: stroke-dashoffset` pero como el valor se hidrata al cargar, la animación no se ve. Resolver con un useEffect que active el valor final tras el primer render. | Bajo | Bajo | Media |
| 5 | **Modo oscuro**: la paleta está completamente en modo claro. Añadir soporte `dark:` via Tailwind y respetar `prefers-color-scheme`. Requiere revisitar todos los tokens de color. | Medio (experiencia nocturna del auxiliar) | Alto | Backlog |
| 6 | **Notificaciones push para familiar**: Josep necesita un aviso en su móvil cuando hay una novedad. Requiere Web Push API + service worker avanzado. | Alto (portal familiar) | Alto | Backlog |
| 7 | **Estado vacío con CTA contextual en residentes**: cuando no hay residentes, el EmptyState debería incluir un botón "Dar de alta el primer residente" como `action` prop. Cambio menor. | Bajo | Bajo | Media |
| 8 | **Indicador de nav activo**: los links del header no tienen estado activo visual (no hay `aria-current` en la nav global). Requiere hacer el nav un Client Component para usar `usePathname`. | Bajo | Bajo | Media |

---

## Deuda técnica identificada (no UX)

- El hook `useMemo` de `doses` en `resumen/page.tsx` tiene una advertencia de
  react-hooks/exhaustive-deps (pre-existente, no introducida por nosotros).
- El `max-w-5xl` del main en el layout es coherente con `max-w-6xl` del header;
  se ha uniformizado a `max-w-6xl`. Si hay tests e2e que dependan de breakpoints
  de contenedor específicos, revisar.
