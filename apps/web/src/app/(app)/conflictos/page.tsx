'use client';

// Cola de revisión de conflictos de sincronización (R-CONF). El LWW ya resolvió
// el dato; aquí un humano VALIDA la divergencia (juicio clínico). Marcar revisado
// la saca de la cola y queda en AuditLog. Para corregir un dato mal resuelto, el
// usuario vuelve a registrarlo en su pantalla (MAR / atención).

import Link from 'next/link';
import { Badge, Button, Card, CardContent, CardTitle, EmptyState, PageHeader } from '@vetlla/ui';
import { api } from '@/trpc/react';
import { useT } from '@/i18n/provider';
import { formatDateTime } from '@/lib/format';
import { useToast } from '@/components/toast';
import { CARE_TYPE_LABELS } from '@/lib/labels';

/** Representa de forma legible un valor JSON de un campo en conflicto. */
function renderValue(v: unknown): string {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

/** Extrae status/notes de un evento de administración serializado. */
function medEventSummary(ev: unknown): { status: string; notes: string } {
  const e = (ev ?? {}) as Record<string, unknown>;
  return {
    status: typeof e.status === 'string' ? e.status : '—',
    notes: typeof e.notes === 'string' && e.notes ? e.notes : '—',
  };
}

export default function ConflictsPage() {
  const { locale, t } = useT();
  const toast = useToast();
  const utils = api.useUtils();

  const me = api.me.useQuery();
  const canRead = me.data?.permissions.includes('care:read') ?? false;
  const canReview = me.data?.permissions.includes('conflicts:review') ?? false;

  const conflicts = api.conflicts.list.useQuery(undefined, { enabled: canRead });

  const acknowledge = api.conflicts.acknowledge.useMutation({
    onSuccess: async () => {
      await utils.conflicts.list.invalidate();
      await utils.conflicts.pendingCount.invalidate();
      toast.success(t('conf.toast.done'));
    },
    onError: (e) => toast.error(e.message),
  });

  if (me.data && !canRead) {
    return <p className="text-[#1A3A3F]/60">{t('conf.noPermission')}</p>;
  }

  const data = conflicts.data;
  const total = data?.pendingCount ?? 0;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t('conf.title')}
        subtitle={t('conf.intro')}
        accent
        action={
          total > 0 ? (
            <Badge tone="amber">{t('conf.pending', { count: total })}</Badge>
          ) : undefined
        }
      />

      {conflicts.isLoading ? (
        <p className="text-[#1A3A3F]/60">…</p>
      ) : total === 0 ? (
        <EmptyState variant="check" title={t('conf.empty')} description={t('conf.emptyDesc')} />
      ) : (
        <div className="flex flex-col gap-6">
          {/* Medicación */}
          {data!.medication.length > 0 && (
            <section aria-label={t('conf.section.medication')}>
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[#1A3A3F]/60">
                {t('conf.section.medication')}
              </h2>
              <div className="flex flex-col gap-3">
                {data!.medication.map((c) => {
                  const server = medEventSummary(c.serverEvent);
                  const client = medEventSummary(c.clientEvent);
                  return (
                    <Card key={c.id}>
                      <CardContent>
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div>
                            <CardTitle className="text-base">
                              {c.medicationName} <span className="font-normal text-[#1A3A3F]/60">· {c.medicationDose}</span>
                            </CardTitle>
                            <p className="text-sm text-[#1A3A3F]/60">
                              <Link
                                href={`/residentes/${c.residentId}/resumen`}
                                className="text-brand-700 hover:underline"
                              >
                                {c.residentName}
                              </Link>{' '}
                              · {t('conf.med.scheduled')}: {formatDateTime(locale, c.scheduledAt)}
                            </p>
                          </div>
                          <Badge tone="neutral">
                            {t('conf.winner')}: {t(`conf.winner.${c.winner}`)}
                          </Badge>
                        </div>
                        <div className="mt-3 grid gap-3 sm:grid-cols-2">
                          <div className="rounded-md bg-brand-50 p-3 text-sm">
                            <p className="font-medium text-[#1A3A3F]">{t('conf.server')}</p>
                            <p className="text-[#1A3A3F]/70">{t('conf.status')}: {server.status}</p>
                            <p className="text-[#1A3A3F]/70">{t('conf.notes')}: {server.notes}</p>
                          </div>
                          <div className="rounded-md bg-brand-50 p-3 text-sm">
                            <p className="font-medium text-[#1A3A3F]">{t('conf.client')}</p>
                            <p className="text-[#1A3A3F]/70">{t('conf.status')}: {client.status}</p>
                            <p className="text-[#1A3A3F]/70">{t('conf.notes')}: {client.notes}</p>
                          </div>
                        </div>
                        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                          <span className="text-xs text-[#1A3A3F]/40">
                            {t('conf.detectedAt')}: {formatDateTime(locale, c.resolvedAt)}
                          </span>
                          {canReview && (
                            <Button
                              size="sm"
                              onClick={() => acknowledge.mutate({ kind: 'medication', id: c.id })}
                              disabled={acknowledge.isPending}
                            >
                              {acknowledge.isPending ? t('conf.reviewing') : t('conf.acknowledge')}
                            </Button>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </section>
          )}

          {/* Atención directa */}
          {data!.care.length > 0 && (
            <section aria-label={t('conf.section.care')}>
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[#1A3A3F]/60">
                {t('conf.section.care')}
              </h2>
              <div className="flex flex-col gap-3">
                {data!.care.map((c) => (
                  <Card key={c.id}>
                    <CardContent>
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <CardTitle className="text-base">
                            {CARE_TYPE_LABELS[c.recordType] ?? c.recordType}
                            <span className="ml-2 font-normal text-[#1A3A3F]/60">· {t('conf.field')}: {c.field}</span>
                          </CardTitle>
                          <p className="text-sm text-[#1A3A3F]/60">
                            <Link
                              href={`/residentes/${c.residentId}/resumen`}
                              className="text-brand-700 hover:underline"
                            >
                              {c.residentName}
                            </Link>
                          </p>
                        </div>
                        <Badge tone="neutral">
                          {t('conf.winner')}: {t(`conf.winner.${c.winner}`)}
                        </Badge>
                      </div>
                      <div className="mt-3 grid gap-3 sm:grid-cols-2">
                        <div className="rounded-md bg-brand-50 p-3 text-sm">
                          <p className="font-medium text-[#1A3A3F]">{t('conf.server')}</p>
                          <p className="text-[#1A3A3F]/70">{renderValue(c.serverValue)}</p>
                        </div>
                        <div className="rounded-md bg-brand-50 p-3 text-sm">
                          <p className="font-medium text-[#1A3A3F]">{t('conf.client')}</p>
                          <p className="text-[#1A3A3F]/70">{renderValue(c.clientValue)}</p>
                        </div>
                      </div>
                      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                        <span className="text-xs text-[#1A3A3F]/40">
                          {t('conf.detectedAt')}: {formatDateTime(locale, c.resolvedAt)}
                        </span>
                        {canReview && (
                          <Button
                            size="sm"
                            onClick={() => acknowledge.mutate({ kind: 'care', id: c.id })}
                            disabled={acknowledge.isPending}
                          >
                            {acknowledge.isPending ? t('conf.reviewing') : t('conf.acknowledge')}
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
