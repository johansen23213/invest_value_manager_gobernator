'use client';

import { useRouter } from 'next/navigation';
import { useRef } from 'react';
import Link from 'next/link';
import { Button, Card, CardContent, FieldError, Input, Label, Select } from '@vetlla/ui';
import { api } from '@/trpc/react';
import { useT } from '@/i18n/provider';
import { useToast } from '@/components/toast';
import { useZodForm } from '@/lib/form';
import { CreateRequestInput } from '@/server/routers/requests';
import { SR_CATEGORY_LABELS, SR_PRIORITY_LABELS } from '@/lib/labels';
import type { SRCategory, SRPriority } from '@/lib/service-requests';

const CATEGORIES = Object.keys(SR_CATEGORY_LABELS) as SRCategory[];
const PRIORITIES = Object.keys(SR_PRIORITY_LABELS) as SRPriority[];

export default function NuevaSolicitudPage() {
  const { t } = useT();
  const router = useRouter();
  const toast = useToast();
  const form = useZodForm(CreateRequestInput);
  const utils = api.useUtils();

  // Residentes vinculados — necesitamos su lista para el select
  const portal = api.family.portal.useQuery();
  const residents = portal.data ?? [];

  // IDs de formulario para accesibilidad aria-describedby
  const fieldIds = {
    residentId:  'ns-resident',
    category:    'ns-category',
    priority:    'ns-priority',
    title:       'ns-title',
    description: 'ns-description',
  };

  const create = api.requests.create.useMutation({
    onSuccess: async () => {
      await utils.requests.listMine.invalidate();
      toast.success(t('requests.form.success'));
      router.push('/portal/solicitudes');
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  const formRef = useRef<HTMLFormElement>(null);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const raw = {
      residentId:  fd.get('residentId') as string,
      category:    fd.get('category') as string,
      priority:    fd.get('priority') as string,
      title:       fd.get('title') as string,
      description: fd.get('description') as string,
    };
    const data = form.validate(raw);
    if (!data) return;
    create.mutate(data);
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Cabecera */}
      <div>
        <Link
          href="/portal/solicitudes"
          className="text-sm text-brand-700 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
        >
          {t('requests.detail.back')}
        </Link>
        <h1 className="mt-2 text-2xl font-extrabold tracking-tight text-[#1A3A3F]">
          {t('requests.form.title')}
        </h1>
      </div>

      <Card>
        <CardContent>
          <form ref={formRef} onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">

            {/* Residente */}
            {residents.length > 1 && (
              <div>
                <Label htmlFor={fieldIds.residentId}>{t('requests.form.resident')}</Label>
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
                <FieldError id={`${fieldIds.residentId}-err`}>{form.errors.residentId}</FieldError>
              </div>
            )}
            {/* Si hay exactamente 1 residente, lo enviamos oculto */}
            {residents.length === 1 && (
              <input type="hidden" name="residentId" value={residents[0]!.id} />
            )}

            {/* Categoría */}
            <div>
              <Label htmlFor={fieldIds.category}>{t('requests.form.category')}</Label>
              <Select
                id={fieldIds.category}
                name="category"
                required
                aria-describedby={form.errors.category ? `${fieldIds.category}-err` : undefined}
                aria-invalid={Boolean(form.errors.category)}
                defaultValue="ADMINISTRACION"
              >
                {CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {SR_CATEGORY_LABELS[cat]}
                  </option>
                ))}
              </Select>
              <FieldError id={`${fieldIds.category}-err`}>{form.errors.category}</FieldError>
            </div>

            {/* Prioridad */}
            <div>
              <Label htmlFor={fieldIds.priority}>{t('requests.form.priority')}</Label>
              <Select
                id={fieldIds.priority}
                name="priority"
                aria-describedby={form.errors.priority ? `${fieldIds.priority}-err` : undefined}
                aria-invalid={Boolean(form.errors.priority)}
                defaultValue="NORMAL"
              >
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {SR_PRIORITY_LABELS[p]}
                  </option>
                ))}
              </Select>
              <FieldError id={`${fieldIds.priority}-err`}>{form.errors.priority}</FieldError>
            </div>

            {/* Asunto */}
            <div>
              <Label htmlFor={fieldIds.title}>{t('requests.form.requestTitle')}</Label>
              <Input
                id={fieldIds.title}
                name="title"
                placeholder={t('requests.form.requestTitlePh')}
                required
                aria-describedby={form.errors.title ? `${fieldIds.title}-err` : undefined}
                aria-invalid={Boolean(form.errors.title)}
              />
              <FieldError id={`${fieldIds.title}-err`}>{form.errors.title}</FieldError>
            </div>

            {/* Descripción */}
            <div>
              <Label htmlFor={fieldIds.description}>{t('requests.form.description')}</Label>
              <textarea
                id={fieldIds.description}
                name="description"
                rows={5}
                placeholder={t('requests.form.descriptionPh')}
                required
                aria-describedby={form.errors.description ? `${fieldIds.description}-err` : undefined}
                aria-invalid={Boolean(form.errors.description)}
                className="min-h-touch w-full rounded-2xl border border-brand-200 px-3 py-2 text-base focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30 disabled:bg-brand-50 resize-y"
              />
              <FieldError id={`${fieldIds.description}-err`}>{form.errors.description}</FieldError>
            </div>

            {/* Acciones */}
            <div className="flex flex-wrap items-center justify-end gap-3">
              <Link
                href="/portal/solicitudes"
                className="inline-flex min-h-touch items-center justify-center rounded-full border border-brand-200 bg-white px-5 py-2 text-base font-semibold text-brand-700 transition hover:bg-brand-50 active:bg-brand-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-1"
              >
                {t('action.cancel')}
              </Link>
              <Button type="submit" disabled={create.isPending || portal.isLoading}>
                {create.isPending ? t('requests.form.submitting') : t('requests.form.submit')}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
