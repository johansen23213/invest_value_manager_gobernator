'use client';

/**
 * Detalle de una solicitud de admisión.
 *
 * Permite:
 *   - Ver todos los datos del candidato (admissions:read).
 *   - Editar los datos (formulario; admissions:manage).
 *   - Transicionar el estado (admissions:manage).
 *   - Cerrar la solicitud (rechazar / retirar con motivo; admissions:manage).
 *   - Navegar al expediente del residente si ya está ingresado.
 *
 * Accesibilidad (WCAG 2.1 AA):
 *   - <dl> semántica para metadatos.
 *   - Formulario con errores Zod (FieldError) vinculados con aria-describedby.
 *   - Diálogos Radix para confirmaciones con focus-trap.
 *   - Botones con aria-label descriptivos.
 *   - Touch targets amplios (min-h-touch).
 */

import { use, useState } from 'react';
import Link from 'next/link';
import { z } from 'zod';
import {
  Badge,
  Button,
  Card,
  CardContent,
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogTitle,
  FieldError,
  Input,
  Label,
  SectionCard,
  Select,
  Skeleton,
} from '@vetlla/ui';
import { api } from '@/trpc/react';
import { useT } from '@/i18n/provider';
import { useToast } from '@/components/toast';
import { useConfirm } from '@/components/confirm';
import { useZodForm } from '@/lib/form';
import { formatDate, formatDateTime } from '@/lib/format';
import { AdmissionStatusBadge } from '../admission-status-badge';
import {
  allowedTransitions,
  isTerminalStatus,
  type AdmissionStatus as DomainStatus,
} from '@/lib/ocupacion-forecast';
import {
  admissionRequestUpdateSchema,
  AdmissionStatus,
  AdmissionOrigin,
  DependencyGrade,
  PlaceRegime,
} from '@/lib/schemas/admisiones';

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

type AdmissionDetail = {
  id: string;
  firstName: string;
  lastName: string;
  birthDate: Date | null;
  contactPhone: string | null;
  contactEmail: string | null;
  contactName: string | null;
  dependencyGrade: DependencyGrade | null;
  placeRegime: PlaceRegime | null;
  origin: AdmissionOrigin | null;
  priority: number;
  status: AdmissionStatus;
  requestedAt: Date;
  expectedAdmissionDate: Date | null;
  notes: string | null;
  residentId: string | null;
  outcomeReason: string | null;
  center: { id: string; name: string };
  unit: { id: string; name: string } | null;
  resident: { id: string; firstName: string; lastName: string; status: string } | null;
};

// ---------------------------------------------------------------------------
// Schema de edición (reutiliza admissionRequestUpdateSchema del backend)
// ---------------------------------------------------------------------------

const editSchema = admissionRequestUpdateSchema.omit({ id: true }).extend({
  contactEmail: z.string().email('Email no válido.').optional().or(z.literal('')),
});

// ---------------------------------------------------------------------------
// Etiqueta de prioridad
// ---------------------------------------------------------------------------

const PRIORITY_LABEL: Record<number, string> = { 1: 'Alta', 2: 'Normal', 3: 'Baja' };
const PRIORITY_TONE: Record<number, 'red' | 'amber' | 'neutral'> = {
  1: 'red',
  2: 'amber',
  3: 'neutral',
};

function PriorityBadge({ priority }: { priority: number }) {
  return (
    <Badge tone={PRIORITY_TONE[priority] ?? 'neutral'}>
      {PRIORITY_LABEL[priority] ?? String(priority)}
    </Badge>
  );
}

// ---------------------------------------------------------------------------
// Formulario de edición inline
// ---------------------------------------------------------------------------

function EditForm({
  req,
  onSaved,
  t,
}: {
  req: AdmissionDetail;
  onSaved: () => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
}) {
  const toast = useToast();
  const utils = api.useUtils();
  const form = useZodForm(editSchema);

  const [fields, setFields] = useState({
    firstName:             req.firstName,
    lastName:              req.lastName,
    birthDate:             req.birthDate ? new Date(req.birthDate).toISOString().slice(0, 10) : '',
    contactPhone:          req.contactPhone ?? '',
    contactEmail:          req.contactEmail ?? '',
    contactName:           req.contactName ?? '',
    dependencyGrade:       req.dependencyGrade ?? '',
    placeRegime:           req.placeRegime ?? '',
    origin:                req.origin ?? '',
    priority:              String(req.priority),
    expectedAdmissionDate: req.expectedAdmissionDate
      ? new Date(req.expectedAdmissionDate).toISOString().slice(0, 10)
      : '',
    notes: req.notes ?? '',
  });

  const update = api.admisiones.requests.update.useMutation({
    onSuccess: async () => {
      await utils.admisiones.requests.get.invalidate({ id: req.id });
      await utils.admisiones.requests.list.invalidate();
      onSaved();
      toast.success(t('action.save') + '.');
    },
    onError: (e) => toast.error(e.message),
  });

  function set<K extends keyof typeof fields>(key: K, val: string) {
    setFields((s) => ({ ...s, [key]: val }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const data = form.validate({
      firstName:             fields.firstName,
      lastName:              fields.lastName,
      birthDate:             fields.birthDate || undefined,
      contactPhone:          fields.contactPhone || undefined,
      contactEmail:          fields.contactEmail || undefined,
      contactName:           fields.contactName || undefined,
      dependencyGrade:       (fields.dependencyGrade as DependencyGrade) || undefined,
      placeRegime:           (fields.placeRegime as PlaceRegime) || undefined,
      origin:                (fields.origin as AdmissionOrigin) || undefined,
      priority:              Number(fields.priority),
      expectedAdmissionDate: fields.expectedAdmissionDate || undefined,
      notes:                 fields.notes || undefined,
    });
    if (!data) return;
    update.mutate({ id: req.id, ...data });
  }

  return (
    <form id="edit-admission-form" noValidate onSubmit={handleSubmit} className="flex flex-col gap-4">
      {/* Candidato */}
      <fieldset className="flex flex-col gap-3 rounded-xl border border-brand-100 p-3">
        <legend className="px-1 text-xs font-semibold uppercase tracking-widest text-[#1A3A3F]/60">
          {t('admissions.form.candidate')}
        </legend>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="edit-firstName">{t('admissions.form.firstName')}</Label>
            <Input
              id="edit-firstName"
              value={fields.firstName}
              onChange={(e) => set('firstName', e.target.value)}
              aria-invalid={Boolean(form.errors.firstName)}
              aria-describedby={form.errors.firstName ? 'edit-firstName-err' : undefined}
            />
            <FieldError id="edit-firstName-err">{form.errors.firstName}</FieldError>
          </div>
          <div>
            <Label htmlFor="edit-lastName">{t('admissions.form.lastName')}</Label>
            <Input
              id="edit-lastName"
              value={fields.lastName}
              onChange={(e) => set('lastName', e.target.value)}
              aria-invalid={Boolean(form.errors.lastName)}
              aria-describedby={form.errors.lastName ? 'edit-lastName-err' : undefined}
            />
            <FieldError id="edit-lastName-err">{form.errors.lastName}</FieldError>
          </div>
          <div>
            <Label htmlFor="edit-birthDate">{t('admissions.form.birthDate')}</Label>
            <Input
              id="edit-birthDate"
              type="date"
              value={fields.birthDate}
              onChange={(e) => set('birthDate', e.target.value)}
            />
          </div>
        </div>
      </fieldset>

      {/* Contacto */}
      <fieldset className="flex flex-col gap-3 rounded-xl border border-brand-100 p-3">
        <legend className="px-1 text-xs font-semibold uppercase tracking-widest text-[#1A3A3F]/60">
          Contacto
        </legend>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="edit-contactName">{t('admissions.form.contactName')}</Label>
            <Input
              id="edit-contactName"
              value={fields.contactName}
              onChange={(e) => set('contactName', e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="edit-contactPhone">{t('admissions.form.contactPhone')}</Label>
            <Input
              id="edit-contactPhone"
              type="tel"
              value={fields.contactPhone}
              onChange={(e) => set('contactPhone', e.target.value)}
            />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="edit-contactEmail">{t('admissions.form.contactEmail')}</Label>
            <Input
              id="edit-contactEmail"
              type="email"
              value={fields.contactEmail}
              onChange={(e) => set('contactEmail', e.target.value)}
              aria-invalid={Boolean(form.errors.contactEmail)}
              aria-describedby={form.errors.contactEmail ? 'edit-contactEmail-err' : undefined}
            />
            <FieldError id="edit-contactEmail-err">{form.errors.contactEmail}</FieldError>
          </div>
        </div>
      </fieldset>

      {/* Plaza */}
      <fieldset className="flex flex-col gap-3 rounded-xl border border-brand-100 p-3">
        <legend className="px-1 text-xs font-semibold uppercase tracking-widest text-[#1A3A3F]/60">
          Plaza
        </legend>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="edit-depGrade">{t('admissions.form.dependencyGrade')}</Label>
            <Select
              id="edit-depGrade"
              value={fields.dependencyGrade}
              onChange={(e) => set('dependencyGrade', e.target.value)}
            >
              <option value="">— Sin especificar —</option>
              {Object.values(DependencyGrade).map((g) => (
                <option key={g} value={g}>{g}</option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="edit-placeRegime">{t('admissions.form.placeType')}</Label>
            <Select
              id="edit-placeRegime"
              value={fields.placeRegime}
              onChange={(e) => set('placeRegime', e.target.value)}
            >
              <option value="">— Sin especificar —</option>
              {Object.values(PlaceRegime).map((r) => (
                <option key={r} value={r}>{t(`admission.placeType.${r}`)}</option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="edit-origin">{t('admissions.form.origin')}</Label>
            <Select
              id="edit-origin"
              value={fields.origin}
              onChange={(e) => set('origin', e.target.value)}
            >
              <option value="">— Sin especificar —</option>
              {Object.values(AdmissionOrigin).map((o) => (
                <option key={o} value={o}>{t(`admission.origin.${o}`)}</option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="edit-priority">{t('admissions.form.priority')}</Label>
            <Select
              id="edit-priority"
              value={fields.priority}
              onChange={(e) => set('priority', e.target.value)}
            >
              <option value="1">{t('admission.priority.ALTA')}</option>
              <option value="2">{t('admission.priority.NORMAL')}</option>
              <option value="3">{t('admission.priority.BAJA')}</option>
            </Select>
          </div>
          <div>
            <Label htmlFor="edit-expectedDate">{t('admissions.form.expectedDate')}</Label>
            <Input
              id="edit-expectedDate"
              type="date"
              value={fields.expectedAdmissionDate}
              onChange={(e) => set('expectedAdmissionDate', e.target.value)}
            />
          </div>
        </div>
        <div>
          <Label htmlFor="edit-notes">{t('admissions.form.notes')}</Label>
          <textarea
            id="edit-notes"
            value={fields.notes}
            onChange={(e) => set('notes', e.target.value)}
            rows={3}
            maxLength={2000}
            className="w-full rounded-2xl border border-brand-200 px-3 py-2 text-base focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30 resize-y"
          />
        </div>
      </fieldset>

      <div className="flex justify-end gap-2">
        <Button
          type="submit"
          form="edit-admission-form"
          disabled={update.isPending}
        >
          {update.isPending ? t('state.loading') : t('action.save')}
        </Button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Dialog de transición de estado
// ---------------------------------------------------------------------------

function TransitionDialog({
  req,
  open,
  onOpenChange,
  t,
}: {
  req: AdmissionDetail;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
}) {
  const toast = useToast();
  const utils = api.useUtils();
  const [toStatus, setToStatus] = useState<DomainStatus | ''>('');
  const [notes, setNotes] = useState('');
  const [admissionDate, setAdmissionDate] = useState('');

  const from = req.status as DomainStatus;
  const nexts = allowedTransitions(from).filter(
    (s) => s !== 'REJECTED' && s !== 'WITHDRAWN',
  );

  const transition = api.admisiones.requests.transition.useMutation({
    onSuccess: async (data) => {
      await utils.admisiones.requests.get.invalidate({ id: req.id });
      await utils.admisiones.requests.list.invalidate();
      toast.success(t('admissions.actions.transitioned'));
      onOpenChange(false);
      setToStatus('');
      setNotes('');
      setAdmissionDate('');
      if (data.residentId && data.status === 'ADMITTED') {
        window.location.href = `/residentes/${data.residentId}/resumen`;
      }
    },
    onError: (e) => toast.error(e.message),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!toStatus) return;
    transition.mutate({
      id: req.id,
      to: toStatus as AdmissionStatus,
      notes: notes || undefined,
      admissionDate: admissionDate ? new Date(admissionDate) : undefined,
    });
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) { setToStatus(''); setNotes(''); setAdmissionDate(''); } onOpenChange(v); }}>
      <DialogContent>
        <DialogTitle>{t('admissions.actions.transition')}</DialogTitle>
        <form id="transition-form" onSubmit={handleSubmit} className="mt-2 flex flex-col gap-4">
          <div>
            <Label htmlFor="trans-status">{t('admissions.detail.status')}</Label>
            <Select
              id="trans-status"
              value={toStatus}
              onChange={(e) => setToStatus(e.target.value as DomainStatus | '')}
              aria-required="true"
            >
              <option value="">{t('admissions.actions.selectStatus')}</option>
              {nexts.map((s) => (
                <option key={s} value={s}>{t(`admission.status.${s}`)}</option>
              ))}
            </Select>
          </div>

          {/* Fecha de ingreso efectivo (solo para ADMITTED) */}
          {toStatus === 'ADMITTED' && (
            <div>
              <Label htmlFor="trans-admDate">{t('admissions.detail.admittedAt')}</Label>
              <Input
                id="trans-admDate"
                type="date"
                value={admissionDate}
                onChange={(e) => setAdmissionDate(e.target.value)}
              />
            </div>
          )}

          <div>
            <Label htmlFor="trans-notes">{t('admissions.detail.notes')} (opcional)</Label>
            <textarea
              id="trans-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              maxLength={2000}
              className="w-full rounded-2xl border border-brand-200 px-3 py-2 text-base focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30 resize-y"
            />
          </div>
        </form>

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="secondary" type="button">{t('action.cancel')}</Button>
          </DialogClose>
          <Button
            type="submit"
            form="transition-form"
            disabled={!toStatus || transition.isPending}
          >
            {transition.isPending ? t('state.loading') : t('admissions.actions.transition')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Página de detalle
// ---------------------------------------------------------------------------

export default function AdmisionDetallePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { t, locale } = useT();
  const toast = useToast();
  const confirm = useConfirm();
  const utils = api.useUtils();

  const [editing, setEditing]   = useState(false);
  const [transitioning, setTransitioning] = useState(false);

  const me  = api.me.useQuery();
  const req = api.admisiones.requests.get.useQuery({ id });

  const close = api.admisiones.requests.close.useMutation({
    onSuccess: async () => {
      await utils.admisiones.requests.get.invalidate({ id });
      await utils.admisiones.requests.list.invalidate();
      toast.success(t('admissions.actions.closed'));
    },
    onError: (e) => toast.error(e.message),
  });

  const canRead   = me.data?.permissions.includes('admissions:read')   ?? false;
  const canManage = me.data?.permissions.includes('admissions:manage') ?? false;

  async function handleClose(status: 'REJECTED' | 'WITHDRAWN') {
    if (!req.data) return;
    const actionLabel = status === 'REJECTED'
      ? t('admissions.actions.reject')
      : t('admissions.actions.withdraw');
    const result = await confirm({
      title: actionLabel,
      description: `${actionLabel}: ${req.data.firstName} ${req.data.lastName}`,
      confirmLabel: actionLabel,
      tone: status === 'REJECTED' ? 'danger' : 'default',
      reason: {
        label: t('admissions.actions.closingReason'),
        required: false,
        placeholder: 'Motivo (opcional)…',
      },
    });
    if (!result) return;
    close.mutate({ id, status, outcomeReason: result.reason });
  }

  // Loading
  if (req.isLoading || me.isLoading) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-6 w-36" />
        <Skeleton className="h-48 w-full rounded-2xl" />
        <Skeleton className="h-32 w-full rounded-2xl" />
      </div>
    );
  }

  if (!canRead) {
    return (
      <p className="text-[#1A3A3F]/60">Tu rol no tiene acceso a esta sección.</p>
    );
  }

  if (!req.data) {
    return (
      <p className="text-[#1A3A3F]/60">{t('r360.notFound')}</p>
    );
  }

  const data = req.data as AdmissionDetail;
  const from = data.status as DomainStatus;
  const terminal = isTerminalStatus(from);
  const canAdmit = allowedTransitions(from).includes('ADMITTED');
  const canReject = allowedTransitions(from).includes('REJECTED');
  const canWithdraw = allowedTransitions(from).includes('WITHDRAWN');
  const hasNextSteps = allowedTransitions(from).length > 0 && canManage;

  return (
    <div className="flex flex-col gap-6">
      {/* Volver */}
      <Link
        href="/admisiones"
        className="text-sm text-brand-700 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
      >
        {t('admissions.detail.back')}
      </Link>

      {/* Cabecera */}
      <Card>
        <CardContent>
          <div className="flex flex-col gap-3">
            {/* Nombre + estado + prioridad */}
            <div className="flex flex-wrap items-start justify-between gap-2">
              <h1 className="text-xl font-extrabold tracking-tight text-[#1A3A3F] leading-snug">
                {data.firstName} {data.lastName}
              </h1>
              <div className="flex flex-wrap items-center gap-2">
                <AdmissionStatusBadge status={data.status} t={t} />
                <PriorityBadge priority={data.priority} />
              </div>
            </div>

            {/* Metadatos */}
            <dl className="grid gap-x-4 gap-y-2 text-sm sm:grid-cols-2 md:grid-cols-3">
              <div>
                <dt className="text-xs font-semibold uppercase tracking-widest text-[#1A3A3F]/40">
                  {t('admissions.detail.center')}
                </dt>
                <dd className="text-[#1A3A3F]">
                  {data.center.name}{data.unit ? ` · ${data.unit.name}` : ''}
                </dd>
              </div>

              {data.dependencyGrade && (
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-widest text-[#1A3A3F]/40">
                    {t('admissions.form.dependencyGrade')}
                  </dt>
                  <dd className="text-[#1A3A3F]">{data.dependencyGrade}</dd>
                </div>
              )}

              {data.placeRegime && (
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-widest text-[#1A3A3F]/40">
                    {t('admissions.detail.placeType')}
                  </dt>
                  <dd className="text-[#1A3A3F]">{t(`admission.placeType.${data.placeRegime}`)}</dd>
                </div>
              )}

              {data.origin && (
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-widest text-[#1A3A3F]/40">
                    {t('admissions.detail.origin')}
                  </dt>
                  <dd className="text-[#1A3A3F]">{t(`admission.origin.${data.origin}`)}</dd>
                </div>
              )}

              {data.expectedAdmissionDate && (
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-widest text-[#1A3A3F]/40">
                    {t('admissions.detail.expectedDate')}
                  </dt>
                  <dd className="text-[#1A3A3F]">
                    <time dateTime={new Date(data.expectedAdmissionDate).toISOString()}>
                      {formatDate(locale as 'es' | 'ca', data.expectedAdmissionDate)}
                    </time>
                  </dd>
                </div>
              )}

              <div>
                <dt className="text-xs font-semibold uppercase tracking-widest text-[#1A3A3F]/40">
                  {t('admissions.detail.requestDate')}
                </dt>
                <dd className="text-[#1A3A3F]">
                  <time dateTime={new Date(data.requestedAt).toISOString()}>
                    {formatDateTime(locale as 'es' | 'ca', data.requestedAt)}
                  </time>
                </dd>
              </div>

              {/* Contacto */}
              {data.contactName && (
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-widest text-[#1A3A3F]/40">Contacto</dt>
                  <dd className="text-[#1A3A3F]">{data.contactName}</dd>
                </div>
              )}
              {data.contactPhone && (
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-widest text-[#1A3A3F]/40">{t('admissions.form.contactPhone')}</dt>
                  <dd>
                    <a
                      href={`tel:${data.contactPhone}`}
                      className="text-brand-700 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
                    >
                      {data.contactPhone}
                    </a>
                  </dd>
                </div>
              )}
              {data.contactEmail && (
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-widest text-[#1A3A3F]/40">{t('admissions.form.contactEmail')}</dt>
                  <dd>
                    <a
                      href={`mailto:${data.contactEmail}`}
                      className="text-brand-700 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
                    >
                      {data.contactEmail}
                    </a>
                  </dd>
                </div>
              )}
              {data.birthDate && (
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-widest text-[#1A3A3F]/40">{t('admissions.form.birthDate')}</dt>
                  <dd className="text-[#1A3A3F]">
                    <time dateTime={new Date(data.birthDate).toISOString()}>
                      {formatDate(locale as 'es' | 'ca', data.birthDate)}
                    </time>
                  </dd>
                </div>
              )}
            </dl>

            {/* Notas */}
            {data.notes && (
              <div className="rounded-xl bg-brand-50 px-3 py-2 text-sm text-[#1A3A3F]">
                <p className="text-xs font-semibold uppercase tracking-widest text-[#1A3A3F]/40 mb-1">
                  {t('admissions.detail.notes')}
                </p>
                <p className="whitespace-pre-wrap">{data.notes}</p>
              </div>
            )}

            {/* Motivo de cierre */}
            {data.outcomeReason && (
              <div className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-800 border border-red-100">
                <p className="text-xs font-semibold uppercase tracking-widest mb-1">
                  {t('admissions.actions.closingReason')}
                </p>
                <p>{data.outcomeReason}</p>
              </div>
            )}

            {/* Enlace al expediente del residente */}
            {data.residentId && data.resident && (
              <div className="flex items-center gap-2 rounded-xl bg-green-50 border border-green-100 px-3 py-2 text-sm">
                <span className="text-green-700 font-medium">{t('admissions.detail.resident')}:</span>
                <Link
                  href={`/residentes/${data.residentId}/resumen`}
                  className="text-brand-700 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 font-semibold"
                >
                  {data.resident.firstName} {data.resident.lastName} →
                </Link>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Acciones (solo canManage y estado no terminal) */}
      {canManage && !terminal && (
        <div className="flex flex-wrap gap-2">
          <Button
            onClick={() => setTransitioning(true)}
            variant="secondary"
            className="min-h-touch"
          >
            {t('admissions.actions.transition')}
          </Button>
          {canAdmit && (
            <Button
              className="min-h-touch"
              onClick={async () => {
                const result = await confirm({
                  title: t('admissions.actions.admit'),
                  description: `¿Ingresar a ${data.firstName} ${data.lastName}? Se creará su expediente de residente.`,
                  confirmLabel: t('admissions.actions.admit'),
                });
                if (!result) return;
                // Usamos el dialog de transición para poder indicar fecha de ingreso
                setTransitioning(true);
              }}
            >
              {t('admissions.actions.admit')}
            </Button>
          )}
          {canReject && (
            <Button
              variant="danger"
              className="min-h-touch"
              disabled={close.isPending}
              onClick={() => handleClose('REJECTED')}
              aria-label={`Rechazar solicitud de ${data.firstName} ${data.lastName}`}
            >
              {t('admissions.actions.reject')}
            </Button>
          )}
          {canWithdraw && (
            <Button
              variant="ghost"
              className="min-h-touch"
              disabled={close.isPending}
              onClick={() => handleClose('WITHDRAWN')}
              aria-label={`Retirar solicitud de ${data.firstName} ${data.lastName}`}
            >
              {t('admissions.actions.withdraw')}
            </Button>
          )}
          <Button
            variant="ghost"
            className="min-h-touch"
            onClick={() => setEditing((v) => !v)}
          >
            {editing ? 'Cancelar edición' : 'Editar datos'}
          </Button>
        </div>
      )}

      {/* Formulario de edición */}
      {editing && canManage && !terminal && (
        <SectionCard title="Editar solicitud">
          <EditForm req={data} onSaved={() => setEditing(false)} t={t} />
        </SectionCard>
      )}

      {/* Dialog de transición */}
      {hasNextSteps && (
        <TransitionDialog
          req={data}
          open={transitioning}
          onOpenChange={setTransitioning}
          t={t}
        />
      )}
    </div>
  );
}
