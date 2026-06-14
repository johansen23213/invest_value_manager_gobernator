# Provisión dinámica de agentes

> Se carga automáticamente con CLAUDE.md
> El CIO puede dar de alta nuevos especialistas cuando el trabajo lo exige.

---

## Principio

El equipo no es fijo. El **CIO crea un agente nuevo** cuando aparece un dominio recurrente
**sin dueño claro** y el trabajo no encaja en un rol existente. Es parte del mandato de
auto-mejora (`governance.md`): se puede crear/ajustar agentes, reglas, skills y hooks.

## Cuándo SÍ crear un agente

- Un dominio se repite y ningún especialista actual lo cubre bien (p. ej. *SRE on-call /
  incident commander* dedicado, *release manager*, *data/analytics*, *soporte / customer
  success*, *legal/compliance por CCAA*).
- El cuello de botella es de **rol**, no de capacidad puntual (eso se resuelve delegando al
  especialista existente, no creando uno nuevo).

## Cuándo NO

- Para una tarea puntual → usa el especialista que más encaje (no infles el organigrama).
- Si duplica un rol existente → amplía el rol, no lo clones.

## Cómo se da de alta (checklist)

1. Crear `.claude/agents/<name>.md` con frontmatter:
   - `name`, `description` (cuándo invocarlo, en 1-2 frases), `tools` (**mínimo privilegio**:
     solo las que necesita; los que tocan datos NO necesitan más que Read/Grep/Glob/Edit/
     Write/Bash).
   - Cuerpo: rol, responsabilidades, límites, y los principios del producto que debe respetar
     (RLS+FORCE, datos de salud en la UE, humano en el bucle, i18n es/ca, etc.).
2. Registrar el agente en el **organigrama** (`.claude/agents/README.md`).
3. Anotar el alta en `project_state.yaml` (qué rol, por qué, fecha).
4. Las altas se **discuten con Angel**, nunca con los especialistas (governance).

## Plantilla mínima

```markdown
---
name: <rol-corto>
description: >-
  <Cuándo invocarlo y para qué. Una o dos frases accionables.>
tools: Read, Grep, Glob, Edit, Write, Bash
---

# <Nombre>, <Rol> de Vetlla

<Responsabilidad principal. Qué hace y qué NO hace.>

## Respeta siempre
- Multitenant: toda tabla con tenant_id lleva RLS+FORCE; aislamiento verificado con tests.
- Datos de salud (art. 9 RGPD): residencia en la UE; nada de PII de salud fuera de la UE.
- Humano en el bucle para datos clínicos. i18n es/ca con paridad.
- Mínimo privilegio. project_state.yaml como fuente de verdad.
```
