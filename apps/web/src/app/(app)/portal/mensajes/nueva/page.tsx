'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button, Card, CardContent, FieldError, Input, Label, Select } from '@vetlla/ui';
import { api } from '@/trpc/react';
import { useT } from '@/i18n/provider';
import { useToast } from '@/components/toast';
import { useZodForm } from '@/lib/form';
import { CreateThreadInput } from '@/server/routers/comms';
import { MESSAGE_THREAD_CATEGORY_LABELS } from '@/lib/labels';

const CATEGORIES = Object.keys(MESSAGE_THREAD_CATEGORY_LABELS);

export default function NuevaConversacionPage() {
  const { t } = useT();
  const router = useRouter();
  const toast = useToast();
  const form = useZodForm(CreateThreadInput);
  const utils = api.useUtils();

  // Residentes vinculados
  const portal = api.family.portal.useQuery();
  const residents = portal.data ?? [];

  const fieldIds = {
    residentId: 'nc-resident',
    category:   'nc-category',
    subject:    'nc-subject',
    body:       'nc-body',
  };

  const createThread = api.comms.createThread.useMutation({
    onSuccess: async (thread) => {
      await utils.comms.listThreads.invalidate();
      toast.success(t('comms.portal.messages.form.success'));
      router.push(`/portal/mensajes/${thread.id}`);
    },
    onError: (err) => toast.error(err.message),
  });

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const raw = {
      residentId: fd.get('residentId') as string,
      category:   fd.get('category') as string,
      subject:    fd.get('subject') as string,
      body:       fd.get('body') as string,
    };
    const data = form.validate(raw);
    if (!data) return;
    createThread.mutate(data);
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Cabecera */}
      <div>
        <Link
          href="/portal/mensajes"
          className="text-sm text-brand-700 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
        >
          {t('comms.portal.messages.form.back')}
        </Link>
        <h1 className="mt-2 text-2xl font-extrabold tracking-tight text-[#1A3A3F]">
          {t('comms.portal.messages.form.title')}
        </h1>
      </div>

      <Card>
        <CardContent>
          <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">

            {/* Residente */}
            {residents.length > 1 && (
              <div>
                <Label htmlFor={fieldIds.residentId}>
                  {t('comms.portal.messages.form.resident')}
                </Label>
                <Select
                  id={fieldIds.residentId}
                  name="residentId"
                  required
                  aria-describedby={form.errors.residentId ? `${fieldIds.residentId}-err` : undefined}
                  aria-invalid={Boolean(form.errors.residentId)}
                  defaultValue={residents[0]?.id ?? ''}
                >
                  {residents.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.firstName} {r.lastName}
                    </option>
                  ))}
                </Select>
                <FieldError id={`${fieldIds.residentId}-err`}>
                  {form.errors.residentId}
                </FieldError>
              </div>
            )}
            {residents.length === 1 && (
              <input type="hidden" name="residentId" value={residents[0]!.id} />
            )}

            {/* Categoría */}
            <div>
              <Label htmlFor={fieldIds.category}>
                {t('comms.portal.messages.form.category')}
              </Label>
              <Select
                id={fieldIds.category}
                name="category"
                required
                aria-describedby={form.errors.category ? `${fieldIds.category}-err` : undefined}
                aria-invalid={Boolean(form.errors.category)}
                defaultValue="GENERAL"
              >
                {CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {MESSAGE_THREAD_CATEGORY_LABELS[cat]}
                  </option>
                ))}
              </Select>
              <FieldError id={`${fieldIds.category}-err`}>
                {form.errors.category}
              </FieldError>
            </div>

            {/* Asunto */}
            <div>
              <Label htmlFor={fieldIds.subject}>
                {t('comms.portal.messages.form.subject')}
              </Label>
              <Input
                id={fieldIds.subject}
                name="subject"
                placeholder={t('comms.portal.messages.form.subjectPh')}
                required
                aria-describedby={form.errors.subject ? `${fieldIds.subject}-err` : undefined}
                aria-invalid={Boolean(form.errors.subject)}
              />
              <FieldError id={`${fieldIds.subject}-err`}>
                {form.errors.subject}
              </FieldError>
            </div>

            {/* Primer mensaje */}
            <div>
              <Label htmlFor={fieldIds.body}>
                {t('comms.portal.messages.form.body')}
              </Label>
              <textarea
                id={fieldIds.body}
                name="body"
                rows={5}
                placeholder={t('comms.portal.messages.form.bodyPh')}
                required
                aria-describedby={form.errors.body ? `${fieldIds.body}-err` : undefined}
                aria-invalid={Boolean(form.errors.body)}
                className="min-h-[44px] w-full rounded-2xl border border-brand-200 px-3 py-2 text-base focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30 disabled:bg-brand-50 resize-y"
              />
              <FieldError id={`${fieldIds.body}-err`}>{form.errors.body}</FieldError>
            </div>

            {/* Acciones */}
            <div className="flex flex-wrap items-center justify-end gap-3">
              <Link
                href="/portal/mensajes"
                className="inline-flex min-h-[44px] items-center justify-center rounded-full border border-brand-200 bg-white px-5 py-2 text-base font-semibold text-brand-700 transition hover:bg-brand-50 active:bg-brand-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-1"
              >
                {t('action.cancel')}
              </Link>
              <Button
                type="submit"
                disabled={createThread.isPending || portal.isLoading}
              >
                {createThread.isPending
                  ? t('comms.portal.messages.form.submitting')
                  : t('comms.portal.messages.form.submit')}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
