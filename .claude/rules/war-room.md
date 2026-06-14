# War Room — Protocolo de incidentes Sev1

> Se carga automáticamente con CLAUDE.md
> El CIO es el incident commander. Se invoca con `/war-room` o al detectar un disparador.

---

## Qué es

Una **convocatoria en paralelo** de los especialistas necesarios, bajo coordinación única
del CIO, para resolver un incidente crítico (Sev1) sin la cadencia normal de olas. La war
room **prevalece sobre el trabajo en curso**: se pausa lo demás hasta contener el incidente.

## Disparadores (Sev1) — cualquiera abre war room

1. **Brecha de seguridad / RGPD**: fuga o acceso indebido a datos de salud (art. 9), o
   sospecha de ello.
2. **Fallo de aislamiento multitenant**: un tenant ve datos de otro por cualquier ruta
   (rotura de RLS). Es el invariante #1 — máxima prioridad.
3. **Pérdida o corrupción de datos** (residentes, medicación, auditoría).
4. **Caída de producción** o indisponibilidad de un proveedor crítico de la UE.
5. **Salida de PII de salud fuera de la UE** (o riesgo inminente).
6. **AuditLog comprometido** (manipulación o borrado).

Ante la duda de severidad, se abre war room y se baja después; nunca al revés.

## Quién la declara

- La **declara el CIO** (autoridad final). **Cualquier especialista puede ESCALAR**: si
  detecta un disparador, lo eleva al CIO de inmediato en vez de seguir su tarea.
- Para datos de salud, se **informa a Angel sin demora** (no se espera a la resolución).

## Roster por tipo de incidente (se convocan EN PARALELO)

| Incidente | Lead | Convocados |
|---|---|---|
| Brecha seguridad / RGPD | `sofia-dpo` | `nuria-backend`, `leo-devops`, `marc-arquitecto` |
| Aislamiento multitenant / RLS | `nuria-backend` | `sofia-dpo`, `quim-qa`, `marc-arquitecto` |
| Pérdida / corrupción de datos | `nuria-backend` | `leo-devops`, `sofia-dpo`, `quim-qa` |
| Caída de producción / infra | `leo-devops` | `nuria-backend`, `marc-arquitecto` |
| Copiloto / IA (fuga vía prompts) | `iris-ai` | `sofia-dpo`, `nuria-backend` |

El CIO ajusta el roster según el caso; puede provisionar un agente nuevo (ver
`agent-provisioning.md`) si falta un rol.

## Coordinación (reglas de la sala)

1. **Incident commander único**: el CIO. Un solo hilo de decisión.
2. **Contener antes que arreglar**: primero parar el daño (revocar acceso, aislar, rollback
   seguro), luego causa raíz.
3. **Trabajo en paralelo por slices** no solapados (mismo criterio de no-solape que las olas).
4. **Nada se da por resuelto sin verificación**: RLS comprobada en Postgres, tests en verde,
   reproducción del incidente imposible.
5. **Humano en el bucle** para datos clínicos sigue vigente. **Nunca** `--force` ni borrar
   ramas/datos para "limpiar".
6. **Todo queda registrado**: timeline en `project_state.yaml`, acciones en `AuditLog`.

## Criterios de cierre

- Causa raíz identificada y **mitigación verificada con tests** (regresión que reproduzca el
  fallo y ahora pase).
- **Postmortem** breve (qué pasó, impacto, causa, fix, prevención) → `docs/` y, si cambia
  arquitectura/decisión, un ADR.
- **Evaluación de notificación de brecha RGPD** (72 h a la autoridad si afecta a datos
  personales; informar a Angel siempre).
- `project_state.yaml` actualizado y la war room **declarada cerrada por el CIO**.

## Comando

`/war-room <descripción del incidente>` — el CIO clasifica severidad, elige roster, lanza a
los especialistas en paralelo y coordina hasta el cierre.
