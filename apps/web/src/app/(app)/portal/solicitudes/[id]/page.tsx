'use client';

import { use, useRef, useState } from 'react';
import Link from 'next/link';
import { Badge, Button, Card, CardContent, Skeleton } from '@vetlla/ui';
import { api } from '@/trpc/react';
import { useT } from '@/i18n/provider';
import { useToast } from '@/components/toast';
import { useConfirm } from '@/components/confirm';
import { formatDateTime } from '@/lib/format';
import { SR_CATEGORY_LABELS } from '@/lib/labels';
import { RequestPriorityBadge, RequestStatusBadge } from '@/components/request-status-badge';
import type { SRStatus, SRPriority } from '@/lib/service-requests';

// Componente de valoración CSAT 1-5 estrellas
function StarRating({
  value,
  onChange,
  disabled,
}: {
  value: number;
  onChange: (n: number) => void;
  disabled?: boolean;
}) {
  const { t } = useT();
  const [hovered, setHovered] = useState(0);
  return (
    <div className="flex gap-1" role="group" aria-label={t('requests.detail.rate')}>
      {[1, 2, 3, 4, 5].map((n) => {
        const filled = n <= (hovered || value);
        const label =
          n === 1 ? t('requests.detail.rateStar', { n }) : t('requests.detail.rateStars', { n });
        return (
          <button
            key={n}
            type="button"
            aria-label={label}
            aria-pressed={value === n}
            disabled={disabled}
            className="min-h-touch min-w-touch text-2xl transition disabled:cursor-not-allowed disabled:opacity-60"
            style={{ color: filled ? '#E76F51' : '#d1d5db' }}
            onClick={() => onChange(n)}
            onMouseEnter={() => setHovered(n)}
            onMouseLeave={() => setHovered(0)}
          >
            ★
          </button>
        );
      })}
    </div>
  );
}

export default function PortalSolicitudDetallePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { t, locale } = useT();
  const toast = useToast();
  const confirm = useConfirm();
  const utils = api.useUtils();
  const commentRef = useRef<HTMLTextAreaElement>(null);
  const [rating, setRating] = useState(0);
  const [ratingDone, setRatingDone] = useState(false);

  const req = api.requests.get.useQuery({ requestId: id });
  const me = api.me.useQuery();

  const addComment = api.requests.addComment.useMutation({
    onSuccess: async () => {
      await utils.requests.get.invalidate({ requestId: id });
      toast.success(t('requests.detail.commentSent'));
      if (commentRef.current) commentRef.current.value = '';
    },
    onError: (err) => toast.error(err.message),
  });

  const rate = api.requests.rate.useMutation({
    onSuccess: async () => {
      await utils.requests.get.invalidate({ requestId: id });
      await utils.requests.listMine.invalidate();
      setRatingDone(true);
      toast.success(t('requests.detail.rateSent'));
    },
    onError: (err) => toast.error(err.message),
  });

  const reopen = api.requests.reopen.useMutation({
    onSuccess: async () => {
      await utils.requests.get.invalidate({ requestId: id });
      await utils.requests.listMine.invalidate();
      toast.success(t('requests.detail.reopened'));
    },
    onError: (err) => toast.error(err.message),
  });

  function handleComment(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const body = commentRef.current?.value?.trim();
    if (!body) return;
    addComment.mutate({ requestId: id, body, internal: false });
  }

  async function handleReopen() {
    const result = await confirm({
      title: t('requests.detail.reopenConfirmTitle'),
      description: t('requests.detail.reopenConfirmDesc'),
      confirmLabel: t('requests.detail.reopen'),
      tone: 'default',
    });
    if (!result) return;
    reopen.mutate({ requestId: id });
  }

  if (req.isLoading) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 w-full rounded-2xl" />
      </div>
    );
  }

  if (!req.data) {
    return <p className="text-[#1A3A3F]/60">{t('r360.notFound')}</p>;
  }

  const data = req.data;
  const isTerminal = data.status === 'RESUELTA' || data.status === 'CERRADA';
  const isCreator = me.data?.id === data.createdById;
  const canRate = isTerminal && isCreator;
  const canReopen = isTerminal && isCreator;

  return (
    <div className="flex flex-col gap-6">
      {/* Navegación atrás */}
      <Link
        href="/portal/solicitudes"
        className="text-sm text-brand-700 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
      >
        {t('requests.detail.back')}
      </Link>

      {/* Cabecera de la solicitud */}
      <Card>
        <CardContent>
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <h1 className="text-xl font-extrabold tracking-tight text-[#1A3A3F] leading-snug">
                {data.title}
              </h1>
              <div className="flex flex-wrap gap-2">
                <RequestStatusBadge status={data.status as SRStatus} />
                <RequestPriorityBadge priority={data.priority as SRPriority} />
                {data.overdue && (
                  <Badge tone="red">⚠ {t('requests.staff.overdueBadge')}</Badge>
                )}
              </div>
            </div>

            {/* Metadatos */}
            <dl className="grid gap-2 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-[#1A3A3F]/40 text-xs uppercase tracking-widest">
                  {t('requests.detail.resident')}
                </dt>
                <dd className="text-[#1A3A3F]">
                  {data.resident.firstName} {data.resident.lastName}
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
                  <dd className="text-[#1A3A3F]">
                    <time dateTime={data.slaDueAt.toString()}>
                      {formatDateTime(locale, data.slaDueAt)}
                    </time>
                  </dd>
                </div>
              )}
            </dl>

            {/* Descripción */}
            <p className="rounded-xl bg-brand-50 px-3 py-2 text-sm text-[#1A3A3F]">
              {data.description}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Hilo de conversación */}
      <section aria-labelledby="comments-heading">
        <h2
          id="comments-heading"
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
                <li key={c.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm ${
                      isMe
                        ? 'bg-brand-700 text-white'
                        : 'bg-brand-50 text-[#1A3A3F]'
                    }`}
                  >
                    <p className="mb-1 text-xs font-semibold opacity-70">
                      {isMe ? t('requests.detail.you') : t('requests.detail.staff')}
                    </p>
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

        {/* Añadir comentario */}
        <form
          onSubmit={handleComment}
          className="mt-4 flex flex-col gap-2"
          aria-label={t('requests.detail.addComment')}
        >
          <label htmlFor="portal-comment" className="sr-only">
            {t('requests.detail.addComment')}
          </label>
          <textarea
            id="portal-comment"
            ref={commentRef}
            rows={3}
            placeholder={t('requests.detail.commentPh')}
            required
            className="w-full rounded-2xl border border-brand-200 px-3 py-2 text-base focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30 resize-y"
          />
          <div className="flex justify-end">
            <Button type="submit" disabled={addComment.isPending}>
              {addComment.isPending
                ? t('requests.detail.commentSending')
                : t('requests.detail.commentSubmit')}
            </Button>
          </div>
        </form>
      </section>

      {/* Valoración CSAT (solo si resuelta/cerrada y es el creador) */}
      {canRate && !ratingDone && (
        <Card>
          <CardContent>
            <h2 className="mb-1 font-semibold text-[#1A3A3F]">
              {t('requests.detail.rate')}
            </h2>
            <p className="mb-3 text-sm text-[#1A3A3F]/60">
              {t('requests.detail.rateHint')}
            </p>
            <StarRating
              value={rating}
              onChange={setRating}
              disabled={rate.isPending}
            />
            {rating > 0 && (
              <div className="mt-3">
                <Button
                  size="sm"
                  onClick={() => rate.mutate({ requestId: id, satisfactionScore: rating })}
                  disabled={rate.isPending}
                >
                  {t('action.save')}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Reabrir solicitud */}
      {canReopen && (
        <div className="flex justify-end">
          <Button variant="secondary" onClick={handleReopen} disabled={reopen.isPending}>
            {t('requests.detail.reopen')}
          </Button>
        </div>
      )}
    </div>
  );
}
