# Diseño UX — Medicación (prescripción + MAR) y RBAC

## Documento de referencia para el rediseño de ambas áreas

- **Autora:** Elena — UX Lead
- **Fecha:** 2026-06-09
- **Hito objetivo:** H4 (MAR y prescripción), H5 (asistencia IA), backlog RBAC avanzado
- **Base de código analizada:**
  - `packages/db/prisma/schema.prisma` — modelos `Medication`, `MedicationAdministration`, `Allergy`, `Diagnosis`, `AuditLog`
  - `apps/web/src/lib/rbac.ts` — enum `UserRole`, `ROLE_PERMISSIONS`, `permissionsFor`
  - `apps/web/src/lib/mar.ts` — `computeSchedule`, `groupByShift`, `DueDose`, `DoseStatus`
  - `apps/web/src/app/(app)/residentes/[id]/medicacion/page.tsx` — MAR y prescripción actuales
  - `apps/web/src/server/routers/medications.ts` — endpoints tRPC
  - `apps/web/src/components/confirm.tsx` — patrón de confirmación con motivo
  - `packages/ui/src/` — componentes disponibles: `Badge`, `Card`, `Button`, `Dialog`, `Tabs`, `Toast`, `Input`, `Table`

---

## 1. Principios de diseño que guían ambas áreas

El rediseño no busca la paridad funcional con ResiPlus: su fortaleza —y nuestro diferencial— es que cada pantalla tiene un solo dueño (el auxiliar, el sanitario, la dirección) y que ese dueño puede operar en su flujo con el mínimo de decisiones, el máximo de seguridad y sin necesidad de formación técnica. Para medicación esto significa separar radicalmente la prescripción (un acto clínico, esporádico, de sanitario con tiempo) del pase de medicación (un acto operativo, repetido 3–4 veces al día, de auxiliar o enfermera con prisa y tablet en mano); para RBAC significa que ningún director debería necesitar leer una matriz de 12 × 8 para saber qué puede hacer un fisioterapeuta en su centro. En ambas áreas: el color nunca es el único canal de estado (siempre icono + texto + color), los objetivos táctiles son de 48–56 px mínimo, y toda acción con consecuencias clínicas exige confirmación y queda en el AuditLog.

---

## 2. Medicación — Rediseño UX

### 2.1 Separación de vistas: Prescripción (sanitario) vs. MAR (auxiliar/enfermería, tablet)

El problema central de ResiPlus es que muestra ambas en la misma rejilla densa. Vetlla ya tiene la separación correcta en el router (`medication:prescribe` vs. `medication:administer`) pero la UI las mezcla en una sola página. El rediseño las separa por ruta y por rol visible.

---

#### Vista A — Prescripción (rol SANITARIO y DIRECTOR)

**Ruta:** `/residentes/[id]/medicacion/prescribir` (nueva) o modal dentro de la página de medicación, accesible solo si `canPrescribe`.

**Jerarquía y componentes:**

```
Cabecera de tratamiento (Card)
  [Fecha orden] [Prescriptor: nombre del usuario] [Diagnóstico relacionado (Select, opcional)]
  [Alerta roja si el residente tiene alergias registradas] ← banner prominente, no campo Observaciones

Línea de prescripción (formulario multistep o sección colapsable)
  Paso 1 — Fármaco
    Fármaco (Input con autocompletar/Combobox, nombre del medicamento)
    Dosis (Input: unidad structured, p. ej. "500 mg")
    Unidad/forma farmacéutica (Select: comprimido / cápsula / solución / parche / inyectable / inhalador...)
    Vía de administración (Select: oral / sublingual / subcutánea / intramuscular / tópica / inhalatoria...)
    Tipo (Select: crónico / agudo / a demanda [PRN])
    Patología/diagnóstico relacionado (Select sobre los diagnósticos del residente, opcional)

  Paso 2 — Pauta temporal
    Inicio (DatePicker, localizado es-ES/ca-ES con Intl)
    Fin (DatePicker, opcional; para tratamientos agudos con duración definida)
    Días de la semana (ToggleGroup: L M X J V S D; "todos los días" por defecto)
    Pautas del día (componente PautaMomentos):
      selector de momentos: Mañana / Mediodía / Tarde / Noche (chips de 48 px, multiselect)
      para cada momento seleccionado: dosis (Input numérico con teclado numérico, inputMode="decimal")
      — alternativa si no se quiere por momentos: horas libres (TimeListField existente en /components/)

  Paso 3 — Instrucciones y revisión
    Instrucciones (Textarea, max 500 chars)
    Resumen: "Omeprazol 20 mg, oral, cada mañana en ayunas, desde 10/06/2026"
    [ALERTA DE ALERGIA si el fármaco coincide con alguna alergia registrada] ← modal de bloqueo
    Botón "Prescribir" (deshabilitado si no hay fármaco+dosis+al menos 1 momento o 1 hora)
```

**Interacciones clave:**

- Al teclear el nombre del fármaco, si el sistema detecta coincidencia textual con una sustancia en `Allergy` del residente, aparece un banner de advertencia inmediato (no modal, para no interrumpir el flujo a menos que sea GRAVE).
- Si la severidad de la alergia es `GRAVE`, el banner se convierte en un `Dialog` bloqueante que pide confirmación explícita con motivo obligatorio antes de guardar (usando el `ConfirmProvider` ya existente en `/components/confirm.tsx`).
- Al prescribir, el toast de éxito muestra el resumen ("Omeprazol 20 mg — prescrito para mañana").
- El formulario reutiliza los esquemas Zod del backend en cliente (validación inline, error por campo con `aria-describedby` y `aria-invalid`).

**Estados accesibles en la lista de prescripciones (no solo color):**

| Estado                | Icono                 | Texto             | Color                   |
| --------------------- | --------------------- | ----------------- | ----------------------- |
| Activa                | Círculo relleno       | "Activa"          | verde (`green-100/800`) |
| Inactiva/suspendida   | Círculo vacío         | "Inactiva"        | gris (`slate-100/500`)  |
| PRN/a demanda         | Rayo                  | "A demanda"       | azul (`blue-100/800`)   |
| Con alergia potencial | Triángulo exclamación | "Revisar alergia" | ámbar (`amber-100/800`) |

---

#### Vista B — MAR / Pase de medicación (rol AUXILIAR y SANITARIO, tablet-first)

**Ruta:** `/residentes/[id]/medicacion` (ruta existente, rediseñada) o accesible desde `/atencion` para el auxiliar.

**Jerarquía:**

```
Cabecera del residente (sticky top)
  Nombre y apellidos (texto grande, ≥20 px)
  Plaza / Unidad
  [Alergias activas como chips rojos: "PENICILINA — GRAVE"] ← siempre visible, no colapsable
  [Fecha actual localizada con día de la semana: "martes, 10 de junio de 2026"]

Franjas del pase (1 Card por turno, solo turnos con dosis)
  ┌─ Mañana (06:00–14:00) ─────────────────────────────────────────┐
  │  [resumen de estado del turno: "2 administradas · 1 pendiente"]  │
  │                                                                    │
  │  ┌─────────────────────────────────────────────────────────────┐  │
  │  │  08:00 — Omeprazol 20 mg · oral                             │  │
  │  │  [icono+texto estado] PENDIENTE                             │  │
  │  │                                                             │  │
  │  │  [Administrar - botón verde 56px]  [No administrada]        │  │
  │  │                                   [Rechazada]               │  │
  │  └─────────────────────────────────────────────────────────────┘  │
  │  ┌─────────────────────────────────────────────────────────────┐  │
  │  │  10:00 — Metformina 850 mg · oral    [✓ ADMINISTRADA 10:03] │  │
  │  └─────────────────────────────────────────────────────────────┘  │
  └────────────────────────────────────────────────────────────────────┘

  ┌─ Mediodía (14:00–18:00) ───────────────── [colapsado si todo OK] ┐
  ...
  ┌─ Tarde / Noche ───────────────────────────────────────────────── ┐
  ...
```

**Interacciones del MAR (tablet, pocos toques):**

- **Un toque = administrado:** tocar el botón "Administrar" (56 px, verde, texto grande) registra la dosis con `status: ADMINISTRADO`. Toast de confirmación con nombre del fármaco y hora. No pide confirmación adicional para el caso feliz: en contexto de pase de medicación la fricción extra es el error.
- **No administrada:** abre el `ConfirmProvider` existente con `reason: { required: true }` — el motivo es obligatorio (p. ej. "en ayunas para analítica"). Sin motivo no se puede guardar.
- **Rechazada:** igual que no administrada, motivo obligatorio (p. ej. "el residente la escupe"). El `ConfirmProvider` ya implementa este patrón.
- **Offline:** el MAR funciona offline con la misma lógica de `useCareSync`. Las administraciones se encolan en IndexedDB y se sincronizan al recuperar red. El badge de estado offline es visible en la cabecera. Las acciones en tomas ya registradas mientras offline muestran "pendiente de sincronizar" hasta confirmar.
- **PRN/a demanda:** las tomas PRN aparecen como una sección separada "A demanda" sin hora fija. El auxiliar las registra cuando ocurren, con dosis real (Input numérico).

**Estados de las tomas (icono + texto + color, nunca solo color):**

| Estado                          | Icono SVG         | Texto                        | Color fondo | Color texto |
| ------------------------------- | ----------------- | ---------------------------- | ----------- | ----------- |
| Pendiente (dentro del margen)   | Reloj             | "Pendiente"                  | `slate-50`  | `slate-700` |
| Pendiente con retraso (>60 min) | Reloj+exclamación | "Retrasada"                  | `amber-50`  | `amber-900` |
| Administrada                    | Checkmark relleno | "Administrada HH:MM"         | `green-50`  | `green-800` |
| No administrada (con motivo)    | X en círculo      | "No administrada — [motivo]" | `red-50`    | `red-800`   |
| Rechazada (con motivo)          | Flecha-rechazo    | "Rechazada — [motivo]"       | `amber-50`  | `amber-800` |
| Pendiente offline               | Nube con flecha   | "Pendiente sync"             | `blue-50`   | `blue-700`  |

Cada `li` de dosis tiene `aria-label` completo: "Omeprazol 20 mg, 08:00, estado: pendiente".

---

### 2.2 Cambios de modelo requeridos (delta sobre el schema actual)

El schema actual (`Medication`) tiene `dose` (String único), `times` (Json array "HH:MM"), `route` (String libre) y ningún campo para pauta por días de la semana, dosis por momento del día, tipo PRN, ni vínculo a diagnóstico. Estos son los cambios mínimos necesarios para el rediseño:

**Delta en `Medication`:**

```prisma
// Añadir:
route         String?          // ya existe, pero debe ser enum MedicationRoute
unit          String?          // forma farmacéutica (comprimido, solución...)
daysOfWeek    Json?            // array [0–6] (0=domingo); null = todos los días
momentDoses   Json?            // { "MANANA": "20mg", "MEDIODIA": null, "TARDE": "20mg", "NOCHE": null }
                               // null = no se da en ese momento; complementa o sustituye times
type          MedicationType?  // enum: CRONICO | AGUDO | PRN
diagnosisId   String?          // FK a Diagnosis del mismo residente (opcional)
treatmentId   String?          // FK a Treatment (ver abajo — cabecera de tratamiento)
```

**Nuevo enum `MedicationType`:**

```prisma
enum MedicationType {
  CRONICO
  AGUDO
  PRN // "si precisa" / a demanda
}
```

**Nuevo enum `MedicationRoute` (reemplaza el String libre):**

```prisma
enum MedicationRoute {
  ORAL
  SUBLINGUAL
  SUBCUTANEA
  INTRAMUSCULAR
  INTRAVENOSA
  TOPICA
  INHALATORIA
  TRANSDERMICA
  RECTAL
  OCULAR
  NASAL
  OTRA
}
```

**Nuevo modelo `Treatment` (cabecera de tratamiento — agrupa líneas de prescripción):**

```prisma
model Treatment {
  id            String     @id @default(cuid())
  tenantId      String     @map("tenant_id")
  residentId    String     @map("resident_id")
  resident      Resident   @relation(...)
  orderDate     DateTime   @map("order_date")
  prescribedById String?   @map("prescribed_by_id")
  notes         String?
  active        Boolean    @default(true)
  createdAt     DateTime   @default(now()) @map("created_at")
  updatedAt     DateTime   @updatedAt @map("updated_at")

  medications   Medication[]
  @@index([tenantId])
  @@index([residentId])
  @@map("treatments")
}
```

**Nota sobre compatibilidad:** `times` (array HH:MM) se mantiene como campo primario para la pauta calculada (ya funciona en `computeSchedule`/`mar.ts`). `momentDoses` es opcional y complementario: para centros que trabajan por franjas en lugar de horas exactas. La lógica de `computeSchedule` puede derivar `times` de `momentDoses` (mañana=08:00, mediodía=13:00, tarde=18:00, noche=22:00) si `times` está vacío. Esto no rompe el MAR existente.

**Delta en `MedicationAdministration`:**

- Sin cambios estructurales. El campo `notes` ya almacena el motivo de no administración/rechazo.
- Valorar añadir `prnDose` (String?) para las tomas PRN con dosis variable real.

**Alergias como entidad de seguridad (ya existe, falta visibilidad):**
El modelo `Allergy` ya tiene `substance`, `severity` y `reaction`. El cambio no es de modelo sino de UI: las alergias deben ser el primer elemento visible en cualquier pantalla de medicación, no estar enterradas en el expediente. El MAR debe mostrarlas en la cabecera sticky. La prescripción debe chequearlas antes de guardar.

---

### 2.3 Seguridad activa

**Chequeo de alergia en prescripción:**

- Al introducir el nombre del fármaco (con debounce de 300 ms), comparación textual simple entre `name` y cada `allergy.substance` del residente.
- Si hay coincidencia: banner ámbar con icono de advertencia y texto "Este medicamento puede contener [sustancia]. El residente tiene alergia registrada ([severidad])."
- Si la severidad es `GRAVE`: el botón "Prescribir" queda bloqueado hasta que el sanitario pase por el `ConfirmProvider` con `tone: 'danger'` y motivo obligatorio. Esto queda en `AuditLog` con `action: 'OVERRIDE_ALLERGY'`.
- La comparación inicial es textual (sin llamada al modelo); en H5 se puede mejorar con el copiloto (Haiku puede hacer matching semántico: "amoxicilina" ~ "penicilina").

**Chequeo de duplicidad:**

- Al prescribir, consultar si ya existe una `Medication` activa con el mismo `name` para el residente.
- Si existe: toast de advertencia (no bloqueante, el sanitario puede prescribir igualmente con justificación).

**Sistema de estados accesible:**
Ya descrito en la tabla de estados del MAR (sección 2.1). El principio: ningún estado se distingue solo por color. Cada `Badge` de `@vetlla/ui` ya tiene `tone` pero le falta el icono SVG prefijo. La mejora es añadir un `icon` prop opcional al componente `Badge` en `packages/ui/src/badge.tsx`.

---

### 2.4 Asistencia IA (H5)

Dos flujos concretos para medicación, alineados con ADR 0008:

**Flujo 1 — Orden en lenguaje natural (Haiku, extracción/clasificación):**

```
Sanitario escribe o dicta:
"Ibuprofeno 400 mg oral cada 8 horas durante 5 días a partir de hoy, con las comidas"
         ↓
Haiku extrae: { name: "Ibuprofeno", dose: "400 mg", route: "ORAL",
                times: ["08:00","14:00","20:00"], startDate: today,
                endDate: today+5d, instructions: "Con las comidas",
                type: "AGUDO" }
         ↓
Se muestra el formulario PRE-RELLENO con badge "Borrador IA — revisar antes de prescribir"
         ↓
Sanitario revisa, corrige si hace falta, y pulsa "Confirmar y prescribir"
         ↓
medications.prescribe() → AuditLog con metadata: { aiSuggested: true, model: "haiku" }
```

- El modelo propone; el humano confirma. Nunca se escribe en BD sin confirmación.
- Si hay alergia potencial, el chequeo se hace antes de mostrar el formulario, no después.

**Flujo 2 — Foto de receta externa (Haiku, extracción visual):**

- El sanitario sube una foto de la receta en papel.
- Haiku extrae los campos estructurados y pre-rellena el formulario.
- El flujo post-extracción es idéntico al Flujo 1 (revisión + confirmación humana).
- La imagen NO se almacena en Vetlla (RGPD: dato de salud innecesario una vez extraído).
- Solo disponible en la vista de prescripción, nunca en el MAR.

**Flujo 3 — Chequeo semántico de alergia/interacción (Haiku, H5 avanzado):**

- Antes de guardar la prescripción, Haiku recibe el nombre del fármaco y la lista de alergias del residente y devuelve `{ allergyRisk: boolean, reason: string }`.
- Si `allergyRisk: true`, el banner de alergia se muestra aunque no haya coincidencia textual exacta (p. ej. "amoxicilina" detecta riesgo por "penicilina").
- El resultado del chequeo queda en `AuditLog`.

---

## 3. RBAC / Permisos — Mejor que la matriz

### 3.1 Problema con el enfoque ResiPlus

La matriz módulos × acciones de ResiPlus tiene dos fallos fundamentales: (a) la configuración parte de cero (infinitas decisiones), y (b) es solo para expertos (nadie sabe en lenguaje natural qué puede hacer un rol). Además mezcla módulos de ERP fuera de nuestro alcance.

### 3.2 Presets de rol con mínimo privilegio por defecto

Vetlla tiene 5 roles de sistema (`SUPERADMIN`, `DIRECTOR`, `SANITARIO`, `AUXILIAR`, `FAMILIAR`). Los centros reales tienen más perfiles de trabajo que no encajan en 5 casillas: fisioterapeuta, terapeuta ocupacional, trabajadora social, animadora sociocultural, recepcionista, mantenimiento. El diseño debe acomodar esto sin romper la arquitectura RBAC actual.

**Decisión arquitectónica recomendada: roles fijos (enum) + etiqueta de función por tenant**

Razonamiento:

- Los **permisos reales** son 5 conjuntos bien definidos (ya en `rbac.ts`). Cambiarlos es una decisión técnica con implicaciones en RLS.
- La **etiqueta de función** es información de presentación y organización: "Fisioterapeuta" en el centro A puede ser un `SANITARIO` con `clinical:write`, igual que la enfermera.
- La alternativa (custom roles por tenant como datos) tiene alto coste: migración de RLS, tabla `role_permissions`, queries más complejas, superficie de ataque para elevación de privilegios. El beneficio (configurabilidad total) no está pedido en el MVP.

**Implementación recomendada:**

- Añadir campo `jobTitle` (String?, libre) al modelo `User` → el director asigna "Fisioterapeuta" como etiqueta.
- Los permisos reales siguen siendo los del `UserRole` asignado.
- La UI de gestión de usuarios muestra la etiqueta de función, no el enum técnico.
- Presets de función (sugerencias de role al crear un usuario) mapean función → role:

| Función habitual        | Role asignado por defecto | Justificación                                      |
| ----------------------- | ------------------------- | -------------------------------------------------- |
| Director/gerente        | DIRECTOR                  | Gestión completa del centro                        |
| Médico                  | SANITARIO                 | Prescripción, valoraciones, PIA                    |
| Enfermero/DUE           | SANITARIO                 | Idem; puede diferenciarse por etiqueta             |
| Fisioterapeuta          | SANITARIO                 | Acceso a expediente clínico, valoraciones          |
| Terapeuta ocupacional   | SANITARIO                 | Idem                                               |
| Trabajadora social      | SANITARIO                 | Acceso a expediente, PIA (sin prescripción médica) |
| Animadora sociocultural | AUXILIAR                  | Registra actividades (atención directa)            |
| Auxiliar de atención    | AUXILIAR                  | Rol principal del flujo diario                     |
| Recepcionista           | DIRECTOR                  | Necesita residents:read, centers:read              |
| Mantenimiento           | AUXILIAR                  | Solo registra incidencias (care:write)             |
| Familiar                | FAMILIAR                  | Solo portal de lectura del residente vinculado     |

> Nota: los roles SANITARIO y DIRECTOR tienen permisos amplios que sirven para varias funciones. Si en iteraciones futuras se necesita más granularidad (p. ej. fisio sin `medication:prescribe`), se añade un role `CLINICO_NOPRESCRIPCION` o se implementan custom roles. Por ahora, la etiqueta de función + el preset es suficiente para el MVP.

---

### 3.3 Tarjetas de rol legibles + vista previa de acceso efectivo

**Pantalla de gestión de usuarios** (`/usuarios`, nueva — hoy existe solo `users.list` en el router):

```
Gestión del equipo
  [Filtrar por rol o función]  [+ Añadir usuario]

  ┌─ AUXILIAR — Auxiliar de atención ──────────────────────────────┐
  │  Rosa García · rosa@centro.com · Plaza 101-A asignada           │
  │  Último acceso: hoy 08:32                                       │
  │  [Ver acceso efectivo]  [Editar]  [Desactivar]                  │
  └─────────────────────────────────────────────────────────────────┘
  ┌─ SANITARIO — Enfermero/DUE ─────────────────────────────────────┐
  │  David Martínez · david@centro.com                              │
  │  [Ver acceso efectivo]  [Editar]                                │
  └─────────────────────────────────────────────────────────────────┘
```

**Panel "¿Qué puede hacer este rol?" (drawer o Dialog al pulsar "Ver acceso efectivo"):**

```
Rol: Auxiliar de atención directa

PUEDE:
  [✓] Ver el expediente del residente (datos básicos, alergias, diagnósticos)
  [✓] Registrar atención directa: constantes, ingesta, deposiciones, incidencias
  [✓] Administrar medicación (pase de medicación — MAR)
  [✓] Ver la pauta de medicación del residente
  [✓] Ver el Plan Individualizado de Atención (solo lectura)
  [✓] Ver el centro, unidades y plazas

NO PUEDE:
  [✗] Prescribir o modificar medicación
  [✗] Modificar el expediente del residente
  [✗] Crear o modificar diagnósticos, alergias, valoraciones
  [✗] Crear o modificar el PIA
  [✗] Ver el registro de actividad (auditoría)
  [✗] Gestionar usuarios del centro
```

Esta vista se genera dinámicamente desde `permissionsFor(role)` en `rbac.ts` + un mapa de etiquetas legibles por permiso. No es una tabla estática.

**Búsqueda y agrupación por área:**

- Los usuarios se pueden filtrar por `role`, por `jobTitle` (texto libre) o por unidad asignada.
- La vista de equipo agrupa por turno o por unidad si el centro tiene esa información.

**Estados accesibles en la lista de usuarios (no solo color):**

| Estado                         | Icono       | Texto                   | Color   |
| ------------------------------ | ----------- | ----------------------- | ------- |
| Activo                         | Punto verde | "Activo"                | `green` |
| Inactivo/desactivado           | Punto gris  | "Inactivo"              | `slate` |
| Sin acceso reciente (>30 días) | Reloj       | "Sin actividad 32 días" | `amber` |
| Invitación pendiente           | Sobre       | "Invitación enviada"    | `blue`  |

---

### 3.4 Auditoría de cambios de permisos (AuditLog, RGPD)

Cualquier cambio en el rol, la función o los permisos de un usuario queda en `AuditLog` con:

- `action: 'UPDATE'`, `entity: 'User'`, `entityId: user.id`
- `summary: "Rol cambiado de AUXILIAR a SANITARIO por [actorEmail]"`
- `metadata: { prevRole, newRole, prevJobTitle, newJobTitle }`

El router de usuarios ya usa `tenantProcedure` y tiene acceso a `ctx.audit`. La implementación es directa: añadir `ctx.audit()` en las mutaciones de gestión de usuarios.

La pantalla de auditoría (`/auditoria`) ya existe y filtra por `entity`. El director puede ver el historial de cambios de permisos de su equipo filtrando por `entity: 'User'`.

---

### 3.5 Decisión arquitectónica: roles fijos vs. custom roles por tenant

**Recomendación: roles fijos en esta iteración, con diseño preparado para custom roles.**

| Criterio                      | Roles fijos (enum, hoy)                  | Custom roles (datos por tenant)               |
| ----------------------------- | ---------------------------------------- | --------------------------------------------- |
| Complejidad de implementación | Baja (ya implementado)                   | Alta (nueva tabla, RLS más compleja, queries) |
| Seguridad                     | Alta (RLS anclada al enum)               | Media-alta (superficie de ataque mayor)       |
| Flexibilidad para el centro   | Baja-media (5 perfiles + etiqueta libre) | Alta                                          |
| Necesidad en MVP              | No pedida                                | No pedida                                     |
| Coste de migración futura     | Bajo (añadir tabla, migrar enum)         | N/A                                           |

Si en el futuro se necesitan custom roles (pedido por un cliente importante o para cumplir un requisito normativo autonómico), la migración es:

1. Crear tabla `RoleDefinition` por tenant con sus `permissions: Json`.
2. `User.role` pasa de enum a FK a `RoleDefinition`.
3. `hasPermission` consulta `RoleDefinition` en lugar del enum hardcodeado.
4. Migración de datos: crear `RoleDefinition` por defecto para cada `UserRole` existente.
5. Actualizar RLS para que use el array de permisos de la definición.

Este cambio requiere un ADR propio y debe llevarse al backlog cuando haya demanda real.

**Alcance del rol FAMILIAR bien acotado:**

- `FAMILIAR` solo tiene `['tenant:read', 'portal:read']`.
- El `FamilyLink` (ya en el schema) limita el acceso al residente vinculado.
- El portal (`/portal`) ya está separado.
- En la gestión de usuarios, el director puede ver los familiares vinculados a cada residente pero no cambiar sus permisos (son fijos por diseño).
- Los familiares NO aparecen en la lista de "equipo" — tienen su sección separada "Acceso familiar".

**Módulos fuera de alcance (no incluidos):**
No se incluyen en la UI de permisos los módulos de ERP de ResiPlus: almacenes, comercial, económico, cuentas/caja/bancos, facturación. Si en el futuro se añaden, se añaden como permisos nuevos con sus presets.

---

## 4. Tabla de priorización

Cada mejora se valora por **Impacto** (alto/medio/bajo) × **Esfuerzo** (S=días / M=1–2 semanas / L=sprint+). La secuencia recomendada es de arriba abajo.

| ID   | Mejora                                                                                                             | Área                      | Impacto | Esfuerzo | Prioridad | Hito / Cambio necesario                                                          |
| ---- | ------------------------------------------------------------------------------------------------------------------ | ------------------------- | ------- | -------- | --------- | -------------------------------------------------------------------------------- |
| M-01 | Alergia como banner sticky en MAR y prescripción (leer de `Allergy` existente, mostrar en cabecera)                | Medicación / Seguridad    | Alto    | S        | Ya        | Ninguno de modelo; solo UI                                                       |
| M-02 | Estados accesibles en el MAR (icono + texto + color) — sustituir `bg-red-50` sin label textual                     | Medicación / A11y         | Alto    | S        | Ya        | Añadir `icon` prop a `Badge` en `packages/ui`                                    |
| M-03 | Cabecera sticky del residente en la página de medicación con alergias visibles                                     | Medicación / UX tablet    | Alto    | S        | Ya        | Ninguno                                                                          |
| M-04 | Separar ruta de prescripción (solo visible si `canPrescribe`) de la ruta del MAR                                   | Medicación / UX roles     | Alto    | M        | Sprint    | Ninguno de modelo; refactor de página                                            |
| M-05 | Formulario de prescripción con Select estructurado para vía y forma farmacéutica (eliminar texto libre en `route`) | Medicación / Seguridad    | Alto    | M        | Sprint    | Nuevo enum `MedicationRoute` + migración; actualizar `medications.prescribe` Zod |
| M-06 | Soporte de pauta por días de semana (`daysOfWeek`) en el formulario de prescripción + `computeSchedule`            | Medicación / Funcional    | Alto    | M        | Sprint    | Añadir `daysOfWeek: Json?` a `Medication` + migración + update `mar.ts`          |
| M-07 | Tipo de medicación PRN/a demanda (tomas sin hora fija en el MAR)                                                   | Medicación / Funcional    | Alto    | M        | Sprint    | Nuevo enum `MedicationType`; UI en MAR: sección "A demanda"                      |
| M-08 | Chequeo de alergia bloqueante en prescripción (comparación textual + Dialog con motivo obligatorio para GRAVE)     | Medicación / Seguridad    | Alto    | M        | Sprint    | Solo UI + `confirm.tsx` existente                                                |
| M-09 | Cabecera de tratamiento (`Treatment`) que agrupa líneas de prescripción                                            | Medicación / Modelo       | Medio   | M        | Backlog   | Nuevo modelo `Treatment`; ADR recomendado                                        |
| M-10 | Vínculo de prescripción a diagnóstico del residente (`diagnosisId` en `Medication`)                                | Medicación / Clínico      | Medio   | S        | Backlog   | Añadir FK opcional; ningún cambio de lógica                                      |
| M-11 | Dosis por momento del día (`momentDoses`) como alternativa a horas exactas                                         | Medicación / UX           | Medio   | M        | Backlog   | Añadir `momentDoses: Json?`; update `computeSchedule`                            |
| M-12 | IA — Lenguaje natural → borrador de prescripción (Haiku, H5)                                                       | Medicación / IA           | Alto    | L        | H5        | Requiere `packages/ai` + ADR 0008 confirmado                                     |
| M-13 | IA — Foto de receta externa → borrador de prescripción (Haiku, H5)                                                 | Medicación / IA           | Medio   | L        | H5        | Idem                                                                             |
| M-14 | IA — Chequeo semántico alergia/interacción (Haiku, H5)                                                             | Medicación / Seguridad IA | Alto    | L        | H5        | Idem                                                                             |
| R-01 | Campo `jobTitle` en `User` + UI de gestión de usuarios con etiqueta de función                                     | RBAC / UX                 | Alto    | M        | Sprint    | Añadir `jobTitle: String?` a `User`; migración trivial                           |
| R-02 | Tarjetas de rol legibles ("puede / no puede") generadas desde `permissionsFor`                                     | RBAC / UX                 | Alto    | S        | Sprint    | Mapa de etiquetas legibles por permiso (solo frontend)                           |
| R-03 | Pantalla `/usuarios` con lista, filtro por rol/función y botón "Ver acceso efectivo"                               | RBAC / UX                 | Alto    | M        | Sprint    | `users:write` ya existe en RBAC; nueva ruta + tRPC                               |
| R-04 | Auditoría de cambios de rol/función con `ctx.audit()` en mutaciones de usuario                                     | RBAC / RGPD               | Alto    | S        | Sprint    | Solo añadir `ctx.audit()` en router de usuarios                                  |
| R-05 | Sección "Acceso familiar" separada de la lista de equipo; vinculación de familiar a residente desde UI             | RBAC / UX                 | Medio   | M        | Backlog   | `FamilyLink` ya existe; nueva UI                                                 |
| R-06 | Custom roles por tenant (tabla `RoleDefinition`, migración de enum)                                                | RBAC / Arquitectura       | Medio   | L        | Backlog+  | ADR propio; solo si hay demanda real                                             |

**Secuencia recomendada (resumen):**

1. **Semana 1 (quick wins de seguridad, S):** M-01, M-02, M-03, R-02, R-04
2. **Sprint (2 semanas, M):** M-04, M-05, M-06, M-07, M-08, R-01, R-03
3. **Backlog (siguiente sprint, M):** M-09, M-10, M-11, R-05
4. **H5 (L, requiere infraestructura IA):** M-12, M-13, M-14
5. **Backlog largo plazo:** R-06 (solo si hay demanda real de cliente)

---

## 5. Riesgos y decisiones abiertas

### Riesgos

**R1 — Chequeo de alergia por nombre textual es frágil.**
"Amoxicilina" no se detecta si la alergia registrada es "penicilina". Mientras no esté H5, el chequeo textual es el mínimo viable pero debe documentarse en la UI: "Este chequeo es orientativo. Verifica siempre la historia clínica completa." En H5, Haiku puede hacer el matching semántico.

**R2 — Pauta por días de semana cambia `computeSchedule` (función pura bien testeada).**
`mar.ts` tiene tests unitarios (`mar.test.ts`). Cualquier cambio en `computeSchedule` debe mantener los tests verdes y añadir casos para `daysOfWeek`. El riesgo es bajo si se aborda de forma incremental: primero el campo en el schema (nullable, no rompe nada), luego la lógica en `mar.ts`, luego la UI.

**R3 — El MAR offline con estados nuevos (PRN, dosis por momentos) necesita que el schema de IndexedDB se amplíe.**
`apps/web/src/offline/db.ts` y `types.ts` están diseñados para `CareRecord`. Si el MAR offline se amplía para incluir administraciones de medicación (hoy no están en la cola offline), hay que valorar si entra en el scope de `CareRecord` o requiere una cola separada en IndexedDB. Esta decisión debe tomarse antes de implementar M-07.

**R4 — `jobTitle` como campo libre puede crear inconsistencias entre centros del mismo tenant.**
Si un tenant tiene varios centros, "Fisio" y "Fisioterapeuta" son la misma función pero aparecerán como distintas. Mitigación: listar los `jobTitle` únicos del tenant como sugerencias en un Combobox al crear/editar usuarios.

**R5 — El rol RECEPCIONISTA con role DIRECTOR tiene acceso a `users:write` y `centers:write`.**
Es demasiado privilegio para recepción. Mitigación en el MVP: documentar en la UI que el preset de "Recepcionista" debe ajustarse; el director puede cambiar el role a AUXILIAR si la recepción no necesita gestionar usuarios. En el largo plazo, esto es un argumento para los custom roles (R-06).

### Decisiones que convienen formalizar como ADR

**ADR recomendado A — Modelo de pauta de medicación extendido (M-06, M-07, M-11):**
Decisión sobre si `daysOfWeek` y `momentDoses` van en `Medication` o en una tabla separada `MedicationSchedule`. La tabla separada es más limpia (una fila por pauta, no Json en la raíz) pero añade complejidad. Para el MVP, Json en `Medication` es suficiente y reversible.

**ADR recomendado B — Custom roles por tenant (R-06):**
La decisión de mantener el enum fijo vs. migrar a datos por tenant. Solo abrir cuando haya demanda real de cliente o requisito normativo. Incluir el impacto en RLS, coste de migración y superficie de ataque.

**ADR recomendado C — MAR offline para administraciones de medicación:**
Decidir si las administraciones de medicación entran en la cola offline de IndexedDB (hoy solo `CareRecord`). Impacto en `offline/db.ts`, `offline/sync.ts` y el esquema de resolución de conflictos (LWW por campo puede ser problemático para una administración: si dos dispositivos registran "administrado" y "no administrado" para la misma dosis, LWW puede elegir el estado incorrecto). Requiere análisis de conflictos específico para `MedicationAdministration`.

**ADR ya existente a confirmar — ADR 0008 (H5 IA):**
La arquitectura de los flujos M-12/M-13/M-14 depende de confirmar la elección Bedrock vs. Vertex EU y la decisión A-003 (proveedor app+Postgres). Sin esto, H5 no puede arrancar.

---

_Siguiente paso recomendado:_ implementar M-01/M-02/M-03 (quick wins de seguridad, esfuerzo S) y R-02/R-04 (RBAC legible y trazado, esfuerzo S) en el próximo sprint. Abrir los tres ADR recomendados como drafts para discutir con el equipo.
