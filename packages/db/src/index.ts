export { prisma } from './client';
export { forTenant, asPlatformAdmin } from './rls';
export type { TenantContext, TenantPrisma } from './rls';
export { mergeCareRecord, applyCareRecordPush } from './care-sync';
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
