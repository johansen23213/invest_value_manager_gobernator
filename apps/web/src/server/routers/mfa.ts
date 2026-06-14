/**
 * Router MFA TOTP (RNF-SEG-002).
 *
 * Flujo de activación:
 *   1. setup    → genera secreto pendiente (en BD, mfaEnabledAt=null), devuelve otpauthUrl para QR.
 *   2. confirm  → valida el primer código TOTP; si OK: activa MFA (mfaEnabledAt=now),
 *                 genera 10 recovery codes (devuelve los planos UNA sola vez), audita.
 *   3. status   → devuelve si MFA está activo y cuántos recovery codes quedan.
 *   4. disable  → requiere TOTP o recovery code + contraseña actual; desactiva, audita.
 *   5. regenerateRecoveryCodes → requiere TOTP válido; reemplaza los codes.
 *
 * Integración en login (auth.ts):
 *   El campo `totp` se acepta opcionalmente en el flujo de credenciales. Si el usuario
 *   tiene MFA activo y no envía `totp`, se rechaza con error "MFA_REQUIRED". Si lo envía
 *   pero es incorrecto, se rechaza con "MFA_INVALID". Acepta también recovery code.
 *
 * Nota de seguridad:
 *   El secreto TOTP se guarda en texto en la BD (mfa_secret).
 *   TODO Q-SEC: cifrar en reposo cuando se integre KMS EU-soberano (ADR pendiente).
 *   El riesgo es mitigado por:
 *     - Acceso a BD solo desde el rol vetlla_app (sin acceso directo externo).
 *     - El secreto solo se usa server-side.
 *     - La columna no se serializa en el cliente (selects explícitos en todos los endpoints).
 */

import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import bcrypt from 'bcryptjs';
import { asPlatformAdmin } from '@vetlla/db';
import { createTRPCRouter, protectedProcedure } from '@/server/trpc';
import { generateTotpSecret, buildOtpauthUrl, verifyTotp } from '@/lib/totp';
import { generateRecoveryCodes, findRecoveryCodeHash } from '@/lib/mfa-recovery';

// Cliente cross-tenant para leer/escribir en users (igual que auth.ts).
// La tabla users no tiene RLS propia; el acceso a los campos MFA del propio
// usuario se hace con el cliente de plataforma (mismo patrón que auth.ts).
const authDb = asPlatformAdmin();

// ---------------------------------------------------------------------------
// Helpers internos
// ---------------------------------------------------------------------------

/** Comprueba TOTP o recovery code. Devuelve el tipo de factor usado o lanza TRPCError. */
async function verifySecondFactor(
  userId: string,
  mfaSecret: string,
  opts: { totp?: string; recoveryCode?: string },
): Promise<'totp' | 'recovery'> {
  if (opts.totp) {
    if (!(await verifyTotp(mfaSecret, opts.totp))) {
      throw new TRPCError({ code: 'UNAUTHORIZED', message: 'MFA_INVALID' });
    }
    return 'totp';
  }

  if (opts.recoveryCode) {
    // Busca los recovery codes disponibles (sin usedAt) para el usuario.
    // Usa el cliente de plataforma (cross-tenant) porque la operación
    // necesita acceso al tenantId del usuario para el cliente RLS.
    const codes = await authDb.mfaRecoveryCode.findMany({
      where: { userId, usedAt: null },
      select: { id: true, codeHash: true },
    });

    const availableHashes = codes.map((c) => c.codeHash);
    const matchedHash = await findRecoveryCodeHash(availableHashes, opts.recoveryCode);

    if (!matchedHash) {
      throw new TRPCError({ code: 'UNAUTHORIZED', message: 'MFA_INVALID' });
    }

    // Marca el recovery code como usado (no se borra: trazabilidad de auditoría).
    const codeRow = codes.find((c) => c.codeHash === matchedHash)!;
    await authDb.mfaRecoveryCode.update({
      where: { id: codeRow.id },
      data: { usedAt: new Date() },
    });

    return 'recovery';
  }

  throw new TRPCError({ code: 'BAD_REQUEST', message: 'Falta código TOTP o código de recuperación.' });
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export const mfaRouter = createTRPCRouter({
  /**
   * Genera un secreto TOTP pendiente y devuelve la URL otpauth:// para el QR.
   * NO activa MFA todavía (mfaEnabledAt queda null; se activa en `confirm`).
   *
   * Si el usuario ya tiene MFA activo, devuelve error para evitar sobreescribir
   * accidentalmente (debe desactivar primero con `disable`).
   */
  setup: protectedProcedure.mutation(async ({ ctx }) => {
    const userId = ctx.session.user.id;
    const email = ctx.session.user.email ?? '';

    const user = await authDb.user.findUnique({
      where: { id: userId },
      select: { mfaEnabledAt: true },
    });

    if (!user) throw new TRPCError({ code: 'UNAUTHORIZED' });

    if (user.mfaEnabledAt) {
      throw new TRPCError({
        code: 'CONFLICT',
        message: 'MFA ya está activo. Desactívalo antes de reconfigurarlo.',
      });
    }

    const secret = generateTotpSecret();

    // Persiste el secreto pendiente (mfaEnabledAt sigue null hasta confirm).
    await authDb.user.update({
      where: { id: userId },
      data: { mfaSecret: secret },
    });

    return {
      otpauthUrl: buildOtpauthUrl(secret, email),
    };
  }),

  /**
   * Confirma el primer código TOTP del setup; activa MFA y genera recovery codes.
   * Los códigos planos se devuelven UNA SOLA VEZ. El cliente debe mostrarlos al usuario.
   */
  confirm: protectedProcedure
    .input(z.object({ code: z.string().length(6).regex(/^\d{6}$/) }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      const user = await authDb.user.findUnique({
        where: { id: userId },
        select: { mfaSecret: true, mfaEnabledAt: true, tenantId: true, email: true },
      });

      if (!user) throw new TRPCError({ code: 'UNAUTHORIZED' });

      if (!user.mfaSecret) {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: 'Inicia el setup de MFA primero (llama a mfa.setup).',
        });
      }

      if (user.mfaEnabledAt) {
        throw new TRPCError({ code: 'CONFLICT', message: 'MFA ya está activo.' });
      }

      if (!(await verifyTotp(user.mfaSecret, input.code))) {
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'MFA_INVALID' });
      }

      // Genera los recovery codes
      const pairs = await generateRecoveryCodes();
      const tenantId = user.tenantId ?? '';

      // Activa MFA + persiste recovery codes en transacción
      await authDb.$transaction([
        authDb.user.update({
          where: { id: userId },
          data: { mfaEnabledAt: new Date() },
        }),
        authDb.mfaRecoveryCode.createMany({
          data: pairs.map((p) => ({
            tenantId,
            userId,
            codeHash: p.hash,
          })),
        }),
        // Auditoría: MFA activado
        authDb.auditLog.create({
          data: {
            tenantId: tenantId || 'PLATFORM',
            actorId: userId,
            actorEmail: user.email,
            action: 'MFA_ENABLED',
            entity: 'User',
            entityId: userId,
            summary: 'MFA TOTP activado',
          },
        }),
      ]);

      // Devuelve los códigos planos UNA sola vez.
      return {
        recoveryCodes: pairs.map((p) => p.plain),
      };
    }),

  /**
   * Estado actual de MFA del usuario.
   * No devuelve el secreto (nunca sale del servidor).
   */
  status: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.session.user.id;

    const user = await authDb.user.findUnique({
      where: { id: userId },
      select: { mfaEnabledAt: true },
    });

    if (!user) throw new TRPCError({ code: 'UNAUTHORIZED' });

    const remainingCodes = user.mfaEnabledAt
      ? await authDb.mfaRecoveryCode.count({
          where: { userId, usedAt: null },
        })
      : 0;

    return {
      enabled: !!user.mfaEnabledAt,
      enabledAt: user.mfaEnabledAt ?? null,
      remainingRecoveryCodes: remainingCodes,
    };
  }),

  /**
   * Desactiva MFA. Requiere TOTP O recovery code + contraseña actual.
   * Borra el secreto y todos los recovery codes. Audita.
   */
  disable: protectedProcedure
    .input(
      z.object({
        password: z.string().min(1),
        totp: z.string().length(6).regex(/^\d{6}$/).optional(),
        recoveryCode: z.string().length(8).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      const user = await authDb.user.findUnique({
        where: { id: userId },
        select: {
          mfaSecret: true,
          mfaEnabledAt: true,
          passwordHash: true,
          tenantId: true,
          email: true,
        },
      });

      if (!user) throw new TRPCError({ code: 'UNAUTHORIZED' });
      if (!user.mfaEnabledAt || !user.mfaSecret) {
        throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'MFA no está activo.' });
      }

      // Verificar contraseña actual
      const passwordOk = await bcrypt.compare(input.password, user.passwordHash);
      if (!passwordOk) {
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Contraseña incorrecta.' });
      }

      const tenantId = user.tenantId ?? '';
      await verifySecondFactor(userId, user.mfaSecret, {
        totp: input.totp,
        recoveryCode: input.recoveryCode,
      });

      // Desactiva MFA, borra secreto y recovery codes; audita
      await authDb.$transaction([
        authDb.user.update({
          where: { id: userId },
          data: { mfaSecret: null, mfaEnabledAt: null },
        }),
        authDb.mfaRecoveryCode.deleteMany({ where: { userId } }),
        authDb.auditLog.create({
          data: {
            tenantId: tenantId || 'PLATFORM',
            actorId: userId,
            actorEmail: user.email,
            action: 'MFA_DISABLED',
            entity: 'User',
            entityId: userId,
            summary: 'MFA TOTP desactivado',
          },
        }),
      ]);

      return { ok: true as const };
    }),

  /**
   * Regenera los recovery codes. Requiere TOTP válido.
   * Elimina todos los codes anteriores (usados o no) y genera 10 nuevos.
   * Devuelve los nuevos códigos planos UNA sola vez.
   */
  regenerateRecoveryCodes: protectedProcedure
    .input(z.object({ totp: z.string().length(6).regex(/^\d{6}$/) }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      const user = await authDb.user.findUnique({
        where: { id: userId },
        select: { mfaSecret: true, mfaEnabledAt: true, tenantId: true, email: true },
      });

      if (!user) throw new TRPCError({ code: 'UNAUTHORIZED' });
      if (!user.mfaEnabledAt || !user.mfaSecret) {
        throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'MFA no está activo.' });
      }

      if (!(await verifyTotp(user.mfaSecret, input.totp))) {
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'MFA_INVALID' });
      }

      const pairs = await generateRecoveryCodes();
      const tenantId = user.tenantId ?? '';

      await authDb.$transaction([
        // Elimina todos los codes anteriores
        authDb.mfaRecoveryCode.deleteMany({ where: { userId } }),
        // Crea los nuevos
        authDb.mfaRecoveryCode.createMany({
          data: pairs.map((p) => ({
            tenantId,
            userId,
            codeHash: p.hash,
          })),
        }),
        authDb.auditLog.create({
          data: {
            tenantId: tenantId || 'PLATFORM',
            actorId: userId,
            actorEmail: user.email,
            action: 'MFA_RECOVERY_CODES_REGENERATED',
            entity: 'User',
            entityId: userId,
            summary: 'Recovery codes de MFA regenerados',
          },
        }),
      ]);

      return {
        recoveryCodes: pairs.map((p) => p.plain),
      };
    }),
});
