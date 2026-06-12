/**
 * assertFamilyAccess — guardia de aislamiento por residente para el portal de familias.
 *
 * Este es el control de seguridad más crítico del portal: garantiza que un familiar
 * solo puede operar sobre residentes a los que está vinculado vía FamilyLink.
 *
 * Antes vivía como copia byte-a-byte en requests.ts, comms.ts y visits.ts.
 * Centralizado aquí para que un fix de seguridad se aplique en un solo lugar y
 * para que los tests de cada router lo cubran sin riesgo de que una copia quede
 * sin parchear (hallazgo H-4 de la revisión de arquitectura 2026-06-12).
 *
 * Firma: recibe `ctx` (ya contiene `db` con RLS activa + `session`) y el `residentId`.
 * No devuelve nada; lanza TRPCError FORBIDDEN si no hay vínculo.
 */

import { TRPCError } from '@trpc/server';
import type { TenantPrisma } from '@vetlla/db';

/**
 * Verifica que el `userId` del contexto está vinculado al residente vía FamilyLink.
 * Lanza TRPCError FORBIDDEN si no existe el vínculo.
 *
 * @param db         Cliente Prisma acotado al tenant (con RLS).
 * @param userId     ID del usuario autenticado (ctx.session.user.id).
 * @param residentId ID del residente que se quiere operar.
 */
export async function assertFamilyAccess(
  db: TenantPrisma,
  userId: string,
  residentId: string,
): Promise<void> {
  const link = await db.familyLink.findFirst({
    where:  { userId, residentId },
    select: { id: true },
  });
  if (!link) {
    throw new TRPCError({
      code:    'FORBIDDEN',
      message: 'No estás vinculado a este residente.',
    });
  }
}
