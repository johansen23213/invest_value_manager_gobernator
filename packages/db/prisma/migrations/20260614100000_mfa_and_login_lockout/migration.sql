-- MFA (TOTP) + Bloqueo de cuenta por intentos fallidos
-- RNF-SEG-002 (MFA) + RNF-SEG-011 (lockout)
--
-- DISEÑO:
--
--   User: +failedLoginAttempts (int default 0), +lockedUntil (nullable),
--         +mfaSecret (nullable — secreto TOTP base32; TODO: cifrar en reposo
--          con columna-level encryption en Q-SEC cuando se añada KMS EU-soberano),
--         +mfaEnabledAt (nullable — null = MFA inactivo).
--
--   MfaRecoveryCode: tabla dedicada para los códigos de recuperación.
--     - tenantId + RLS ENABLE+FORCE: aunque es infraestructura de auth (como
--       AuthToken), los códigos de recuperación pertenecen a usuarios con
--       tenant y deben estar aislados. A diferencia de AuthToken (cross-tenant
--       por diseño), la mayoría de usuarios tienen tenant; un SUPERADMIN sin
--       tenant puede tener tenantId = '' (string vacío) que la política RLS
--       maneja por bypass. Decisión tomada en diseño: seguir el patrón
--       FamilyLink / CareRecord (dato de usuario con tenant → RLS).
--     - Se guarda el hash SHA-256 del código, nunca el valor en claro.
--     - usedAt nullable: null = disponible; timestamp = consumido.
--     - onDelete Cascade desde users.
--
-- RLS: mfa_recovery_codes lleva tenantId + ENABLE+FORCE + policy (como el
-- resto de tablas con datos de tenant). El test rls-coverage.test.ts lo verificará.
--
-- NOTA: Postgres no disponible en este entorno (sin docker). La migración está
-- escrita siguiendo el patrón exacto del repo pero NO puede ejecutarse aquí.
-- El test de aislamiento RLS queda marcado TODO hasta que se corra contra BD real.

-- ---------------------------------------------------------------------------
-- 1. Campos MFA en users (columnas nullable, no destructivas)
-- ---------------------------------------------------------------------------

ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "mfa_secret"           TEXT,
  ADD COLUMN IF NOT EXISTS "mfa_enabled_at"        TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "failed_login_attempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "locked_until"          TIMESTAMP(3);

-- ---------------------------------------------------------------------------
-- 2. Tabla mfa_recovery_codes
-- ---------------------------------------------------------------------------
-- tenantId: mismo tenant que el usuario. Para SUPERADMIN (sin tenant) se usa
-- el string vacío '' en lugar de NULL para mantener consistencia con la política
-- RLS (que compara contra current_setting; '' nunca coincide con un tenant real,
-- pero el bypass_rls del SUPERADMIN evita el filtro de todas formas).
--
-- codeHash: SHA-256 del código plano en formato hex (64 chars).
-- usedAt: null = disponible; timestamp = código ya consumido (no se borra para
-- auditoría, se marca como usado).

CREATE TABLE "mfa_recovery_codes" (
  "id"         TEXT          NOT NULL,
  "tenant_id"  TEXT          NOT NULL,
  "user_id"    TEXT          NOT NULL,
  "code_hash"  TEXT          NOT NULL,
  "used_at"    TIMESTAMP(3),
  "created_at" TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "mfa_recovery_codes_pkey" PRIMARY KEY ("id")
);

-- Índice único por hash (evita colisiones y permite lookup eficiente).
CREATE UNIQUE INDEX "mfa_recovery_codes_code_hash_key" ON "mfa_recovery_codes"("code_hash");

-- Índices operativos
CREATE INDEX "mfa_recovery_codes_tenant_id_idx" ON "mfa_recovery_codes"("tenant_id");
CREATE INDEX "mfa_recovery_codes_user_id_idx"   ON "mfa_recovery_codes"("user_id");

-- FK hacia users (cascade: si se borra el usuario se borran sus recovery codes).
ALTER TABLE "mfa_recovery_codes"
  ADD CONSTRAINT "mfa_recovery_codes_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- 3. RLS en mfa_recovery_codes
--    Mismo patrón que el resto del repo (family_links, audit_logs, etc.)
-- ---------------------------------------------------------------------------

ALTER TABLE "mfa_recovery_codes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "mfa_recovery_codes" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "mfa_recovery_codes"
  USING (
    current_setting('app.bypass_rls', TRUE) = 'on'
    OR tenant_id = current_setting('app.tenant_id', TRUE)
  )
  WITH CHECK (
    current_setting('app.bypass_rls', TRUE) = 'on'
    OR tenant_id = current_setting('app.tenant_id', TRUE)
  );
