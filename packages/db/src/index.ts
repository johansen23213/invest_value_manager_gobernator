export { prisma } from './client';
export { forTenant, asPlatformAdmin } from './rls';
export type { TenantContext, TenantPrisma } from './rls';
export { mergeCareRecord, applyCareRecordPush } from './care-sync';
export { mergeAdministration, applyMedicationAdminPush } from './med-sync';
export type {
  AdminEvent,
  AdminMergeResult,
  IncomingMedAdminEvent,
  MedPushResult,
} from './med-sync';
export { logAudit } from './audit';
export type { AuditEntry } from './audit';
export {
  exportResidentData,
  anonymizeResident,
  DEFAULT_ANONYMIZE_POLICY,
} from './dsar';
export type {
  AnonymizePolicy,
  AnonymizeResult,
  ResidentExport,
  ResidentExportResult,
} from './dsar';
export type {
  Payload,
  FieldTimestamps,
  FieldValue,
  MergeConflict,
  MergeResult,
  IncomingCareRecord,
  PushResult,
} from './care-sync';
export * from '@prisma/client';
