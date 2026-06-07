# ADR 0003 — Modelo de centros/plazas y expediente del residente

- **Estado:** Aceptada
- **Fecha:** 2026-06-07
- **Hito:** H2

## Contexto

H2 introduce la estructura física (centros, unidades, plazas) y el expediente
sociosanitario del residente con escalas. Decisiones de modelado y de UI.

## Decisión

- **Jerarquía:** `Center` (RESIDENCIA | CENTRO_DIA | VIVIENDA_TUTELADA) → `Unit` →
  `Bed`. El residente pertenece a un `Center` y, opcionalmente, ocupa una `Bed`.
- **Ocupación derivada, no duplicada:** la relación es 1‑1 `Resident.bedId @unique`.
  Una plaza está "ocupada" si tiene residente; `BedStatus` solo modela DISPONIBLE vs
  FUERA_SERVICIO. Evita estado redundante y dobles-reservas (unicidad en BD). Asignar/
  liberar es una única actualización (sin transacción multi-paso).
- **Expediente:** `EmergencyContact`, `Allergy`, `Diagnosis`, `Assessment` colgando del
  residente. `Assessment` guarda `type` (BARTHEL/TINETTI), `score`, `assessedAt`,
  `assessedById` y `details` (Json para desglose futuro).
- **Escalas como dominio tipado** (`apps/web/src/lib/scales.ts`): rangos válidos
  (Barthel 0–100, Tinetti 0–28) e interpretación. La API valida el rango y rechaza
  puntuaciones fuera de límite (seguridad clínica). La interpretación es informativa.
- **RLS en todas las tablas nuevas** (ENABLE + FORCE + política por `tenant_id`), en una
  migración aparte que itera sobre las tablas (mismo patrón que H1).
- **Integridad cross-tenant:** además de RLS, las mutaciones que referencian un padre
  (unidad→centro, plaza→unidad, sub‑recurso→residente) verifican su existencia vía
  `ctx.db` (consulta ya aislada por RLS) antes de insertar, evitando referencias FK a
  filas de otro tenant.
- **RBAC ampliado:** `centers:*`, `residents:*`, `clinical:write`. Auxiliar lee; dirección
  gestiona estructura y residentes; sanitario registra clínica.
- **UI:** `packages/ui` con primitivas estilo shadcn en Tailwind (sin Radix, para minimizar
  dependencias). Páginas en grupo de rutas `(app)` con shell autenticado; formularios y
  listados vía hooks tRPC + react-query (API-first). La UI oculta acciones según permisos;
  la autorización real la impone el servidor.

## Consecuencias

- Acceptance de H2 cubierto: alta de residencia y vivienda tutelada, plazas, residentes,
  expediente y escalas. Seed §13 con 2 centros (30 + 8 plazas) y 28 residentes.
- Pendientes: shadcn "real" con Radix si se necesitan modales/combobox; CIE-10 con
  catálogo; histórico de ocupación (hoy solo estado actual).
