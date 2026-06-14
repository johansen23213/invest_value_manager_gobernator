# Auditoría UX / Accesibilidad / i18n — 2026-06-14

**Auditora:** Elena (UX Lead)
**Método:** Solo lectura de código (sin build ni servidor). Grep + lectura directa de ficheros.
**Alcance:** Toda la carpeta `apps/web/src/app/(app)`, `packages/ui/src`, `apps/web/src/i18n`.

---

## Resumen ejecutivo

El design system (`packages/ui`) y la mayoría de pantallas del flujo asistencial están correctamente construidos: objetivos táctiles ≥ 44px/56px, `aria-live`, foco visible vía Radix/shadcn, gráficos SVG con tabla sr-only, skeleton states. El problema central es la **inconsistencia de cobertura**: las pantallas de gestión construidas más recientemente (centros/[id], equipo/familias, facturación, residentes/[id]) contienen cientos de strings hardcodeados en castellano que no pasan por `t()`. Esto rompe la experiencia en catalán y es el hallazgo más grave.

La paridad de claves es-ES/ca-ES en `dictionaries.ts` es excelente (1.694 claves es vs. 1.693 ca — un único descuaje menor). El problema no es el diccionario: es que muchos ficheros no consumen esas claves.

---

## Tabla de hallazgos

| ID | Severidad | Área | Fichero(s) | Descripción | Recomendación |
|----|-----------|------|------------|-------------|---------------|
| H-01 | CRÍTICO | i18n | `centros/[id]/page.tsx` | El fichero NO importa `useT`. Toda la UI está en castellano hardcodeado: labels de formulario ("Nombre", "Planta (opcional)", "Código", "Unidad"), mensajes de carga ("Cargando…"), mensajes de estado ("Libre", "Sin plazas.", "No hay unidades todavía.", "Añadir unidad", "Añadir plaza", "Eliminar unidad", "Ocupación: {n} / {m} plazas"), toast de éxito hardcodeados ("Unidad creada.", "Plaza creada.", etc.). Afecta a todos los usuarios en ca-ES. | Importar `useT`, extraer todas las cadenas al diccionario bajo namespace `centers.detail.*` y usar `t()`. |
| H-02 | CRÍTICO | i18n | `equipo/familias/page.tsx` | NO importa `useT`. Todos los textos de la pantalla de acceso familiar están hardcodeados: títulos ("Acceso de familias"), labels de formulario ("Residente", "Parentesco", "Email del familiar", "Nombre (opcional)", "Contraseña provisional"), labels de privacidad ("Novedades", "Medicación", "Valoraciones"), mensajes toast ("Acceso concedido…", "Acceso revocado.", etc.), textos de estados vacíos, botones ("Conceder acceso", "Revocar"). Esta pantalla la usa Dirección para configurar acceso de familias — flujo crítico. | Ídem H-01 con namespace `family.access.*`. |
| H-03 | ALTO | i18n | `facturacion/page.tsx` | Importa `useT` pero deja varios strings hardcodeados: `<Badge tone="green">Sí</Badge>` / `<Badge tone="neutral">No</Badge>` (línea 272/274, columna IVA Exento), `<option value="">Año: Todos</option>` (585), `<option value="">Mes: Todos</option>` (598), labels del dialog "Crear borrador": `<Label>Residente</Label>`, `<Label>Año</Label>`, `<Label>Mes</Label>`, `<Label>Serie</Label>`, `<Button>Cancelar</Button>` (795), `<Button>Cerrar</Button>` (919), `Pagador:` inline (844), `TOTAL` en tabla (874), `Creando…` (798), `"Editar"` sin usar `t()` (281), cabeceras de tabla "Concepto", "Base", "IVA", "Total" (853-856), `(exento)` (864), `Factura ` literal (815). | Usar `t('action.cancel')`, `t('action.close')`, añadir claves `billing.tariffs.vatYes/vatNo`, `billing.filter.yearAll/monthAll`, `billing.invoices.concept/base/vat/total`, `billing.invoices.exempt`, etc. |
| H-04 | ALTO | i18n | `residentes/[id]/page.tsx` | Importa `useT` pero la pestaña "Datos personales" tiene todos sus `<dt>` hardcodeados: "Nacimiento", "Ingreso", "DNI/NIE", "Centro", "Plaza", "Grupo sanguíneo", "Idioma preferente" (líneas 608-637). Los `<TabsTrigger>` de las primeras 4 pestañas están hardcodeados: "Datos", "Escalas", "Contactos", "Alergias" (585-588). Badges de estado hardcodeados: `<Badge>Activo</Badge>` (líneas 958, 971), `<Badge>Finalizada</Badge>` (1243), `<Badge>Consentimiento ok</Badge>` (1245), `<Badge>Sin consentimiento</Badge>` (1247), `<Badge>Presenciada</Badge>` (1204). Inline: "Lesiones: {f.injuries}" (1207), "Diag.:" en diagnoses (624 en DiagnosisRow). Campo DSAR con label hardcodeado (1559, 1570-1571). | Añadir claves `exp.datos.*` para los `<dt>`, usar `t('exp.care.yes/no')` para badges, `t('exp.clinical.falls.witnessed')`, etc. |
| H-05 | ALTO | i18n | `admisiones/page.tsx` | Importa `useT` pero: `<TabsTrigger value="pipeline">Lista de espera / Pipeline</TabsTrigger>` (1392) hardcodeado — mezcla castellano/inglés visible al usuario. `<th scope="col">Fecha</th>` (558) hardcodeado. `<option value="">Selecciona un centro…</option>` (988), `<option value="">Sin preferencia de unidad</option>` (1005) hardcodeados. | Añadir clave `admissions.tab.pipeline`, usar `t('admissions.forecast.from')` para "Fecha", añadir `admissions.form.center.ph` y `admissions.form.unit.none`. |
| H-06 | ALTO | i18n | `admisiones/[id]/page.tsx` | `<option value="">Selecciona el nuevo estado…</option>` (417) hardcodeado. | Añadir clave `admissions.actions.selectStatus`. |
| H-07 | ALTO | i18n | `cuenta/seguridad/mfa-card.tsx` | `<CardTitle>Seguridad — Verificación en dos pasos</CardTitle>` (518) hardcodeado aunque existe `t('cuenta.seguridad.title')`. Párrafo de descripción MFA "La verificación en dos pasos añade una capa extra…" (540-543) hardcodeado. Botón "Activar" (551) y texto de advertencia de códigos bajos "Tienes pocos códigos…" (569) hardcodeados. Estado de carga "Cargando…" (529) hardcodeado. | Usar `t('cuenta.seguridad.title')`, añadir claves `mfa.description`, `mfa.activate`, `mfa.codesLow`. |
| H-08 | ALTO | i18n | Múltiples ficheros | "Cargando…" hardcodeado en cascada: `mfa-card.tsx:529`, `centros/[id]/page.tsx:81`, `acp/page.tsx:101`, `equipo/familias/page.tsx:198`, `equipo/roles/page.tsx:40`, `plan/page.tsx:14`, `residentes/[id]/page.tsx:577` y 5+ líneas más, `social-tab.tsx:196+290`, `nursing-notes-tab.tsx` (inferido), `medical-notes-tab.tsx` (inferido). Existe `t('state.loading')` en el diccionario pero no se usa. | Reemplazar todos los `Cargando…` hardcodeados por `t('state.loading')`. Refactorizar en un componente `<LoadingState />` que use la clave. |
| H-09 | ALTO | i18n | `atencion/page.tsx` | El flujo de atención del auxiliar (flujo crítico para tablet) tiene strings hardcodeados: "Atención directa" (123), "Constantes" (192), "Ingesta" (227), "Deposición" (266), opciones de menú ['Desayuno', 'Comida', 'Merienda', 'Cena'] (235), "Cantidad" (239), "Sí"/"No" como valores de deposición (268), "Notas" (280), "Incidencia" (298), "Registrar constantes/ingesta/deposición/incidencia" (todos los botones), "Pendientes de sincronizar" (96), "Sincronizar ahora" (99), "Reintentando"/"Pendiente" en badges (111), "Registros recientes" (322). La badge "Sin conexión"/"En línea" sí usa `t()` pero el texto de aviso offline está hardcodeado (125-127). | Esta es la pantalla más crítica para la experiencia del auxiliar. Todas estas cadenas deben ir a `t()` bajo `care.*`. |
| H-10 | ALTO | i18n | `residentes/[id]/page.tsx` | Las Zod validations strings en el cliente están hardcodeadas en castellano: ej. `z.string().min(1, 'Indica el código.')`, `z.number().nonnegative('Debe ser positivo o cero.')` (línea 43-44 de `facturacion/page.tsx`). Estos mensajes de error no se localizan nunca. | Crear mensajes Zod localizados (zod-i18n-map o resolver en runtime via `t()`). No es trivial pero sí necesario para errores visibles al usuario. |
| H-11 | MEDIO | i18n | `relevo/page.tsx` | Labels de formulario "Turno" (731), "Fecha" (745), "Centro" (759), "Unidad" (778), `<option value="">Todas las unidades</option>` (784), "No hay centros disponibles." (712), "No hay notas de enfermería registradas…" (865) hardcodeados. Algunos de estos strings sí existen en el diccionario (`relevo.*`). | Usar las claves `t('relevo.shift')`, `t('relevo.date')`, etc. ya existentes. |
| H-12 | MEDIO | i18n | `equipo/page.tsx` | Labels de formulario de invitación de usuario: "Email" (395), "Nombre (opcional)" (407), "Rol" (411), "Función (opcional)" (423), "Contraseña provisional" (427) hardcodeados. | Usar claves bajo namespace `team.invite.*`. |
| H-13 | MEDIO | i18n | `admisiones/admission-status-badge.tsx` | El fichero no importa `useT`. El badge de estado de admisión puede usar texto hardcodeado o los `ADMISSION_STATUS_LABELS` de `lib/labels` (no verificado) — revisar. | Verificar y migrar a `t('admission.status.*')` si usa strings directos. |
| H-14 | MEDIO | i18n | `residentes/[id]/page.tsx` | Contexto DSAR: label "Escribe el apellido del residente para confirmar" (1559) y "Motivo de la solicitud" (1570) hardcodeados. Texto de confirmación de anonimización muy largo hardcodeado (223). | Mover a claves `dsar.confirm.label`, `dsar.reason.label`, `dsar.warning`. |
| H-15 | MEDIO | Accesibilidad | `atencion/page.tsx` | El `<select>` de comidas (229-238) usa HTML nativo con clases manuales en vez del componente `<Select>` de `@vetlla/ui`. Esto bypasa cualquier mejora de accesibilidad futura del DS. Además las opciones `['Desayuno','Comida','Merienda','Cena']` son un array estático en lugar de usar las claves `t('meal.*')`. | Sustituir `<select>` nativo por `<Select>` del DS. |
| H-16 | MEDIO | Accesibilidad | `diagnosisRow` en `diagnoses-tab.tsx` | El `<button type="button" className="text-sm text-brand-700">` inline "Editar" (línea 648) tiene `aria-label` correcto, pero su tamaño no garantiza 44px: `size="sm"` del Button v2 tiene `py-1.5` que puede quedar por debajo del mínimo táctil en móvil. Aplicable también a todos los botones `size="sm"` de acciones en filas de tablas. | Verificar que `size="sm"` supera 44px o añadir `className="min-h-touch"` explícito en contextos de tablet. |
| H-17 | MEDIO | Accesibilidad | `facturacion/page.tsx` | Las cabeceras de tabla de "Líneas de factura" (853-856: "Concepto", "Base", "IVA", "Total") no tienen `scope="col"`, usando `<th>` sin atributo. El componente `<Table>` del DS sí lo tiene, pero aquí se usa `<table>` HTML nativo. | Añadir `scope="col"` o migrar al componente `<Table>` / `<Th>` del DS. |
| H-18 | MEDIO | Accesibilidad | `portal/solicitudes/[id]/page.tsx:41` | Estrellas de valoración usan `style={{ color: filled ? '#E76F51' : '#d1d5db' }}` en vez de clases Tailwind. El gris `#d1d5db` sobre blanco tiene ratio 1.8:1 — no supera AA para elementos no-texto, pero el ★ actúa como decoración de un botón con `aria-label` apropiado, así que el fallo es de coherencia del DS más que de accesibilidad pura. | Usar `className` con `text-warm-600` / `text-brand-100` para coherencia y mantenibilidad. |
| H-19 | BAJO | Accesibilidad | `scale-evolution-chart.tsx` | La tabla `sr-only` en la columna de interpretación tiene una cabecera hardcodeada "Interpretación" (línea 318) en vez de usar `t()`. Impacto bajo ya que la clave no es visible, pero es inconsistente. | Añadir clave `valoracion.evolution.interpretation` al diccionario. |
| H-20 | BAJO | Consistencia DS | `centros/[id]/page.tsx` | Usa `className="text-slate-500"` (líneas 81, 82, 166, 182) en vez del token de color `text-[#1A3A3F]/60` del sistema. "slate" es el sistema antiguo de color. | Reemplazar `text-slate-*` por `text-[#1A3A3F]/60` para coherencia con el design system v2. |
| H-21 | BAJO | i18n — descuaje | `dictionaries.ts:153 vs 2228` | La clave `mfa.totp.useRecovery` tiene comillas simples en es-ES y comillas dobles en ca-ES. No causa fallo funcional (JavaScript las trata igual) pero es inconsistente y podría romper herramientas de extracción de claves. | Normalizar a comillas simples. |
| H-22 | BAJO | i18n | `admisiones/page.tsx:558` | `<th scope="col">Fecha</th>` hardcodeado en la tabla sr-only del gráfico de forecast. Existe `t('admissions.forecast.from')` pero no es equivalente. | Añadir clave `admissions.forecast.date` o reutilizar una existente. |

---

## Notas positivas (para documentar lo que funciona)

- **Diccionario es/ca**: 1.694 claves con paridad casi perfecta (1 descuaje). El catalán es traducción real, no copia del castellano.
- **Design system v2**: `Button` con `min-h-touch` (44px) y `size="lg"` con `min-h-[56px]`; `EmptyState` con SVGs `aria-hidden`; `Toast` sobre Radix con región aria-live gestionada; `Dialog` con `DialogTitle` siempre presente.
- **ScaleEvolutionChart**: SVG con `role="img"`, `aria-label` descriptivo, tabla sr-only equivalente (WCAG 1.1.1), puntos interactivos con área de toque 48px y focus-ring visible.
- **Flujo tablet atención**: objetivos de 64px en la lista de residentes, 56px en botones de constantes/ingesta/deposición, `aria-pressed` correcto en toggle buttons, `inputMode="numeric"` en campos clínicos.
- **`aria-live`/`role="status"`**: presentes en cuadrante, calidad, relevo, medicación prescribir, MFA, push — cobertura razonable en pantallas nuevas.
- **Formularios con `aria-invalid` + `aria-describedby`**: correctamente implementados en diagnoses-tab, MFA, solicitudes. `FieldError` del DS asociado.
- **Skip-link**: existe `t('skip.toContent')` implementado y apunta a `#contenido` en el layout.

---

## Priorización de sprints

### Sprint inmediato (Crítico/Alto)
1. H-01 — `centros/[id]/page.tsx`: añadir `useT` + extraer ~25 cadenas
2. H-02 — `equipo/familias/page.tsx`: añadir `useT` + extraer ~20 cadenas (bloquea ca-ES en gestión de acceso familiar)
3. H-08 — Reemplazar `Cargando…` hardcodeado por `t('state.loading')` en todos los ficheros (~15 ocurrencias)
4. H-09 — `atencion/page.tsx`: flujo crítico del auxiliar — extraer ~20 cadenas
5. H-03 — `facturacion/page.tsx`: strings residuales (~12 cadenas)

### Sprint siguiente (Alto/Medio)
6. H-04, H-11, H-12, H-14 — `residentes/[id]/page.tsx`, relevo, equipo
7. H-05, H-06 — `admisiones/*`
8. H-07 — `mfa-card.tsx`
9. H-15 — Reemplazar `<select>` nativo en atención por `<Select>` del DS
10. H-17 — Añadir `scope="col"` a tabla de factura

### Backlog
11. H-10 — Localización de mensajes Zod (requiere decisión de arquitectura)
12. H-13, H-16, H-18, H-19, H-20, H-21, H-22 — Mejoras menores
