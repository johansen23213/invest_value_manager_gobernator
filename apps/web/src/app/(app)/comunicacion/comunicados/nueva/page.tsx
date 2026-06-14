'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import Link from 'next/link';
import { Button, Card, CardContent, FieldError, Input, Label, Select } from '@vetlla/ui';
import { api } from '@/trpc/react';
import { useT } from '@/i18n/provider';
import { useToast } from '@/components/toast';
import { useZodForm } from '@/lib/form';
import { PublishAnnouncementInput, type AnnouncementAudience } from '@/lib/schemas/comms';
import {
  ANNOUNCEMENT_CATEGORY_LABELS,
  ANNOUNCEMENT_AUDIENCE_LABELS,
} from '@/lib/labels';

const CATEGORIES = Object.keys(ANNOUNCEMENT_CATEGORY_LABELS);
const AUDIENCES = Object.keys(ANNOUNCEMENT_AUDIENCE_LABELS) as AnnouncementAudience[];

export default function NuevoComunicadoPage() {
  const { t } = useT();
  const router = useRouter();
  const toast = useToast();
  const form = useZodForm(PublishAnnouncementInput);
  const utils = api.useUtils();

  const [audience, setAudience] = useState<AnnouncementAudience>('TODO_EL_CENTRO');
  const [selectedCenterId, setSelectedCenterId] = useState('');

  // Centros con sus unidades (para selector de unidad)
  const centers = api.centers.list.useQuery();
  const centerDetail = api.centers.get.useQuery(
    { id: selectedCenterId },
    { enabled: Boolean(selectedCenterId) && audience === 'POR_UNIDAD' },
  );
  const units = centerDetail.data?.units ?? [];

  // Residentes (para selector de residente)
  const residents = api.residents.list.useQuery(
    undefined,
    { enabled: audience === 'RESIDENTE' },
  );

  const fieldIds = {
    title:        'nc-title',
    body:         'nc-body',
    category:     'nc-category',
    audience:     'nc-audience',
    unitId:       'nc-unit',
    centerId:     'nc-center',
    residentId:   'nc-resident',
    requiresAck:  'nc-ack',
    publishedAt:  'nc-publishedAt',
  };

  const publishAnnouncement = api.comms.publishAnnouncement.useMutation({
    onSuccess: async () => {
      await utils.comms.listAnnouncementsForMe.invalidate();
      toast.success(t('comms.staff.announcements.form.success'));
      router.push('/comunicacion/comunicados');
    },
    onError: (err) => toast.error(err.message),
  });

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);

    const rawAudience = fd.get('audience') as string;
    const rawPublishedAt = fd.get('publishedAt') as string;

    const raw = {
      title:        fd.get('title') as string,
      body:         fd.get('body') as string,
      category:     fd.get('category') as string,
      audience:     rawAudience,
      unitId:       rawAudience === 'POR_UNIDAD' ? (fd.get('unitId') as string) : undefined,
      residentId:   rawAudience === 'RESIDENTE'  ? (fd.get('residentId') as string) : undefined,
      requiresAck:  fd.get('requiresAck') === 'on',
      publishedAt:  rawPublishedAt ? new Date(rawPublishedAt) : undefined,
    };

    const data = form.validate(raw);
    if (!data) return;
    publishAnnouncement.mutate(data);
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Cabecera */}
      <div>
        <Link
          href="/comunicacion/comunicados"
          className="text-sm text-brand-700 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
        >
          {t('comms.staff.announcements.form.back')}
        </Link>
        <h1 className="mt-2 text-2xl font-extrabold tracking-tight text-[#1A3A3F]">
          {t('comms.staff.announcements.form.title')}
        </h1>
      </div>

      <Card>
        <CardContent>
          <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">

            {/* Título */}
            <div>
              <Label htmlFor={fieldIds.title}>
                {t('comms.staff.announcements.form.fieldTitle')}
              </Label>
              <Input
                id={fieldIds.title}
                name="title"
                placeholder={t('comms.staff.announcements.form.fieldTitlePh')}
                required
                aria-describedby={form.errors.title ? `${fieldIds.title}-err` : undefined}
                aria-invalid={Boolean(form.errors.title)}
              />
              <FieldError id={`${fieldIds.title}-err`}>{form.errors.title}</FieldError>
            </div>

            {/* Cuerpo */}
            <div>
              <Label htmlFor={fieldIds.body}>
                {t('comms.staff.announcements.form.fieldBody')}
              </Label>
              <textarea
                id={fieldIds.body}
                name="body"
                rows={6}
                placeholder={t('comms.staff.announcements.form.fieldBodyPh')}
                required
                aria-describedby={form.errors.body ? `${fieldIds.body}-err` : undefined}
                aria-invalid={Boolean(form.errors.body)}
                className="min-h-[44px] w-full rounded-2xl border border-brand-200 px-3 py-2 text-base focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30 disabled:bg-brand-50 resize-y"
              />
              <FieldError id={`${fieldIds.body}-err`}>{form.errors.body}</FieldError>
            </div>

            {/* Categoría */}
            <div>
              <Label htmlFor={fieldIds.category}>
                {t('comms.staff.announcements.form.fieldCategory')}
              </Label>
              <Select
                id={fieldIds.category}
                name="category"
                defaultValue="GENERAL"
                aria-describedby={form.errors.category ? `${fieldIds.category}-err` : undefined}
                aria-invalid={Boolean(form.errors.category)}
              >
                {CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {ANNOUNCEMENT_CATEGORY_LABELS[cat]}
                  </option>
                ))}
              </Select>
              <FieldError id={`${fieldIds.category}-err`}>{form.errors.category}</FieldError>
            </div>

            {/* Audiencia */}
            <div>
              <Label htmlFor={fieldIds.audience}>
                {t('comms.staff.announcements.form.fieldAudience')}
              </Label>
              <Select
                id={fieldIds.audience}
                name="audience"
                value={audience}
                onChange={(e) => setAudience(e.target.value as AnnouncementAudience)}
                aria-describedby={form.errors.audience ? `${fieldIds.audience}-err` : undefined}
                aria-invalid={Boolean(form.errors.audience)}
              >
                {AUDIENCES.map((aud) => (
                  <option key={aud} value={aud}>
                    {ANNOUNCEMENT_AUDIENCE_LABELS[aud]}
                  </option>
                ))}
              </Select>
              <FieldError id={`${fieldIds.audience}-err`}>{form.errors.audience}</FieldError>
            </div>

            {/* Selector de unidad (si POR_UNIDAD) */}
            {audience === 'POR_UNIDAD' && (
              <>
                {/* Primero elegir el centro */}
                <div>
                  <Label htmlFor={fieldIds.centerId}>
                    {t('comms.staff.announcements.form.fieldUnit')} — Centro
                  </Label>
                  <Select
                    id={fieldIds.centerId}
                    name="_centerId"
                    value={selectedCenterId}
                    onChange={(e) => setSelectedCenterId(e.target.value)}
                  >
                    <option value="">— Selecciona un centro —</option>
                    {(centers.data ?? []).map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </Select>
                </div>
                {selectedCenterId && (
                  <div>
                    <Label htmlFor={fieldIds.unitId}>
                      {t('comms.staff.announcements.form.fieldUnit')}
                    </Label>
                    <Select
                      id={fieldIds.unitId}
                      name="unitId"
                      required
                      aria-describedby={form.errors.unitId ? `${fieldIds.unitId}-err` : undefined}
                      aria-invalid={Boolean(form.errors.unitId)}
                      defaultValue=""
                    >
                      <option value="">— Selecciona una unidad —</option>
                      {units.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.name}
                        </option>
                      ))}
                    </Select>
                    <FieldError id={`${fieldIds.unitId}-err`}>{form.errors.unitId}</FieldError>
                  </div>
                )}
              </>
            )}

            {/* Selector de residente (si RESIDENTE) */}
            {audience === 'RESIDENTE' && (
              <div>
                <Label htmlFor={fieldIds.residentId}>
                  {t('comms.staff.announcements.form.fieldResident')}
                </Label>
                <Select
                  id={fieldIds.residentId}
                  name="residentId"
                  required
                  aria-describedby={form.errors.residentId ? `${fieldIds.residentId}-err` : undefined}
                  aria-invalid={Boolean(form.errors.residentId)}
                  defaultValue=""
                >
                  <option value="">— Selecciona un residente —</option>
                  {(residents.data ?? []).map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.lastName}, {r.firstName}
                    </option>
                  ))}
                </Select>
                <FieldError id={`${fieldIds.residentId}-err`}>{form.errors.residentId}</FieldError>
              </div>
            )}

            {/* Requiere acuse */}
            <div className="flex items-center gap-3">
              <input
                id={fieldIds.requiresAck}
                name="requiresAck"
                type="checkbox"
                className="h-5 w-5 rounded border-brand-300 text-brand-700 focus:ring-brand-500"
              />
              <label htmlFor={fieldIds.requiresAck} className="text-sm font-medium text-[#1A3A3F]">
                {t('comms.staff.announcements.form.fieldRequiresAck')}
              </label>
            </div>

            {/* Fecha de publicación (opcional) */}
            <div>
              <Label htmlFor={fieldIds.publishedAt}>
                {t('comms.staff.announcements.form.fieldPublishedAt')}
              </Label>
              <Input
                id={fieldIds.publishedAt}
                name="publishedAt"
                type="datetime-local"
                aria-describedby={form.errors.publishedAt ? `${fieldIds.publishedAt}-err` : undefined}
                aria-invalid={Boolean(form.errors.publishedAt)}
              />
              <FieldError id={`${fieldIds.publishedAt}-err`}>{form.errors.publishedAt}</FieldError>
            </div>

            {/* Acciones */}
            <div className="flex flex-wrap items-center justify-end gap-3">
              <Link
                href="/comunicacion/comunicados"
                className="inline-flex min-h-[44px] items-center justify-center rounded-full border border-brand-200 bg-white px-5 py-2 text-base font-semibold text-brand-700 transition hover:bg-brand-50 active:bg-brand-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-1"
              >
                {t('action.cancel')}
              </Link>
              <Button type="submit" disabled={publishAnnouncement.isPending}>
                {publishAnnouncement.isPending
                  ? t('comms.staff.announcements.form.submitting')
                  : t('comms.staff.announcements.form.submit')}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
