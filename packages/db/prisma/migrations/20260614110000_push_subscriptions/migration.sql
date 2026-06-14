-- Notificaciones push Web Push / VAPID (RF-NOT-001..005)
--
-- PushSubscription: suscripción de un dispositivo del usuario a las push
-- notifications del navegador. Un usuario puede tener varios dispositivos.
-- La tabla pertenece al Usuario (userId), no al Residente → no entra en
-- dsar-registry de residentes. Sí tiene tenantId → RLS ENABLE+FORCE obligatorio.
--
-- expiredAt: null = activa; timestamp = endpoint ha devuelto 410/404 y se marcó
-- como caducada. No se borra inmediatamente para mantener trazabilidad de auditoría.
-- El GC puede borrarlas periódicamente en el futuro.
--
-- Claves VAPID: nunca se almacenan en la BD; viven en las variables de entorno
-- VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT (ver .env.example).
--
-- RLS ENABLE + FORCE + política por GUC app.tenant_id — patrón idéntico al
-- resto del proyecto (plantilla de 20260613220000_shifts).
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. Tabla push_subscriptions
-- ---------------------------------------------------------------------------

CREATE TABLE "push_subscriptions" (
  "id"           TEXT         NOT NULL DEFAULT gen_random_uuid()::TEXT,
  "tenant_id"    TEXT         NOT NULL,
  "user_id"      TEXT         NOT NULL,
  -- Endpoint URL del push service del navegador (único por suscripción).
  -- Se usa como clave de upsert: si el mismo endpoint re-suscribe, actualizamos.
  "endpoint"     TEXT         NOT NULL,
  -- Claves públicas del dispositivo necesarias para cifrar el payload (Web Push).
  -- No son secretos del servidor; son material de cifrado del cliente.
  "p256dh"       TEXT         NOT NULL,
  "auth"         TEXT         NOT NULL,
  -- Identificador de dispositivo opcional (valor del User-Agent), útil en la UI
  -- de gestión de dispositivos para que el usuario identifique qué suscripción es.
  "user_agent"   TEXT,
  "created_at"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  -- Última vez que el dispositivo se comunicó con la app (actualizado en subscribe).
  "last_seen_at" TIMESTAMP(3),
  -- Relleno con el timestamp del fallo cuando el push service devuelve 410/404.
  -- null = suscripción activa.
  "expired_at"   TIMESTAMP(3),

  CONSTRAINT "push_subscriptions_pkey" PRIMARY KEY ("id"),
  -- Unicidad por endpoint: garantiza idempotencia del upsert.
  CONSTRAINT "push_subscriptions_endpoint_key" UNIQUE ("endpoint"),
  CONSTRAINT "push_subscriptions_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
);

-- Índice por tenant (requerido por el coverage test de RLS).
CREATE INDEX "push_subscriptions_tenant_id_idx"
  ON "push_subscriptions"("tenant_id");

-- Índice por userId: el caso de uso más común es "dame las suscripciones de
-- este usuario para enviarle una notificación".
CREATE INDEX "push_subscriptions_user_id_idx"
  ON "push_subscriptions"("user_id");

-- ---------------------------------------------------------------------------
-- 2. RLS — Row-Level Security (ENABLE + FORCE + política por tenant_id)
--    Patrón idéntico al resto del proyecto: GUC app.tenant_id + bypass.
-- ---------------------------------------------------------------------------

ALTER TABLE "push_subscriptions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "push_subscriptions" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "push_subscriptions"
  USING (
    current_setting('app.bypass_rls', TRUE) = 'on'
    OR tenant_id = current_setting('app.tenant_id', TRUE)
  )
  WITH CHECK (
    current_setting('app.bypass_rls', TRUE) = 'on'
    OR tenant_id = current_setting('app.tenant_id', TRUE)
  );

-- ---------------------------------------------------------------------------
-- 3. Grants para el rol de aplicación vetlla_app (idempotente).
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'vetlla_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE
      ON "push_subscriptions"
      TO vetlla_app;
  END IF;
END $$;
