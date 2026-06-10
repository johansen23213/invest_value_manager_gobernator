# ADR 0013 — Roles personalizados por tenant (R-06): diferido

- **Estado:** Aceptada (decisión: NO construir ahora)
- **Fecha:** 2026-06-10
- **Hito:** Sprint pulido (R-06)

## Contexto

El RBAC actual usa un conjunto **fijo** de roles (`DIRECTOR`, `SANITARIO`, `AUXILIAR`,
`FAMILIAR`, `SUPERADMIN`) con permisos por rol (`apps/web/src/lib/rbac.ts`). Algunos
competidores y clientes grandes piden **roles a medida** por centro (p. ej. "coordinador de
planta", "terapeuta ocupacional con acceso a PIA pero no a medicación").

R-06 plantea permitir que cada tenant defina sus propios roles y permisos.

## Decisión

**No construir roles personalizados ahora.** Se mantiene el modelo de roles fijos +
`jobTitle` libre (R-01) como etiqueta de función. Se reconsiderará cuando haya **demanda
real validada** (varios clientes de pago pidiéndolo explícitamente), no por hipótesis.

Motivos:

- **Coste/beneficio desfavorable en el MVP:** un sistema de permisos por tenant
  (roles + asignación de permisos + UI de administración + propagación a RLS y a
  `permissionProcedure`) es una pieza transversal cara de construir y, sobre todo, de
  **mantener segura**. Cada permiso nuevo debería poder componerse sin abrir agujeros de
  aislamiento entre tenants.
- **El `jobTitle` ya cubre la necesidad expresiva** (cómo se llama el puesto) sin tocar
  la autorización. La mayoría de peticiones "de rol a medida" son en realidad de
  *etiqueta*, no de *permisos distintos*.
- **Riesgo RGPD/seguridad:** permitir que un tenant amplíe permisos de acceso a datos de
  salud exige un modelo de autorización auditado y probado; hacerlo a medias es peor que
  no hacerlo.

## Diseño esbozado (para cuando se active)

- Tablas `Role` (tenant_id, name, isSystem) y `RolePermission` (roleId, permission), con
  RLS+FORCE y test de aislamiento. Los roles de sistema actuales se siembran como
  `isSystem = true` e inmutables.
- `User.roleId` opcional que, si está presente, sustituye al rol de enum; los permisos
  efectivos se resuelven desde `RolePermission`.
- `permissionProcedure` y la UI consultan permisos desde la fuente unificada (enum → tabla).
- UI de administración de roles bajo `/equipo/roles` (que hoy es solo referencia de lectura).
- Migración de datos: los enums actuales se mapean a roles de sistema equivalentes.

## Consecuencias

- **A favor:** foco del MVP en el bucle de uso y el diferencial de IA; superficie de
  seguridad pequeña y auditable.
- **En contra:** clientes que exijan roles a medida desde el día uno no se cubren; se
  mitiga con el `jobTitle` y, si hace falta, con la creación de los roles fijos adecuados.
- **Reversible:** el diseño anterior permite añadirlo sin romper el modelo actual (los
  roles fijos quedan como roles de sistema).
