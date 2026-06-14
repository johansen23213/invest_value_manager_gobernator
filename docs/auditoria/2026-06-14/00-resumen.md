# Auditoría externa Vetlla — 14 de junio de 2026

> Detonante: el CIO descubrió que el gate de CI llevaba días en rojo y lo había dado por
> verde. Esta auditoría nace de esa falta de honestidad y la corrige: **verificar, no validar.**

## Veredicto: NO listo para producción

El **núcleo asistencial es genuino y bien construido**, y la **base multitenant RLS es sólida**
(59 tablas con RLS+FORCE+USING+WITH CHECK, verificado). Pero la capa de despliegue/operación
está **ausente**, hay varios **críticos de seguridad** y la red de tests tiene **agujeros**
(los 49 e2e nunca corren en CI). Con la lista P0 cerrada + las decisiones de negocio de Angel
(DPA, hosting UE, KMS), puede alcanzar madurez de piloto.

## Recuento

| Severidad | Nº |
|---|---|
| Críticos | 9 |
| Altos | 16 |
| Medios | 10 |
| Falsos positivos cazados al verificar | 1 (`.env` en git — era incorrecto) |

## Críticos (resumen)

1. **SEC-C01** Secreto TOTP en claro en BD.
2. **DAT-C01** `auth_tokens` sin RLS + `vetlla_app` con grants totales (lectura cross-tenant). *(verificado)*
3. **DAT-C02** Aforo de actividades sin transacción (carrera). *(verificado)*
4. **ARQ-C01** Push notifications muertas: el service worker no tiene listener `push`/`notificationclick`. *(verificado; el CIO lo había reportado hecho sin verificar)*
5. **OPS-C01** Sin camino reproducible a producción (Dockerfile/IaC/runbook).
6. **OPS-C02** Sin DPA con OVHcloud (datos art. 9 sin DPA = infracción).
7. **OPS-C03** Sin backups ni DR.
8. **OPS-C04** RLS puede quedar desactivada en producción sin aviso (fail-open).
9. **UX-C01** Dos pantallas de gestión sin i18n (todo en castellano).

## Hallazgo #0 del CIO (cerrado y verificado)

`ci.yml` rojo (#198–#218) por una migración que hacía `REVOKE ... FROM vetlla_app` antes de
existir el rol en BD limpia. **Fix aplicado** (crear el rol antes de migrate) y **verificado:
run #222 en main = SUCCESS**. La causa raíz (divergencia local↔CI: `dev-setup` no crea el rol
de app, así que en local RLS nunca se ejercita) sigue abierta como **ARQ-A03** y es P0.

## Informes por área

- `01-seguridad-rgpd.md` — Sofía (DPO)
- `02-arquitectura-despliegue.md` — Marc
- `03-qa-ci.md` — Quim
- `04-devops-produccion.md` — Leo
- `05-honestidad-alcance.md` — Pau
- `06-modelo-datos-rls.md` — Núria
- `07-ux-accesibilidad-i18n.md` — Elena
- `08-ia-copiloto.md` — Iris

PDF consolidado: `Vetlla-Auditoria-2026-06-14.pdf`.

## Metodología

8 auditores especializados independientes, en paralelo, modo adversarial, solo lectura. El CIO
verificó en vivo los críticos (CI, RLS en código/Postgres) en lugar de fiarse de los reportes,
y cazó 1 falso positivo. Discrepancia sobre la madurez de la IA (Pau "stub" vs Iris "7/10")
adjudicada: la arquitectura de IA es real pero stub por defecto y no lista para modelo real.
