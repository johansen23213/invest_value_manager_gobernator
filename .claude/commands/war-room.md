---
description: Declara una War Room (incidente Sev1) y coordina a los especialistas en paralelo
---

# /war-room — Declarar sala de crisis

Incidente reportado: **$ARGUMENTS**

Actúa como **incident commander** (CIO) siguiendo `.claude/rules/war-room.md`:

1. **Clasifica la severidad** y el tipo de incidente (brecha RGPD / aislamiento multitenant /
   pérdida de datos / caída de prod / IA). Si es Sev1, abre la war room; si no, dilo y baja a
   flujo normal.
2. **Contén antes de arreglar**: identifica la acción inmediata para parar el daño (revocar
   acceso, aislar tenant, rollback seguro) y ejecútala o delégala primero.
3. **Convoca el roster** del tipo de incidente (tabla de la regla) lanzando a los
   especialistas **en paralelo** con slices no solapados. Si falta un rol, provisiona uno
   (`agent-provisioning.md`).
4. **Informa a Angel de inmediato** si hay datos de salud implicados.
5. **Verifica** la mitigación (RLS en Postgres, tests de regresión que reproduzcan el fallo y
   ahora pasen). Nada se cierra sin verificación.
6. **Cierra**: postmortem breve + ADR si aplica, evalúa notificación de brecha RGPD (72 h),
   actualiza `project_state.yaml` y declara la war room cerrada.

No uses `--force`, no borres ramas/datos. Humano en el bucle para datos clínicos sigue vigente.
