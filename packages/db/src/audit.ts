import { Prisma } from '@prisma/client';
import type { TenantPrisma } from './rls';

// Registro de auditoría (RGPD). Append-only: solo se inserta, nunca se modifica.
export interface AuditEntry {
  tenantId: string;
  actorId?: string | null;
  actorEmail?: string | null;
  action: string; // CREATE | UPDATE | DELETE | ADMINISTER | RECORD | LOGIN ...
  entity: string; // Resident | Medication | CareRecord | CarePlan ...
  entityId?: string | null;
  summary?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Inserta una entrada de auditoría usando un cliente acotado al tenant (RLS).
 * No debe lanzar y romper la operación de negocio: los fallos se registran.
 */
export async function logAudit(db: TenantPrisma, entry: AuditEntry): Promise<void> {
  try {
    await db.auditLog.create({
      data: {
        tenantId: entry.tenantId,
        actorId: entry.actorId ?? null,
        actorEmail: entry.actorEmail ?? null,
        action: entry.action,
        entity: entry.entity,
        entityId: entry.entityId ?? null,
        summary: entry.summary,
        metadata:
          entry.metadata === undefined
            ? Prisma.JsonNull
            : (entry.metadata as Prisma.InputJsonValue),
      },
    });
  } catch (error) {
    console.error('[audit] no se pudo registrar la acción', entry.action, entry.entity, error);
  }
}
