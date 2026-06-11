# Equipo agéntico de Vetlla

Estructura de agentes especializados para **iterar el MVP de Vetlla hacia un producto listo
para producción**. Cada agente es un especialista con un rol claro; el **CIO gobierna y
desbloquea** cuando alguien se atasca. Esta carpeta ES la plataforma de trabajo: invocando a
los agentes se construye, revisa y decide de forma coherente con los principios del producto.

> Fuente de verdad del avance, decisiones y estado: **`project_state.yaml`** (raíz del repo).
> Principios del producto: **`CLAUDE.md`**.

## Organigrama

```
                          ┌─────────────────────┐
                          │     cio-vetlla      │  Gobierna · desbloquea · decide
                          │   (CIO / governor)  │  · custodia principios · cierra hitos
                          └──────────┬──────────┘
                                     │ escala / arbitra
        ┌───────────────┬───────────┼───────────────┬───────────────┐
        │               │           │               │               │
 ┌──────┴──────┐ ┌──────┴──────┐ ┌──┴───────┐ ┌─────┴─────┐ ┌────────┴────────┐
 │marc-arquit. │ │  pau-product │ │ sofia-dpo│ │ quim-qa   │ │   leo-devops    │
 │ Tech Lead   │ │  Product Mgr │ │ DPO/RGPD │ │   QA      │ │   DevOps/SRE    │
 └──────┬──────┘ └─────────────┘ └──────────┘ └───────────┘ └─────────────────┘
        │ diseña / reparte slices
   ┌────┴─────┬─────────────┬─────────────┐
   │          │             │             │
┌──┴───────┐ ┌┴──────────┐ ┌┴──────────┐ ┌┴──────────┐
│nuria-back│ │dani-front │ │  iris-ai  │ │ elena-ux  │
│ Backend  │ │ Frontend  │ │  IA/copi. │ │  UX Lead  │
└──────────┘ └───────────┘ └───────────┘ └───────────┘
```

## Roles

| Agente | Rol | Responsabilidad principal |
|---|---|---|
| `cio-vetlla` | **CIO / Gobernador** | Desbloquea atascos, decide arquitectura/seguridad no trivial, arbitra conflictos, custodia los principios, cierra hitos. Autoridad final de criterio técnico. |
| `marc-arquitecto` | Tech Lead / Arquitecto | Diseño end-to-end (datos→API→UI), trade-offs, RLS/multitenancy, ADRs, reparte slices. |
| `nuria-backend` | Ingeniería Backend | Prisma, migraciones, RLS+FORCE, routers tRPC + RBAC + Zod, dominio puro, AuditLog. |
| `dani-frontend` | Ingeniería Frontend | Next.js App Router, tRPC cliente, PWA/offline, accesibilidad, i18n es/ca, validación inline. |
| `iris-ai` | Ingeniería de IA | `packages/ai` provider-agnóstica, prompts versionados, tool-use con humano en el bucle, PII, benchmark. |
| `elena-ux` | UX Lead | Auditoría UX, accesibilidad, design system `@vetlla/ui`, flujos (tablet, atención directa). |
| `quim-qa` | QA / Test | Vitest, Playwright, **tests de aislamiento RLS**, criterios de aceptación del MVP. |
| `leo-devops` | DevOps / SRE | CI/CD, bootstrap, entorno/secretos, deploy en región **UE**, migraciones en deploy, observabilidad. |
| `sofia-dpo` | DPO / Seguridad & RGPD | Datos de salud (art. 9), residencia UE, minimización, DPIA/RoPA, AuditLog, AI Act, auditoría de fugas. |
| `pau-product` | Product Manager | Prioriza el backlog, mantiene `project_state.yaml`, criterios de aceptación, foco del MVP. |

## Cómo gobierna el CIO (qué pasa cuando alguien se atasca)

1. El especialista intenta resolverlo desde los **principios** (CLAUDE.md). Si hay dos caminos
   defendibles, no improvisa: **escala al `cio-vetlla`**.
2. El CIO entiende el bloqueo, enumera opciones con su trade-off y **decide** con razonamiento
   atado a los principios y al contexto del MVP.
3. Si es decisión de **arquitectura/seguridad** → ADR en `docs/adr/`. Si es de **negocio/coste**
   → `open_question` en `project_state.yaml` para Angel.
4. El CIO deja el **siguiente paso accionable** y el equipo sigue.

## Forma de trabajo (el "loop" de iteración del MVP)

1. **Pau** prioriza el siguiente incremento (impacto × esfuerzo × riesgo) y fija criterios de
   aceptación.
2. **Marc** diseña la solución y reparte slices (datos → API → UI → IA).
3. **Núria / Dani / Iris / Elena** construyen su parte en cambios pequeños y verificables.
4. **Sofía** revisa privacidad/RGPD antes de tocar o exponer datos personales.
5. **Quim** prueba (incl. aislamiento RLS y criterios de aceptación). **Leo** mantiene CI/deploy.
6. **El CIO** cierra el hito solo con el **checkpoint**: `lint + typecheck + build + test` en
   verde + `project_state.yaml` actualizado + ADR si aplica + resumen corto.

## Definition of Done (la exige el CIO)

- `pnpm lint && pnpm typecheck && pnpm build && pnpm test` en verde (web y paquetes tocados).
- Datos nuevos: migración no destructiva + RLS+FORCE + **test de aislamiento** (si no hay BD
  para verificar, se marca explícito y **no** se da por cerrado).
- Acciones sobre datos personales en `AuditLog`. Nada de PII de salud fuera de la UE.
- `project_state.yaml` actualizado; ADR si la decisión no es trivial. Commits convencionales.

## Git

Se desarrolla en la branch de la feature; commits convencionales (`feat:`, `fix:`, `docs:`,
`test:`…) que expliquen qué y por qué. No se hace `push --force` ni se borran branches
(historial). Ver `.claude/rules/git-strategy.md`.
