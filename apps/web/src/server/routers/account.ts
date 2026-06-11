import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { asPlatformAdmin, logAudit } from '@vetlla/db';
import { createTRPCRouter, publicProcedure } from '@/server/trpc';
import { createAuthToken, consumeAuthToken } from '@/server/account/tokens';
import { passwordResetEmail } from '@/server/account/emails';
import { sendEmail } from '@/server/email';
import { logger } from '@/server/logger';

// Flujos públicos de cuenta: reset de contraseña. Endpoints sin sesión, por eso
// usan el cliente de plataforma. Diseño anti-enumeración: requestPasswordReset
// SIEMPRE responde ok, exista o no el email (no revela quién tiene cuenta).
const authDb = asPlatformAdmin();

export const accountRouter = createTRPCRouter({
  requestPasswordReset: publicProcedure
    .input(z.object({ email: z.string().trim().email().max(160) }))
    .mutation(async ({ input }) => {
      const email = input.email.toLowerCase();
      const user = await authDb.user.findUnique({
        where: { email },
        select: { id: true },
      });
      if (user) {
        const token = await createAuthToken(user.id, 'PASSWORD_RESET');
        const mail = passwordResetEmail(token);
        try {
          await sendEmail({ to: email, subject: mail.subject, text: mail.text });
        } catch {
          // No revelamos el fallo al cliente (anti-enumeración); queda en el log.
          logger.error('account.reset_email_failed', { userId: user.id });
        }
      }
      // Respuesta uniforme (no filtra si el email existe).
      return { ok: true as const };
    }),

  resetPassword: publicProcedure
    .input(
      z.object({
        token: z.string().min(16),
        password: z.string().min(8).max(72),
      }),
    )
    .mutation(async ({ input }) => {
      const consumed = await consumeAuthToken(input.token, 'PASSWORD_RESET');
      if (!consumed) {
        return { ok: false as const, reason: 'invalid' as const };
      }
      const passwordHash = await bcrypt.hash(input.password, 10);
      const user = await authDb.user.update({
        where: { id: consumed.userId },
        data: { passwordHash },
        select: { id: true, email: true, tenantId: true },
      });
      if (user.tenantId) {
        await logAudit(authDb, {
          tenantId: user.tenantId,
          actorId: user.id,
          actorEmail: user.email,
          action: 'PASSWORD_RESET',
          entity: 'User',
          entityId: user.id,
          summary: 'Contraseña restablecida mediante enlace',
        });
      }
      return { ok: true as const };
    }),
});
