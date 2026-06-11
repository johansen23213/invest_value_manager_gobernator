# Arquetipos de usuario — Vetlla

- **Autora:** Elena — UX Lead (con el equipo de UX)
- **Fecha:** 2026-06-07
- **Propósito:** dar cara y contexto a los roles del sistema para diseñar y priorizar desde
  necesidades reales, no desde funcionalidades. Cada arquetipo enlaza con mejoras del
  backlog (`docs/ux/informes/2026-06-07-auditoria-ux.md`).

> Personas basadas en los 5 roles de la plataforma (Auxiliar, Sanitario, Dirección,
> Familiar, Superadmin). Nombres ficticios.

---

## 1. Rosa — Auxiliar de atención directa  ·  *"A pie de cama, con prisa"*

- **52 años.** 20 de experiencia cuidando. Poca afinidad con la tecnología; usa el móvil
  para WhatsApp y poco más. Presbicia (necesita letra grande).
- **Contexto:** tablet compartida, a veces con guantes, en habitaciones donde el wifi
  llega regular. Atiende a 12–15 residentes por turno.
- **Objetivos:** registrar lo que hace (constantes, ingesta, deposiciones, incidencias)
  rápido y sin equivocarse; que **no se pierda nada** aunque no haya red.
- **Frustraciones:** apps lentas, formularios largos, teclear, y sobre todo **perder un
  registro** por falta de cobertura o no saber si "se guardó".
- **Un día con Vetlla:** entra, ve **su unidad**, toca a "Dolores", marca "comió 50 %",
  tensión 120/80; un aviso le confirma que se guardó (y que se sincronizará si está sin
  red). Sigue con la siguiente cama.
- **Necesidades UX:** ≤3 toques por registro, objetivos táctiles grandes, teclado
  numérico, **offline transparente**, confirmación clara.
- **Mejoras Vetlla:** `UX-13` lista "mi unidad" de 1 toque · `UX-14` confirmación con
  deshacer + pendientes de sync · `UX-15` entrada táctil · `UX-16` estado offline claro ·
  `UX-04` avisos (✅ hecho).

## 2. David — Enfermero (DUE)  ·  *"Responsable de que la medicación sea segura"*

- **38 años.** Cómodo con tecnología. Lleva la parte clínica de dos unidades.
- **Contexto:** pase de medicación por turnos; prescribe y revisa el PIA con el médico.
- **Objetivos:** un **pase de medicación** seguro y rápido, ver **alertas** de lo no
  administrado, registrar valoraciones (Barthel/Tinetti) y mantener el PIA.
- **Frustraciones:** registros dispersos, **errores de medicación**, escalas en papel,
  no saber qué quedó sin dar.
- **Un día con Vetlla:** revisa el MAR del turno, administra con un toque, y al marcar una
  dosis como **rechazada** el sistema le **pide el motivo** (queda trazado). En el panel ve
  las dosis no administradas del centro.
- **Necesidades UX:** MAR por turno, motivo obligatorio en excepciones, fechas/horas sin
  ambigüedad, escalas con interpretación.
- **Mejoras Vetlla:** `UX-02` editor de horas (✅) · `UX-17` motivo en no-administrado
  (✅ parcial) · `UX-01` fechas/horas localizadas (✅) · `UX-18` centro de alertas.

## 3. Marta — Directora / gestora  ·  *"Necesito visión y dormir tranquila con las inspecciones"*

- **45 años.** Gestiona el centro: ocupación, calidad, personal, conciertos.
- **Contexto:** despacho + recorridos; reporta a la administración autonómica.
- **Objetivos:** ver el estado del centro de un vistazo (ocupación, altas/bajas, alertas),
  y tener **trazabilidad** para auditorías.
- **Frustraciones:** datos en silos, informes a mano, descubrir problemas tarde.
- **Un día con Vetlla:** abre el panel, ve **ocupación 28/30**, 1 alerta clínica, y entra
  a resolverla. Da de alta una nueva plaza (con confirmación al borrar errores).
- **Necesidades UX:** panel con KPIs y "qué requiere mi atención hoy", búsqueda/filtros,
  ocupación visual, confirmaciones que eviten errores caros.
- **Mejoras Vetlla:** `UX-06` panel + accesos rápidos · `UX-19` plano de ocupación + KPIs ·
  `UX-18` alertas agregadas · `UX-10` búsqueda/filtros · `UX-03` confirmaciones (✅).

## 4. Carlos — Familiar  ·  *"Quiero saber cómo está mi madre sin tener que llamar"*

- **50 años.** Hijo de una residente. Catalanoparlante. Trabaja, no puede visitar a diario.
- **Contexto:** consulta desde el móvil por la noche.
- **Objetivos:** **tranquilidad**: saber cómo está su madre, novedades, su medicación.
- **Frustraciones:** opacidad, llamar y que nadie le informe, tecnicismos.
- **Un día con Vetlla:** abre el portal **en catalán**, ve el resumen de su madre, las
  novedades del día y su medicación actual. Cierra tranquilo.
- **Necesidades UX:** portal claro, **cálido** y privado, en **su idioma**, solo lectura.
- **Mejoras Vetlla:** `UX-20` portal más humano + control de privacidad · `UX-01` fechas
  localizadas (✅) · i18n es/ca (✅ portal).

## 5. Equipo Vetlla — Superadmin de plataforma  ·  *"Alta de un centro en minutos"*

- **Contexto:** onboarding de nuevos operadores, soporte y supervisión cross-tenant.
- **Objetivos:** dar de alta clientes rápido, sin tocar infra; soporte sin ver datos
  clínicos salvo lo imprescindible.
- **Frustraciones:** procesos manuales de alta, falta de herramientas de plataforma.
- **Necesidades UX:** consola de plataforma con onboarding guiado y métricas de uso.
- **Mejoras Vetlla:** consola de superadmin + onboarding guiado *(roadmap; hoy el
  superadmin no opera dentro de un tenant)*.

---

## Mapa de mejoras por arquetipo

| Mejora | Rosa (Aux.) | David (San.) | Marta (Dir.) | Carlos (Fam.) | Plataforma |
|--------|:----:|:----:|:----:|:----:|:----:|
| UX-01 Fechas/horas localizadas ✅ | ● | ● | ● | ● | |
| UX-02 Editor de horas ✅ | | ● | | | |
| UX-03 Confirmaciones ✅ | | | ● | | |
| UX-04 Avisos (toasts) ✅ | ● | ● | ● | | |
| UX-13/14/15/16 Flujo auxiliar | ● | | | | |
| UX-17 Motivo no-administrado ✅◐ | | ● | ● | | |
| UX-18 Centro de alertas | | ● | ● | | |
| UX-06/19 Panel + KPIs/ocupación | | | ● | | |
| UX-10 Búsqueda/filtros | ● | ● | ● | | |
| UX-20 Portal humano + privacidad | | | | ● | |
| Onboarding/consola plataforma | | | | | ● |

✅ hecho · ◐ parcial · ● beneficia a ese arquetipo

## Cómo lo usamos

- **Priorización:** una mejora que toca a **Rosa** (adopción del flujo crítico) o a la
  **seguridad clínica de David** sube de prioridad.
- **Diseño:** cada pantalla se valida contra el arquetipo dueño del flujo.
- **Research:** los próximos test se harán con perfiles reales tipo Rosa y David.
