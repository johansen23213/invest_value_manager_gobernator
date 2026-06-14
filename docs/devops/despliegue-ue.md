# Runbook de despliegue UE — Vetlla
**Fecha:** 2026-06-14
**Owner:** leo-devops
**Estado:** bloqueado en Q-004 (credenciales OVHcloud + DPA — Angel)

---

## Prerequisito legal (BLOQUEANTE)

No se puede operar con datos de salud reales (art. 9 RGPD) hasta que:

- DPA firmado con OVHcloud HDS (Q-004 — Angel).
- Postgres gestionado contratado en región EU (OVHcloud Managed Databases, zona GRA o SBG).
- DPIA cerrada con Sofia DPO.

Este runbook documenta el procedimiento técnico. La ejecución real depende del cierre de Q-004.

---

## Infraestructura objetivo (OVHcloud, ADR-0011)

| Componente | Servicio | Región |
|---|---|---|
| App Next.js | OVHcloud Instances (Public Cloud) o Kubernetes | GRA (Gravelines, Francia) |
| Postgres | OVHcloud Managed Databases for PostgreSQL 16 | GRA |
| Secretos | OVHcloud Key Management Service (KMS) o Vault OSS | GRA |
| Registry Docker | OVHcloud Managed Private Registry o Harbor auto-alojado | GRA |
| DNS + TLS | OVHcloud Domain + Let's Encrypt / OVHcloud SSL | — |

---

## Variables de entorno obligatorias en producción

Todas se inyectan en runtime desde el gestor de secretos. NUNCA en el Dockerfile ni en git.

| Variable | Descripción |
|---|---|
| `DATABASE_URL` | Conexión owner `vetlla` (solo para migrate:deploy y app-role.sql) |
| `APP_DATABASE_URL` | Conexión `vetlla_app` (NOSUPERUSER NOBYPASSRLS). **Obligatoria en producción.** Si no está, la app falla al arrancar. |
| `AUTH_SECRET` | Secreto de sesión Auth.js. Mínimo 32 bytes aleatorios. |
| `NEXTAUTH_URL` | URL pública de la app (p. ej. `https://app.vetlla.es`). |
| `AUTH_URL` | Igual que `NEXTAUTH_URL`. |
| `EMAIL_PROVIDER` | `http` en producción. |
| `EMAIL_API_URL` | URL del servicio de email (Brevo, Postmark — UE). |
| `EMAIL_API_KEY` | Clave del proveedor de email. |
| `AI_PROVIDER` | `vllm` (OVHcloud AI Endpoints) o `stub` (sin IA). |
| `AI_VLLM_BASE_URL` | URL del endpoint vLLM EU. Requerida si `AI_PROVIDER=vllm`. |
| `AI_VLLM_API_KEY` | Clave del endpoint. |
| `VAPID_PUBLIC_KEY` | Clave pública VAPID para push notifications. |
| `VAPID_PRIVATE_KEY` | Clave privada VAPID. Rotar con procedimiento específico (ver sección Rotación). |
| `VAPID_SUBJECT` | `mailto:ops@vetlla.es` |

---

## Orden de arranque (CRÍTICO — no alterar la secuencia)

El orden incorrecto causa errores irrecuperables: `migrate:deploy` falla si `vetlla_app`
no existe; la app se conecta como owner y RLS no aplica si falta `APP_DATABASE_URL`.

### Primera vez (BD nueva)

```
1. Aprovisionar BD Postgres gestionada en OVHcloud.
   - Crear usuario/rol owner: vetlla (o usar el usuario base del proveedor).
   - Resolver Q-005: confirmar si CREATE ROLE está permitido desde el usuario base,
     o si vetlla_app se aprovisiona desde la consola del proveedor.

2. Ejecutar app-role-bootstrap.sql (crea vetlla_app ANTES de migrate):
   psql "$DATABASE_URL" \
     -v ON_ERROR_STOP=1 \
     -v app_password="<secreto de vetlla_app>" \
     -f packages/db/prisma/sql/app-role-bootstrap.sql

3. Aplicar migraciones (como usuario owner):
   DATABASE_URL="$DATABASE_URL" pnpm --filter @vetlla/db migrate:deploy

4. Conceder privilegios a vetlla_app (después de que las tablas existan):
   psql "$DATABASE_URL" \
     -v ON_ERROR_STOP=1 \
     -v app_password="<secreto de vetlla_app>" \
     -f packages/db/prisma/sql/app-role.sql

5. (Opcional) Seed inicial si se quiere un tenant de demostración:
   DATABASE_URL="$DATABASE_URL" pnpm --filter @vetlla/db run seed

6. Arrancar el contenedor Docker:
   docker run \
     -e DATABASE_URL="..." \
     -e APP_DATABASE_URL="..." \
     -e AUTH_SECRET="..." \
     -e AUTH_URL="https://app.vetlla.es" \
     -e EMAIL_PROVIDER="http" \
     -e EMAIL_API_URL="..." \
     -e EMAIL_API_KEY="..." \
     -e AI_PROVIDER="vllm" \
     -e AI_VLLM_BASE_URL="..." \
     -e AI_VLLM_API_KEY="..." \
     -e VAPID_PUBLIC_KEY="..." \
     -e VAPID_PRIVATE_KEY="..." \
     -e VAPID_SUBJECT="mailto:ops@vetlla.es" \
     -p 3000:3000 \
     <registry>/vetlla-web:<tag>
```

### Deploy de actualización (migración + nueva imagen)

```
1. Si hay migraciones nuevas:
   a. Ejecutar migrate:deploy (parar tráfico si la migración no es backward-compatible).
   b. Si hay tablas nuevas: ejecutar app-role.sql para refrescar los GRANT.

2. Arrancar nueva imagen (rolling update si el orquestador lo soporta).
```

### Rollback de migración

Prisma no tiene rollback automático. Procedimiento:

```
1. Restaurar backup/snapshot de la BD al punto anterior (ver docs/devops/backup-dr.md).
2. Redesplegar la imagen de la versión anterior (sin la migración).
3. Si la migración es backward-compatible (solo ADD COLUMN), se puede dejar la BD
   y redesplegar sin restore (la columna extra no causa error en la versión anterior).
```

---

## Comprobación de arranque (fail-fast)

La app debe fallar al arrancar (no en runtime) si falta `APP_DATABASE_URL` en producción.
Esto está pendiente de implementar en `apps/web/src/env.ts` (ver H-04 auditoría).

Mientras tanto, verificar manualmente antes de arrancar:
```
echo $APP_DATABASE_URL  # debe estar set
psql "$APP_DATABASE_URL" -c "SELECT current_user, current_setting('app.tenant_id', true);"
# current_user debe ser 'vetlla_app', no 'vetlla'
```

---

## Construcción de la imagen Docker

```bash
# Desde la raíz del repo:
docker build -t vetlla-web:<tag> .

# Publicar al registry UE (cuando Q-004 esté cerrado):
docker tag vetlla-web:<tag> <registry-eu>/vetlla-web:<tag>
docker push <registry-eu>/vetlla-web:<tag>
```

La imagen usa `output: 'standalone'` de Next.js → el artefacto final no contiene
pnpm ni node_modules del monorepo completo. Imagen de runtime estimada: ~200-300 MB.

---

## Nota sobre hosting UE (Q-004)

El despliegue real está bloqueado por Q-004 (credenciales OVHcloud + DPA firmado).
Sin DPA, cualquier dato de salud (art. 9 RGPD) en producción es infracción legal.

Escalada obligatoria a Angel antes de:
- Crear la instancia de Postgres en producción.
- Subir cualquier imagen al registry con datos reales.
- Arrancar la app con `NODE_ENV=production` y datos de residentes.

Referencias: ADR-0011 (proveedor UE), INC-3 (deploy bloqueado), Q-004, Q-005.
