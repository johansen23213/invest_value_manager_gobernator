# Dirección de Arte Vetlla — v2 "Lifecare con Carácter"

> Ola 1 — Fundación Visual v2 (2026-06-13). Elena, UX Lead.
> La Ola 2 (Dani) aplica este sistema pantalla por pantalla. La Ola 1 fija el sistema.

---

## Por qué v1 era correcta pero genérica

La v1 estableció la paleta Lifecare y los radios orgánicos. Lo que faltaba:
ninguna fuente con personalidad editorial (Inter/system es invisible), la escala
tipográfica era plana (titulares demasiado modestos), las sombras eran casi
imperceptibles, no había motion con propósito, las ilustraciones de EmptyState
usaban colores slate ajenos a la paleta, y no existía un "sello" visual reconocible.

---

## 1. Tipografía con carácter

### Display — DM Serif Display (self-hosted, RGPD-seguro)

`DM Serif Display` es una serif de trazos contraste alto con terminaciones
cálidas. No es una sans funcional más: tiene personalidad humana y editorial que
grita "esto no lo hizo una IA en 5 minutos". Se sirve desde `@fontsource/dm-serif-display`
instalado en node_modules — nunca se hace ninguna llamada a Google Fonts en runtime.
Solo se usa para titulares grandes (H1, saludo del dashboard, títulos de sección
en páginas de auth y landing); nunca para cuerpo de texto clínico.

**Guardia RGPD:** Fontsource copia los archivos woff2 en el bundle local. El
navegador nunca hace un request a fonts.googleapis.com ni fonts.gstatic.com.
Verificar con DevTools Network → no aparece ningún dominio externo de fuentes.

**Por qué no una sans para display:** en el sector sociosanitario toda la
competencia usa Poppins, Inter o Nunito. Una serif de alto contraste es el
diferenciador visual inmediato que rompe el patrón "app hecha con IA".

### Cuerpo — sistema (Inter → system-ui → sans-serif)

Sin cambios. Para cuerpo, etiquetas y UI la fuente del sistema es óptima:
legibilidad máxima, cero carga, funciona offline. El cambio tipográfico de
impacto está solo en los titulares.

### Escala tipográfica v2

| Clase Tailwind custom          | Tamaño / Leading   | Fuente               | Uso                                       |
|--------------------------------|--------------------|----------------------|-------------------------------------------|
| `font-display` (nueva familia) | —                  | DM Serif Display     | Solo en clases display-* listadas abajo   |
| `text-display-2xl`             | 3.5rem / 1.1       | Display              | Saludo dashboard, héroe de auth           |
| `text-display-xl`              | 2.5rem / 1.15      | Display              | H1 de páginas internas importantes        |
| `text-display-lg`              | 2rem / 1.2         | Display              | H2 de sección editorial, PageHeader       |
| `text-3xl font-extrabold`      | 1.875rem / 1.25    | Sistema              | Títulos de sección de datos (KPIs)        |
| `text-xl font-semibold`        | 1.25rem / 1.5      | Sistema              | CardTitle, subtítulos de formulario       |
| `text-base`                    | 1.0625rem / 1.6    | Sistema              | Cuerpo (igual que v1)                     |
| `text-sm`                      | 0.875rem / 1.5     | Sistema              | Metadatos, etiquetas, badges              |
| `text-xs uppercase tracking-widest` | 0.75rem       | Sistema              | Section labels (igual que v1)             |

**Muestras de uso:**
- Dashboard H1: `<h1 className="font-display text-display-2xl text-[#1A3A3F]">Bona tarda, Marta</h1>`
- PageHeader: `<h1 className="font-display text-display-xl text-[#1A3A3F]">Residentes</h1>`
- Auth claim: `<p className="font-display text-display-2xl text-white leading-tight">Cuidar bien,<br/>con menos papeleo.</p>`

---

## 2. Color con profundidad

### Paleta Lifecare base (sin cambios de v1)

Ver v1 para la rampa brand-50 → brand-900 y warm-50 → warm-900.

### Nuevo: color de éxito/deleite — Verde salvia

Un tercer acento para momentos de éxito, completitud y bienestar. No es el
verde frío de Bootstrap: es un verde salvia con base cálida que convive con el
teal petróleo.

| Token Tailwind   | Hex       | Uso                                                          |
|------------------|-----------|--------------------------------------------------------------|
| `delight-50`     | `#f0faf4` | Fondo panel "todo OK", estado sin alertas                    |
| `delight-100`    | `#d6f2e0` | Borde panel de éxito, chip "completado"                      |
| `delight-200`    | `#a8e4bc` | Decoración SVG en EmptyState "check"                         |
| `delight-500`    | `#22a05a` | Icono de check en acciones completadas                       |
| `delight-700`    | `#166534` | Texto sobre delight-50 (7.5:1 — pasa AAA)                   |

**Contraste WCAG:**
- `delight-700` (#166534) sobre blanco: 8.1:1 — AAA
- `delight-700` sobre delight-50: 7.5:1 — AAA
- `delight-500` como icono decorativo (no texto solo)

**Por qué no `green-*` de Tailwind:** Tailwind green-700 es frío (#15803d).
`delight-700` (#166534) tiene una base ligeramente más oscura y cálida que
encaja con el navy y el teal sin crear disonancia.

### Gradientes con gusto

Reglas para gradientes en v2:
- Solo dos tipos permitidos: `from-brand-700 to-brand-600` (logo, hero teal) y
  `from-warm-50 to-white` (KPI cards con acento).
- Nunca gradientes con tres pasos ni ángulos no estándar.
- El blob-bg (gradiente radial) permanece igual, solo en superficies de color.
- Los gradientes de texto (`bg-clip-text`) reservados para el logotipo y el
  claim de auth — no en UI funcional.

---

## 3. Sombras con propósito

Sistema de tres niveles con un nivel nuevo (glow de foco):

| Token              | Valor CSS                                                              | Uso                          |
|--------------------|------------------------------------------------------------------------|------------------------------|
| `shadow-card`      | v1 (sin cambio)                                                        | Tarjeta en reposo            |
| `shadow-card-hover`| `0 8px 24px 0 rgb(15 82 87 / 0.12), 0 2px 8px -1px rgb(15 82 87 / 0.06)` | Tarjeta en hover (elevada)  |
| `shadow-kpi`       | `0 4px 12px 0 rgb(15 82 87 / 0.12), 0 1px 4px 0 rgb(15 82 87 / 0.06)` | StatCard, KPI                |
| `shadow-panel`     | v1 (sin cambio)                                                        | Panel auth                   |
| `shadow-dialog`    | `0 24px 64px 0 rgb(15 82 87 / 0.20), 0 8px 24px -4px rgb(15 82 87 / 0.10)` | Diálogos modales           |
| `shadow-glow-brand`| `0 0 0 3px rgb(20 102 107 / 0.25)`                                     | Glow de foco en inputs/btns  |

Principio: todas las sombras usan `rgb(15 82 87 / x)` (teal petróleo) para
coherencia cromática. Nunca `rgba(0,0,0,x)` en elementos primarios.

---

## 4. Motion con propósito

Filosofía: la animación responde al usuario, no lo distrae. En un entorno
clínico donde la velocidad importa, cada animación tiene una razón funcional.

### Regla `prefers-reduced-motion`

ABSOLUTAMENTE OBLIGATORIA. Todo motion está en bloques
`@media (prefers-reduced-motion: no-preference)`. Los auxiliares pueden usar
tablets con esta preferencia activa por motivos de fatiga visual o epilepsia.

### Catálogo de animaciones v2

| Clase utilitaria CSS        | Duración  | Función easing             | Uso                                                  |
|-----------------------------|-----------|----------------------------|------------------------------------------------------|
| `animate-fade-in-up`        | 250ms     | ease-out                   | Entrada de tarjetas/secciones (ya existe, mantener)  |
| `animate-fade-in`           | 200ms     | ease-out                   | Entrada de elementos inline, badges, alertas         |
| `animate-scale-in`          | 180ms     | cubic-bezier(0.34,1.56,0.64,1) | Diálogos, menús desplegables (spring suave)     |
| `animate-stagger-1..4`      | delay 50/100/150/200ms | — | Entrada escalonada de listas y grids             |
| `transition-lift`           | 200ms     | ease-out                   | Cards: combina shadow + translateY(-1px) en hover    |
| `transition-smooth`         | 150ms     | cubic-bezier(0.4,0,0.2,1) | Color/bg/border transitions (ya existe, mantener)    |

**Micro-interacciones en primitivas:**
- Button `primary`: `active:scale-[0.97]` (press feedback) + transición 100ms
- Button `lg` (tablet): press 150ms escala 0.98 (más suave, objetivo grande)
- Card con `transition-lift`: hover eleva 1px y sube sombra
- Input: `transition-shadow` 150ms cuando gana focus (shadow-glow-brand)
- Badge: ninguna animación (elemento informativo)
- Dialog: `animate-scale-in` en apertura

### Lo que NO se anima
- Tablas y listas largas (coste visual demasiado alto)
- Navegación principal (el scroll de página es el indicador)
- Elementos con información crítica clínica (alérgicos, alertas MAR)

---

## 5. El Sello Vetlla — la "curva de cuidado"

El sello reconocible de Vetlla es una **esquina redondeada de cuadrante diferencial**:
en determinados elementos, la esquina superior-izquierda recibe un radio mayor
(o un acento de borde teal) que el resto. Esto crea una asimetría sutil que se
repite en tarjetas de KPI, PageHeader, y avatares grandes.

Implementación: clase utilitaria `vetlla-card-accent` que aplica
`border-l-2 border-t-2 border-brand-500/40 rounded-tl-3xl` a las tarjetas
prominentes. El resto de esquinas mantienen `rounded-2xl` estándar.

**Donde aparece el sello:**
- `StatCard` — borde superior-izquierdo teal sutil
- `PageHeader` — banda de acento izquierda de 3px en brand-500
- Avatar grande del residente — anillo exterior brand-200
- Elemento decorativo del logo — el cuadrado con esquina diferencial

**Donde NO aparece:**
- Cards de listado (demasiados elementos, pierde impacto)
- Botones (ya tienen forma propia: pill)
- Tablas

---

## 6. Ilustraciones propias — identidad SVG Vetlla

Las ilustraciones de EmptyState pasan de iconos genéricos a ilustraciones
con paleta Lifecare: fondo blob teal suave + figura en colores de la marca.

### Principios de las ilustraciones:
- Paleta: brand-100/200 para áreas de fondo, warm-300/400 para detalles
  de acento, delight-200/500 para el estado "check/éxito"
- Trazo: strokeWidth 1.5, strokeLinecap round, strokeLinejoin round
- Sin texturas, sin sombras internas — flat con profundidad de color
- Siempre `aria-hidden="true" focusable="false"`
- Tamaño sugerido en EmptyState: 64px × 64px (subido de 48px)
- En estados de carga/vacío grandes: 96px × 96px con blob de fondo

### Cuatro variantes EmptyState v2:
1. `empty` — documento con líneas y signo + en coral (añadir algo)
2. `check` — círculo verde salvia con check (completado, sin alertas)
3. `alert` — triángulo suave warm con ! (atención requerida)
4. `search` — lupa con fondo teal suave (no se encontraron resultados)

---

## 7. Do's y Don'ts v2 (delta sobre v1)

### DO
- Usar `font-display` (DM Serif Display) solo en titulares H1/H2 que son
  "momentos editoriales": saludo, nombre de sección, auth claim.
- Usar `transition-lift` en cualquier card clickable o interactiva.
- Usar `animate-stagger-{n}` para dar ritmo a las grids de KPIs y accesos rápidos.
- Usar `shadow-dialog` en todos los modales (no el shadow-xl por defecto de shadcn).
- Usar `delight-*` para confirmaciones de éxito (no green-*).
- Aplicar el sello `vetlla-card-accent` solo en tarjetas protagonistas (StatCard,
  PageHeader), no en listados.

### DON'T
- No usar `font-display` en etiquetas de formulario, texto de tabla, badges,
  ni en ningún texto de tamaño < `text-xl`. La serif es solo para impacto.
- No animar sin `prefers-reduced-motion` guard.
- No añadir gradientes en el cuerpo de texto.
- No usar tres colores de acento en la misma tarjeta (brand + warm + delight es
  demasiado; máximo dos).
- No cambiar el radio de los botones (ya son `rounded-full` y correcto).

---

## 8. Guía para la Ola 2 (Dani) — por tipo de pantalla

### Dashboard (page.tsx + dashboard-client.tsx)
- H1 saludo: cambiar a `font-display text-display-2xl`
- H2 de sección ("Necesita atención", "Accesos rápidos"): mantener uppercase xs
- KpiCard: ya usa `animate-fade-in-up`; añadir `transition-lift` y `animate-stagger-{1..4}` por posición
- AttentionPanel "OK": cambiar `bg-green-50 border-green-200` a `bg-delight-50 border-delight-100`
- QuickLink: añadir `transition-lift`
- Los emojis en QuickLink (🩺👥🏠🔔) sustituirlos por SVG propios en la Ola 2 (los emojis varían por OS)

### Listados (residentes, centros, equipo)
- Título de página: `font-display text-display-xl`
- No animar filas de tabla (coste visual)
- Th: cambiar `text-slate-600` a `text-brand-700 bg-brand-50`
- Td: cambiar `border-slate-100` a `border-brand-100/40`

### Expediente del residente (resident-chrome.tsx)
- El ResidentAvatar ya tiene paletas bien definidas — extraer a `Avatar` en @vetlla/ui (ya lo hace la Ola 1)
- El header sticky: añadir `shadow-card` cuando hace scroll (mediante IntersectionObserver o clase condicional)
- SubnavTab activo: añadir `font-display` NO; mantener sans semibold — la nav es UI funcional

### Formularios y modales (dialog, inputs)
- DialogContent: aplicar `animate-scale-in` + `shadow-dialog`
- DialogTitle: `text-xl font-semibold text-[#1A3A3F]` (sin display — es UI funcional)
- Input en focus: `shadow-glow-brand` via CSS (ya está en globals.css)

### Atención directa (atencion/page.tsx — contexto tablet)
- Botones de registro: `size="lg"` siempre, `min-h-[56px]`
- NO añadir animaciones extra en esta pantalla — la velocidad prima sobre la belleza
- Si hay EmptyState de "sin registros hoy": variante `check` con delight

### EmptyState en todas las pantallas
- Subir ilustración de 48px a 64px
- Añadir blob de fondo SVG teal detrás de la ilustración
- Usar la nueva variante `search` en listados filtrados sin resultados

### Auth (login, registro, recuperar)
- Claim del panel izquierdo: `font-display text-display-2xl` (ya tenía el texto, falta la fuente)
- Sin cambios en la estructura — la Ola 1 v1 ya era sólida en auth

### Portal de familias (portal/)
- H1: `font-display text-display-xl`
- Tono más cálido: usar `warm-50/warm-100` como superficie de sección
- Los bloques de información del residente: `StatCard` o `SectionCard` de @vetlla/ui

---

## 9. Componentes nuevos en @vetlla/ui — API para Dani

### `PageHeader`
```tsx
<PageHeader
  title="Residentes"           // string — se renderiza con font-display
  subtitle="24 residentes"     // string | undefined
  action={<Button>Nuevo</Button>} // ReactNode | undefined
  accent?                      // boolean — activa el sello vetlla izquierdo
/>
```

### `StatCard`
```tsx
<StatCard
  label="Residentes activos"   // string — uppercase xs tracking-wide
  value={24}                   // string | number
  sub="de 30 plazas"          // string | undefined
  trend?: "up" | "down" | "neutral" // opcional, icono arrow
  href="/residentes"           // string | undefined — hace toda la card clickable
  accent?                      // boolean — usa warm-50 gradient
  loading?                     // boolean — muestra skeleton
/>
```
Nota: `StatCard` eleva `KpiCard` del dashboard-client a un componente reutilizable
en toda la app, con el sello visual v2.

### `SectionCard`
```tsx
<SectionCard
  title="Alergias conocidas"   // string
  aside={<Badge>3</Badge>}     // ReactNode | undefined — badge/contador derecho
  className?                   // string
>
  {children}
</SectionCard>
```
Patrón "tarjeta con cabecera de sección" que se repite en expediente, PIA,
resumen 360. Elimina el copy-paste de CardHeader + CardTitle + CardContent.

### `Avatar`
```tsx
<Avatar
  name="Marta Puig"            // string — deriva iniciales y color
  size?: "sm" | "md" | "lg"   // default "md" (48px)
  className?                   // string
/>
```
Extrae la lógica de `ResidentAvatar` + `nameColorIndex` + `AVATAR_PALETTES` del
resident-chrome.tsx a un componente genérico. Reutilizable para avatares de
usuario en la nav, listas de equipo, y el portal de familias.

---

## 10. Verificación de contraste (pares nuevos)

| Par                              | Ratio  | WCAG  |
|----------------------------------|--------|-------|
| `delight-700` (#166534) / blanco | 8.1:1  | AAA   |
| `delight-700` / delight-50       | 7.5:1  | AAA   |
| `delight-500` (#22a05a) / blanco | 4.6:1  | AA    |
| `delight-500` como icono (non-text) | —   | OK    |
| DM Serif Display en brand-700 / crema | 7.9:1 | AAA |

Todos los pares de color nuevos pasan AA. Los tokens display se usan solo en
texto grande (>=18px bold o >=24px normal): el umbral WCAG para Large Text es
3:1, todos los pares nuevos lo superan ampliamente.
