# ADR 0006 — Portal de familias, i18n y accesibilidad

- **Estado:** Aceptada
- **Fecha:** 2026-06-07
- **Hito:** H6

## Contexto

H6 cierra el bucle del MVP: portal de solo lectura para familias, internacionalización
es-ES/ca-ES y pulido de accesibilidad en los flujos de auxiliar y familia.

## Decisión

- **Portal de familias** con `FamilyLink` (usuario familiar ↔ residente). Doble
  aislamiento: RLS por tenant + filtro por `FamilyLink` del usuario autenticado. El
  router `family.portal` devuelve un **resumen minimizado** (datos básicos, novedades
  recientes, medicación activa, alergias, valoraciones) y nada más. El familiar tiene
  solo el permiso `portal:read`; sus intentos de listar residentes devuelven FORBIDDEN.
  La shell le muestra navegación reducida y el panel de gestión redirige a `/portal`.
- **i18n propio y ligero** (sin dependencia de routing por locale). Cookie
  `vetlla-locale`, catálogos `es`/`ca`, `translate()` puro con interpolación, provider
  cliente (`useT`) + helper servidor (`getT`) y selector de idioma. `<html lang>` se fija
  según la cookie. Cobertura completa de los flujos de entrada (login), la shell y el
  **portal de familias**; las pantallas de gestión quedan en castellano (extensión
  mecánica añadiendo claves).
- **Accesibilidad (WCAG 2.1 AA)**: enlace "saltar al contenido", `lang` correcto, regiones
  `nav`/`main` etiquetadas, `aria-live` en el estado de sincronización, `aria-pressed` en
  el selector de idioma, etiquetas asociadas en formularios y objetivos táctiles ≥44px
  (botones/inputs del paquete `ui`). El color nunca es el único indicador (los badges
  llevan texto).

## Alternativas consideradas

- **next-intl con routing `[locale]`:** potente pero exige reestructurar todas las rutas y
  más configuración; el enfoque por cookie es suficiente para es/ca y evita churn. Si se
  necesitan URLs por idioma o SEO multi-idioma, se migrará.

## Consecuencias

- Acceptance cubierto: el familiar ve el resumen de su residente y nada más (verificado:
  portal devuelve solo el vinculado; `residents.list` → FORBIDDEN). i18n es/ca verificado
  (login y shell traducidos, `html lang` cambia).
- Pendiente: traducir las pantallas de gestión al catalán; valenciano u otras lenguas
  cooficiales si se requieren; auditoría de contraste automatizada (axe) en CI.
- Superadmin de plataforma no opera dentro de un tenant (sin consola propia en el MVP).
