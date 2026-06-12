'use client';

import { use, useRef, useState } from 'react';
import Link from 'next/link';
import { Card, CardContent, Skeleton } from '@vetlla/ui';
import { api } from '@/trpc/react';
import { useT } from '@/i18n/provider';
import { formatDateTime } from '@/lib/format';
import { useToast } from '@/components/toast';
import { MessageThreadCategoryBadge, MessageThreadStatusBadge } from '@/components/comms-badges';

export default function PortalMensajeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: threadId } = use(params);
  const { t, locale } = useT();
  const toast = useToast();
  const utils = api.useUtils();
  const bottomRef = useRef<HTMLDivElement>(null);
  const [body, setBody] = useState('');

  const thread = api.comms.getThread.useQuery({ threadId });

  // getThread ya marca los mensajes como leídos al consultar; invalidar la lista
  const meQuery = api.me.useQuery();
  const myId = meQuery.data?.id;

  const postMessage = api.comms.postMessage.useMutation({
    onSuccess: () => {
      toast.success(t('comms.portal.messages.sent'));
      setBody('');
      void utils.comms.getThread.invalidate({ threadId });
      void utils.comms.listThreads.invalidate();
      // Scroll al fondo
      setTimeout(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    },
    onError: (err) => toast.error(err.message),
  });

  const isClosed = thread.data?.status === 'CERRADO';

  function handleSend(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = body.trim();
    if (!trimmed) return;
    postMessage.mutate({ threadId, body: trimmed });
  }

  if (thread.isLoading) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-8 w-48 rounded-2xl" />
        <Skeleton className="h-64 w-full rounded-2xl" />
      </div>
    );
  }

  if (!thread.data) {
    return (
      <p className="text-[#1A3A3F]/60">{t('comms.portal.messages.empty.title')}</p>
    );
  }

  const { data } = thread;

  return (
    <div className="flex flex-col gap-6">
      {/* Navegación y cabecera */}
      <div>
        <Link
          href="/portal/mensajes"
          className="text-sm text-brand-700 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
        >
          {t('comms.portal.messages.back')}
        </Link>
        <div className="mt-2 flex flex-wrap items-start gap-3">
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <MessageThreadCategoryBadge category={data.category} />
              <MessageThreadStatusBadge status={data.status} />
            </div>
            <h1 className="text-2xl font-extrabold tracking-tight text-[#1A3A3F]">
              {data.subject}
            </h1>
            <p className="text-sm text-[#1A3A3F]/60">
              {t('comms.portal.messages.resident', {
                name: `${data.resident.firstName} ${data.resident.lastName}`,
              })}
            </p>
          </div>
        </div>
      </div>

      {/* Burbuja de conversación */}
      <Card>
        <CardContent className="flex flex-col gap-4">
          {data.messages.length === 0 ? (
            <p className="text-sm text-[#1A3A3F]/60">
              {t('comms.portal.messages.empty.desc')}
            </p>
          ) : (
            <div className="flex flex-col gap-3">
              {data.messages.map((msg) => {
                const isOwn = msg.author.id === myId;
                return (
                  <div
                    key={msg.id}
                    className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[80%] rounded-2xl px-4 py-3 ${
                        isOwn
                          ? 'bg-brand-700 text-white'
                          : 'bg-brand-50 text-[#1A3A3F]'
                      }`}
                    >
                      {/* Etiqueta del remitente — diferencia además del color (WCAG 1.4.1) */}
                      <p
                        className={`mb-1 text-xs font-semibold ${
                          isOwn ? 'text-white/70' : 'text-brand-700'
                        }`}
                        aria-hidden="false"
                      >
                        {isOwn
                          ? t('comms.portal.messages.you')
                          : msg.author.name ?? t('comms.portal.messages.staff')}
                      </p>
                      <p className="whitespace-pre-wrap text-sm leading-relaxed">
                        {msg.body}
                      </p>
                      <time
                        dateTime={msg.createdAt.toString()}
                        className={`mt-1 block text-xs ${isOwn ? 'text-white/60' : 'text-[#1A3A3F]/40'}`}
                      >
                        {formatDateTime(locale, msg.createdAt)}
                      </time>
                    </div>
                  </div>
                );
              })}
              <div ref={bottomRef} aria-hidden="true" />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Aviso si cerrado */}
      {isClosed && (
        <p
          role="status"
          className="rounded-xl bg-brand-50 px-4 py-3 text-sm text-brand-700"
        >
          {t('comms.portal.messages.closedWarning')}
        </p>
      )}

      {/* Caja de escritura */}
      {!isClosed && (
        <form onSubmit={handleSend} noValidate className="flex flex-col gap-3">
          <div>
            <label
              htmlFor="msg-body"
              className="mb-1 block font-medium text-[#1A3A3F]"
            >
              {t('comms.portal.messages.inputLabel')}
            </label>
            <textarea
              id="msg-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={3}
              placeholder={t('comms.portal.messages.inputPh')}
              required
              aria-required="true"
              className="min-h-[44px] w-full rounded-2xl border border-brand-200 px-3 py-2 text-base focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30 disabled:bg-brand-50 resize-y"
            />
          </div>
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={postMessage.isPending || !body.trim()}
              className="inline-flex min-h-[44px] items-center justify-center rounded-full bg-brand-700 px-6 py-2 text-base font-semibold text-white transition hover:bg-brand-800 active:bg-brand-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-1 disabled:opacity-60"
            >
              {postMessage.isPending
                ? t('comms.portal.messages.sending')
                : t('comms.portal.messages.send')}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
