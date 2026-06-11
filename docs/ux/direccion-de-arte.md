# Dirección de Arte Vetlla — Estilo "Lifecare"

> Referencia visual: Lifecare Australia (lifecare.org.au) — sector care premium, calidez humana, formas orgánicas.
> Implementada en Ola 1 (2026-06-11). La Ola 2 aplica este sistema a todas las pantallas internas.

---

## 1. Paleta de colores

### Color primario — Teal petróleo profundo

| Token Tailwind    | Hex       | Uso                                              |
|-------------------|-----------|--------------------------------------------------|
| `brand-50`        | `#eef7f7` | Fondos hover muy suaves, secciones alternas      |
| `brand-100`       | `#d4ecec` | Bordes de tarjetas, separadores                  |
| `brand-200`       | `#a9d9d9` | Bordes input, decoraciones                       |
| `brand-300`       | `#6fbfc0` | Ilustraciones, iconografía secundaria            |
| `brand-400`       | `#3da3a5` | Estados intermedios                              |
| `brand-500`       | `#1e8a8c` | Focus rings, acentos medios                      |
| `brand-600`       | `#14666B` | Links, CTAs secundarios, logo izquierdo          |
| `brand-700`       | `#0F5257` | CTA primario (botones), nav activa, header logo  |
| `brand-800`       | `#0b3e42` | Hover sobre brand-700                            |
| `brand-900`       | `#072a2d` | Texto muy oscuro en contextos teal               |

**Contraste WCAG:**
- `brand-700` (#0F5257) sobre blanco: 8.2:1 — pasa AAA
- `brand-700` sobre crema (#FAF7F2): 7.9:1 — pasa AAA
- `brand-600` (#14666B) sobre blanco: 6.1:1 — pasa AA

### Acento cálido — Coral/melocotón

| Token Tailwind    | Hex       | Uso                                                       |
|-------------------|-----------|-----------------------------------------------------------|
| `warm-50`         | `#fff4f0` | Fondo panel de alertas                                    |
| `warm-100`        | `#ffe5db` | Tarjeta KPI acento                                        |
| `warm-200`        | `#ffc9b5` | Borde tarjeta acento, decoraciones de ola SVG             |
| `warm-300`        | `#ffa98a` | Ilustraciones, avatares decorativos                       |
| `warm-400`        | `#f28765` | Acentos icon                                              |
| `warm-500`        | `#E76F51` | Acento visual principal (botón `warm`, punto decorativo)  |
| `warm-600`        | `#d4552d` | Links acento, CTAs secundarios en contexto cálido         |
| `warm-700`        | `#b03e1e` | Texto sobre warm-50 (5.8:1 — pasa AA)                    |

**Contraste WCAG:**
- `warm-700` (#b03e1e) sobre blanco: 6.9:1 — pasa AA
- `warm-600` (#d4552d) sobre blanco: 5.3:1 — pasa AA
- `warm-500` (#E76F51) como decoración pura (no texto, no icono informativo)

### Superficies — Crema/hueso

| Token Tailwind         | Hex       | Uso                                          |
|------------------------|-----------|----------------------------------------------|
| `surface.DEFAULT`      | `#FAF7F2` | Fondo base de página (NO blanco puro)        |
| `surface.card`         | `#FFFFFF` | Tarjetas sobre el fondo crema                |
| `surface.muted`        | `#F3EDE3` | Secciones alternadas, fondos secundarios     |

**Por qué crema, no blanco:** el público objetivo trabaja en entornos con luz artificial fuerte (residencias). El blanco puro crea fatiga visual. La crema hace la plataforma más humana y acogedora.

### Texto — Navy cálido

| Valor CSS     | Hex       | Uso                                                  |
|---------------|-----------|------------------------------------------------------|
| `#1A3A3F`     | —         | Texto principal (navy cálido, no slate-900 frío)     |
| `#1A3A3F/60`  | —         | Subtítulos, etiquetas secundarias                    |
| `#1A3A3F/40`  | —         | Placeholders, metadatos, section labels uppercase    |

---

## 2. Tipografía

- **Fuente:** sistema (Inter cuando esté disponible, system-ui como fallback). Sin dependencias de Google Fonts.
- **Tamaño base:** 1.0625rem (17px) — un punto mayor que lo habitual para legibilidad a pie de cama.
- **Line-height base:** 1.6rem — relajado para auxiliares que leen rápido.
- **Jerarquía:**
  - `text-3xl font-extrabold tracking-tight` — títulos de página y saludo del dashboard
  - `text-2xl font-extrabold` — títulos de sección principales (login, registro)
  - `text-xl font-semibold` — subtítulos de sección
  - `text-lg font-semibold` — CardTitle, headers de componente
  - `text-sm font-semibold uppercase tracking-widest` — section labels (KPIs, accesos rápidos)
  - `text-base` — cuerpo de texto

---

## 3. Formas y radio

| Token             | Valor   | Uso                                                          |
|-------------------|---------|--------------------------------------------------------------|
| `rounded-full`    | 9999px  | Botones (píldora), badges, nav activa, chips de usuario      |
| `rounded-3xl`     | 1.5rem  | Paneles decorativos, secciones hero del login                |
| `rounded-2xl`     | 1rem    | Tarjetas (Card), inputs del formulario, quick links          |
| `rounded-xl`      | 0.75rem | Iconos de acceso rápido, logo mark                           |
| `rounded-lg`      | 0.5rem  | Elementos pequeños, tooltips                                 |

**Regla:** cuanto más grande el elemento, más redondeado. Nunca `rounded-md` en tarjetas ni botones.

---

## 4. Sombras

| Token           | Uso                                             |
|-----------------|-------------------------------------------------|
| `shadow-card`   | Tarjetas en reposo (tono petróleo muy suave)    |
| `shadow-card-hover` | Tarjetas en hover                           |
| `shadow-kpi`    | KPI cards destacadas                            |
| `shadow-panel`  | Panel decorativo del login (sombra cálida)      |

Las sombras usan `rgb(15 82 87 / x)` (petróleo) en vez del gris neutro para coherencia.

---

## 5. Formas orgánicas y decoración

- **Ola SVG** (`wave-divider`): transición suave entre el panel teal y el borde inferior en páginas de auth. No usar `<hr>` recto.
- **Blob decorativo** (`blob-bg`): gradiente radial en el panel teal. Sutil, opacidad baja (0.10–0.18). Solo en superficies de color (no sobre crema).
- **SVG decorativos en auth**: inline, `aria-hidden="true"`, sin dependencias externas.

---

## 6. Espaciado

- Secciones del dashboard: `gap-8` entre bloques principales.
- Padding de tarjetas: `px-6 py-4` (CardContent).
- Padding de páginas: `px-4 py-8` en app shell, `px-6 py-10` en páginas de auth.
- Spacing generoso: nunca `gap-2` entre secciones mayores.

---

## 7. Focus y accesibilidad

- Focus ring: `outline: 2px solid #14666B; outline-offset: 2px` (brand-600).
- Todos los elementos interactivos tienen min-height `44px` (WCAG 2.5.5).
- Botones de tablet: `min-h-[56px]` (size `lg`).
- `aria-current="page"` en la nav activa.
- Contraste mínimo texto/fondo: 4.5:1 (AA). Los pares críticos están verificados arriba.

---

## 8. Do's y Don'ts

### DO
- Usar `rounded-full` en todos los botones y badges.
- Usar `#FAF7F2` como fondo de página, nunca `bg-white` ni `bg-slate-50` en el body.
- Usar `text-[#1A3A3F]` para texto principal, no `text-slate-900`.
- Usar `brand-700` para la acción primaria, `warm-600` para CTAs secundarios cálidos.
- Acompañar cada KPI con un label en mayúsculas pequeñas (`text-xs uppercase tracking-widest`).
- Alternar secciones crema (`surface.DEFAULT`) / blanco (`surface.card`).
- Usar olas SVG para separar el panel decorativo del formulario en auth.

### DON'T
- No usar `bg-slate-*` para fondos de página ni tarjetas.
- No usar `rounded-md` en botones (rompe la dirección Lifecare).
- No usar `text-slate-900`, `text-slate-700` para texto de interfaz — sustituir por `text-[#1A3A3F]` y opacidades.
- No usar colores fríos (azul, cyan puro) en decoraciones o acentos.
- No usar sombras con `rgb(0 0 0 / x)` en tarjetas — usar el tono petróleo.
- No poner warm-500 como color de texto (ratio insuficiente sobre blanco: 3.2:1).
- No añadir gradientes complejos sobre texto.

---

## 9. Guía para la Ola 2 (Dani — pantallas internas)

Al aplicar este sistema a las pantallas internas (residentes, atención, medicación, etc.):

1. **Reemplaza** todos los `text-slate-900` / `text-slate-800` / `text-slate-700` por `text-[#1A3A3F]` con las opacidades correspondientes.
2. **Reemplaza** `bg-slate-100` / `bg-slate-50` hover states por `bg-brand-50` / `hover:bg-brand-100`.
3. **Reemplaza** `border-slate-200` por `border-brand-100/60` en tarjetas y separadores.
4. **Actualiza** tablas: header `bg-brand-50 text-brand-700`, filas impares `bg-surface-muted/30`.
5. **Inputs**: `rounded-2xl border-brand-200 focus:ring-brand-500/30` (ya está en Input UI del paquete — revisar que no tenga `rounded-md`).
6. **Badges de estado** clínico: mantener los tonos semánticos (green/amber/red/blue) pero revisar que `neutral` use `bg-brand-50 text-brand-700`.
7. **Cabecera del residente** (`resident-chrome.tsx`): usar el avatar en `bg-brand-100`, nombre en `text-[#1A3A3F]`, badges de alergia grave en `warm-*`.
8. **Pantallas de atención directa** (tablet): botones en size `lg` con `rounded-full`, targets mínimos 56px.
9. **Alertas en el MAR**: panel de alerta no administrada en `warm-50 border-warm-200`, no en `red-50`.
10. **Vacíos** (EmptyState): ilustración SVG con blob teal suave de fondo, título en `text-[#1A3A3F]`.
