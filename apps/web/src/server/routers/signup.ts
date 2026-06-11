import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import bcrypt from 'bcryptjs';
import { asPlatformAdmin, logAudit, CenterType } from '@vetlla/db';
import { createTRPCRouter, publicProcedure } from '@/server/trpc';
import { TRIAL_DAYS } from '@/lib/plans';

// Onboarding self-service: "alta de un centro en minutos" (principio #1 del
// producto y criterio de aceptación nº 1 del MVP). Crea tenant + usuario
// Dirección + centro inicial en una transacción, con prueba de TRIAL_DAYS días.
//
// Es un endpoint PÚBLICO: usa asPlatformAdmin (bypass RLS por GUC) porque el
// tenant aún no existe. La superficie está acotada: solo crea, nunca lee.

const slugify = (value: string) =>
  value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // sin diacríticos
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);

export const signupRouter = createTRPCRouter({
  register: publicProcedure
    .input(
      z.object({
        organizationName: z.string().trim().min(2).max(120),
        centerName: z.string().trim().min(2).max(120),
        centerType: z.nativeEnum(CenterType),
        adminName: z.string().trim().min(2).max(120),
        adminEmail: z.string().trim().email().max(160),
        password: z.string().min(8).max(72),
        acceptTerms: z.literal(true, {
          errorMap: () => ({ message: 'Debes aceptar las condiciones y el tratamiento de datos.' }),
        }),
      }),
    )
    .mutation(async ({ input }) => {
      const admin = asPlatformAdmin();
      const email = input.adminEmail.toLowerCase();

      const existing = await admin.user.findUnique({ where: { email }, select: { id: true } });
      if (existing) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'Ya existe una cuenta con ese email. Inicia sesión o usa otro.',
        });
      }

      // Slug único derivado del nombre (sufijo aleatorio si colisiona).
      const base = slugify(input.organizationName) || 'centro';
      let slug = base;
      if (await admin.tenant.findUnique({ where: { slug }, select: { id: true } })) {
        slug = `${base}-${Math.random().toString(36).slice(2, 6)}`;
      }

      const passwordHash = await bcrypt.hash(input.password, 10);
      const trialEndsAt = new Date(Date.now() + TRIAL_DAYS * 86_400_000);

      const tenant = await admin.$transaction(async (tx) => {
        const t = await tx.tenant.create({
          data: { name: input.organizationName, slug, plan: 'TRIAL', trialEndsAt },
        });
        await tx.user.create({
          data: {
            email,
            name: input.adminName,
            passwordHash,
            role: 'DIRECTOR',
            tenantId: t.id,
          },
        });
        await tx.center.create({
          data: { tenantId: t.id, name: input.centerName, type: input.centerType },
        });
        return t;
      });

      await logAudit(admin, {
        tenantId: tenant.id,
        actorEmail: email,
        action: 'SIGNUP',
        entity: 'Tenant',
        entityId: tenant.id,
        summary: `Alta self-service: ${input.organizationName} (${slug}), prueba de ${TRIAL_DAYS} días`,
        metadata: { centerType: input.centerType },
      });

      return { ok: true as const, slug, trialEndsAt: trialEndsAt.toISOString() };
    }),
});
