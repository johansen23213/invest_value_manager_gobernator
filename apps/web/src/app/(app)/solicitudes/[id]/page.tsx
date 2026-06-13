'use client';

import { use, useRef, useState } from 'react';
import Link from 'next/link';
import { Badge, Button, Card, CardContent, Label, SectionCard, Select, Skeleton } from '@vetlla/ui';
import { api } from '@/trpc/react';
import { useT } from '@/i18n/provider';
import { useToast } from '@/components/toast';
import { formatDateTime } from '@/lib/format';
import { SR_CATEGORY_LABELS, SR_STATUS_LABELS } from '@/lib/labels';
import { RequestPriorityBadge, RequestStatusBadge } from '@/components/request-status-badge';
import { canTransition } from '@/lib/service-requests';
import type { SRStatus, SRPriority } from '@/lib/service-requests';

const ALL_STATUSES = Object.keys(SR_STATUS_LABELS) as SRStatus[];

export default function SolicitudStaffDetallePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { t, locale } = useT();
  const toast = useToast();
  const utils = api.useUtils();
  const commentRef = useRef<HTMLTextAreaElement>(null);
  const [isInternal, setIsInternal] = useState(false);
  const [selectedAssignee, setSelectedAssignee] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<SRStatus | ''>('');

  const req = api.requests.get.useQuery({ requestId: id });
  const me = api.me.useQuery();
  const teamUsers = api.users.list.useQuery();

  const addComment = api.requests.addComment.useMutation({
    onSuccess: async () => {
      await utils.requests.get.invalidate({ requestId: id });
      toast.success(t('requests.detail.commentSent'));
      if (commentRef.current) commentRef.current.value = '';
    },
    onError: (err) => toast.error(err.message),
  });

  const updateStatus = api.requests.updateStatus.useMutation({
    onSuccess: async () => {
      await utils.requests.get.invalidate({ requestId: id });
      await utils.requests.listAll.invalidate();
      toast.success(t('requests.staff.detail.statusUpdated'));
      setSelectedStatus('');
    },
    onError: (err) => toast.error(err.message),
  });

  const assign = api.requests.assign.useMutation({
    onSuccess: async () => {
      await utils.requests.get.invalidate({ requestId: id });
      await utils.requests.listAll.invalidate();
      toast.success(t('requests.staff.detail.assigned'));
      setSelectedAssignee('');
    },
    onError: (err) => toast.error(err.message),
  });

  function handleComment(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const body = commentRef.current?.value?.trim();
    if (!body) return;
    addComment.mutate({ requestId: id, body, internal: isInternal });
  }

  if (req.isLoading) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-48 w-full rounded-2xl" />
      </div>
    );
  }

  if (!req.data) {
    return <p className="text-[#1A3A3F]/60">{t('r360.notFound')}</p>;
  }

  const data = req.data;
  const currentStatus = data.status as SRStatus;

  // Calcular transiciones válidas desde el estado actual
  const validTransitions = ALL_STATUSES.filter((s) => canTransition(currentStatus, s));

  return (
    <div className="flex flex-col gap-6">
      {/* Navegación atrás */}
      <Link
        href="/solicitudes"
        className="text-sm text-brand-700 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
      >
        {t('requests.staff.detail.back')}
      </Link>

      {/* Cabecera */}
      <Card>
        <CardContent>
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <h1 className="text-xl font-extrabold tracking-tight text-[#1A3A3F] leading-snug">
                {data.title}
              </h1>
              <div className="flex flex-wrap gap-2">
                <RequestStatusBadge status={currentStatus} />
                <RequestPriorityBadge priority={data.priority as SRPriority} />
                {data.overdue && (
                  <Badge tone="red">⚠ {t('requests.staff.overdueBadge')}</Badge>
                )}
              </div>
            </div>

            {/* Metadatos */}
            <dl className="grid gap-2 text-sm sm:grid-cols-2 md:grid-cols-3">
              <div>
                <dt className="text-[#1A3A3F]/40 text-xs uppercase tracking-widest">
                  {t('requests.staff.resident')}
                </dt>
                <dd className="text-[#1A3A3F]">
                  <Link
                    href={`/residentes/${data.residentId}/resumen`}
                    className="text-brand-700 hover:underline"
                  >
                    {data.resident.firstName} {data.resident.lastName}
                  </Link>
                </dd>
              </div>
              <div>
                <dt className="text-[#1A3A3F]/40 text-xs uppercase tracking-widest">
                  {t('requests.detail.category')}
                </dt>
                <dd className="text-[#1A3A3F]">
                  {SR_CATEGORY_LABELS[data.category] ?? data.category}
                </dd>
              </div>
              <div>
                <dt className="text-[#1A3A3F]/40 text-xs uppercase tracking-widest">
                  {t('requests.staff.createdBy')}
                </dt>
                <dd className="text-[#1A3A3F]">
                  {data.createdBy.name ?? data.createdBy.email}
                </dd>
              </div>
              <div>
                <dt className="text-[#1A3A3F]/40 text-xs uppercase tracking-widest">
                  {t('requests.detail.createdAt')}
                </dt>
                <dd className="text-[#1A3A3F]">
                  <time dateTime={data.createdAt.toString()}>
                    {formatDateTime(locale, data.createdAt)}
                  </time>
                </dd>
              </div>
              {data.slaDueAt && (
                <div>
                  <dt className="text-[#1A3A3F]/40 text-xs uppercase tracking-widest">
                    {t('requests.detail.slaLabel')}
                  </dt>
                  <dd className={data.overdue ? 'font-semibold text-red-600' : 'text-[#1A3A3F]'}>
                    <time dateTime={data.slaDueAt.toString()}>
                      {formatDateTime(locale, data.slaDueAt)}
                    </time>
                  </dd>
                </div>
              )}
              <div>
                <dt className="text-[#1A3A3F]/40 text-xs uppercase tracking-widest">
                  {t('requests.staff.assignedTo')}
                </dt>
                <dd className="text-[#1A3A3F]">
                  {data.assignedTo?.name ?? t('requests.staff.unassigned')}
                </dd>
              </div>
            </dl>

            {/* Descripción */}
            <p className="rounded-xl bg-brand-50 px-3 py-2 text-sm text-[#1A3A3F]">
              {data.description}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Gestión: cambiar estado + asignar */}
      <div className="grid gap-4 sm:grid-cols-2">
        {/* Cambiar estado */}
        <SectionCard title={t('requests.staff.detail.changeStatus')}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!selectedStatus) return;
              updateStatus.mutate({ requestId: id, status: selectedStatus });
            }}
            className="flex flex-col gap-3"
          >
            <div>
              <Label htmlFor="status-select">{t('requests.staff.detail.changeStatus')}</Label>
              <Select
                id="status-select"
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value as SRStatus)}
              >
                <option value="">{t('requests.staff.filterAll')}</option>
                {ALL_STATUSES.map((s) => {
                  const isValid = canTransition(currentStatus, s);
                  return (
                    <option key={s} value={s} disabled={!isValid}>
                      {SR_STATUS_LABELS[s]}
                      {!isValid ? ' (no disponible)' : ''}
                    </option>
                  );
                })}
              </Select>
            </div>
            <Button
              type="submit"
              size="sm"
              disabled={!selectedStatus || updateStatus.isPending || !validTransitions.includes(selectedStatus as SRStatus)}
            >
              {updateStatus.isPending ? t('state.loading') : t('action.save')}
            </Button>
          </form>
        </SectionCard>

        {/* Asignar */}
        <SectionCard title={t('requests.staff.detail.assign')}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!selectedAssignee) return;
              assign.mutate({ requestId: id, assignedToId: selectedAssignee });
            }}
            className="flex flex-col gap-3"
          >
            <div>
              <Label htmlFor="assignee-select">{t('requests.staff.detail.assign')}</Label>
              <Select
                id="assignee-select"
                value={selectedAssignee}
                onChange={(e) => setSelectedAssignee(e.target.value)}
                disabled={teamUsers.isLoading}
              >
                <option value="">{t('requests.staff.filterAll')}</option>
                {(teamUsers.data ?? []).map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name ?? u.email}
                  </option>
                ))}
              </Select>
            </div>
            <Button
              type="submit"
              size="sm"
              disabled={!selectedAssignee || assign.isPending}
            >
              {assign.isPending
                ? t('state.loading')
                : t('requests.staff.detail.assignSubmit')}
            </Button>
          </form>
        </SectionCard>
      </div>

      {/* Hilo de conversación */}
      <section aria-labelledby="staff-comments-heading">
        <h2
          id="staff-comments-heading"
          className="mb-3 text-sm font-semibold uppercase tracking-widest text-[#1A3A3F]/60"
        >
          {t('requests.detail.comments')}
        </h2>

        {data.comments.length === 0 ? (
          <p className="text-sm text-[#1A3A3F]/60">{t('requests.detail.noComments')}</p>
        ) : (
          <ol className="flex flex-col gap-3" aria-label={t('requests.detail.comments')}>
            {data.comments.map((c) => {
              const isMe = me.data?.id === c.authorId;
              return (
                <li key={c.id} className="flex flex-col gap-1">
                  <div
                    className={`rounded-2xl px-4 py-3 text-sm ${
                      c.internal
                        ? 'border border-amber-200 bg-amber-50 text-[#1A3A3F]'
                        : isMe
                        ? 'ml-auto max-w-[85%] bg-brand-700 text-white'
                        : 'max-w-[85%] bg-brand-50 text-[#1A3A3F]'
                    }`}
                  >
                    <div className="mb-1 flex items-center gap-2">
                      <span className="text-xs font-semibold opacity-70">
                        {isMe
                          ? t('requests.staff.detail.you')
                          : (c.author.name ?? c.author.id)}
                      </span>
                      {c.internal && (
                        <Badge tone="amber" className="text-xs">
                          {t('requests.staff.detail.internalBadge')}
                        </Badge>
                      )}
                    </div>
                    <p className="whitespace-pre-wrap">{c.body}</p>
                    <time
                      dateTime={c.createdAt.toString()}
                      className="mt-1 block text-xs opacity-50"
                    >
                      {formatDateTime(locale, c.createdAt)}
                    </time>
                  </div>
                </li>
              );
            })}
          </ol>
        )}

        {/* Añadir comentario (staff: puede marcar como interno) */}
        <form
          onSubmit={handleComment}
          className="mt-4 flex flex-col gap-2"
          aria-label={t('requests.detail.addComment')}
        >
          <label htmlFor="staff-comment" className="sr-only">
            {t('requests.detail.addComment')}
          </label>
          <textarea
            id="staff-comment"
            ref={commentRef}
            rows={3}
            placeholder={t('requests.detail.commentPh')}
            required
            className="w-full rounded-2xl border border-brand-200 px-3 py-2 text-base focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30 resize-y"
          />

          {/* Checkbox interno */}
          <label className="flex items-center gap-2 text-sm text-[#1A3A3F]/70 cursor-pointer">
            <input
              type="checkbox"
              checked={isInternal}
              onChange={(e) => setIsInternal(e.target.checked)}
              className="h-4 w-4 rounded accent-brand-700"
            />
            {t('requests.staff.detail.internalComment')}
          </label>

          <div className="flex justify-end">
            <Button type="submit" disabled={addComment.isPending}>
              {addComment.isPending
                ? t('requests.detail.commentSending')
                : t('requests.detail.commentSubmit')}
            </Button>
          </div>
        </form>
      </section>
    </div>
  );
}
