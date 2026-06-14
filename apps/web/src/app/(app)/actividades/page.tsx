'use client';

/**
 * Página principal de Actividades — animación sociocultural / terapia ocupacional.
 *
 * Acceso: activities:read (ver) / activities:manage (crear, editar, archivar, inscribir, asistencia)
 *
 * Estructura (3 tabs):
 *   Tab "Catálogo"  — listado de actividades, alta/edición/archivado.
 *   Tab "Sesiones"  — agenda filtrada por fecha, crear/editar/cancelar sesión.
 *   Tab "Sesión"    — detalle dinámico: inscripciones + asistencia (visible tras seleccionar).
 *
 * Accesibilidad (WCAG 2.1 AA):
 *   - Tabs con roles/aria correctos (Radix).
 *   - Formularios con FieldError por campo (Zod inline, reutilizando esquemas del backend).
 *   - Touch targets mín. 48 px (min-h-touch).
 *   - Diálogos con focus-trap (Radix Dialog).
 *   - Color nunca es el único canal (badges con texto).
 */

import { useState } from 'react';
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
  EmptyState,
  FieldError,
  Input,
  Label,
  PageHeader,
  Select,
  Skeleton,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@vetlla/ui';
import { api } from '@/trpc/react';
import { useT } from '@/i18n/provider';
import { useToast } from '@/components/toast';
import { useConfirm } from '@/components/confirm';
import { useZodForm } from '@/lib/form';
import { formatDateTime } from '@/lib/format';
import {
  activityCreateSchema,
  sessionCreateSchema,
  ActivityCategory,
} from '@/lib/schemas/actividades';

// ---------------------------------------------------------------------------
// Helpers de tipo
// ---------------------------------------------------------------------------

type Activity = {
  id: string;
  name: string;
  description: string | null;
  category: ActivityCategory;
  location: string | null;
  maxCapacity: number;
  durationMin: number;
  active: boolean;
};

type SessionWithActivity = {
  id: string;
  startsAt: Date;
  endsAt: Date;
  status: string;
  notes: string | null;
  activity: { id: string; name: string; category: ActivityCategory; maxCapacity: number };
  _count: { enrollments: number };
};

type Enrollment = {
  id: string;
  status: string;
  attended: boolean | null;
  observation: string | null;
  resident: { id: string; firstName: string; lastName: string };
};

type Resident = {
  id: string;
  firstName: string;
  lastName: string;
};

// ---------------------------------------------------------------------------
// Badge de categoría
// ---------------------------------------------------------------------------

const CATEGORY_TONE: Record<ActivityCategory, 'blue' | 'green' | 'amber' | 'neutral' | 'red' | 'warm'> = {
  COGNITIVA: 'blue',
  FISICA:    'green',
  SOCIAL:    'amber',
  CREATIVA:  'warm',
  SALIDA:    'neutral',
  OTRA:      'neutral',
};

function CategoryBadge({ category }: { category: ActivityCategory }) {
  const { t } = useT();
  return (
    <Badge tone={CATEGORY_TONE[category]}>
      {t(`activity.category.${category}`)}
    </Badge>
  );
}

// ---------------------------------------------------------------------------
// Badge de estado de sesión
// ---------------------------------------------------------------------------

const SESSION_STATUS_TONE: Record<string, 'green' | 'blue' | 'red' | 'neutral'> = {
  PROGRAMADA: 'blue',
  REALIZADA:  'green',
  CANCELADA:  'red',
};

function SessionStatusBadge({ status }: { status: string }) {
  const { t } = useT();
  return (
    <Badge tone={SESSION_STATUS_TONE[status] ?? 'neutral'}>
      {t(`activity.session.status.${status}`)}
    </Badge>
  );
}

// ---------------------------------------------------------------------------
// Badge de estado de inscripción
// ---------------------------------------------------------------------------

const ENROLLMENT_STATUS_TONE: Record<string, 'green' | 'amber' | 'red' | 'neutral'> = {
  INSCRITO:     'green',
  LISTA_ESPERA: 'amber',
  CANCELADO:    'red',
};

function EnrollmentStatusBadge({ status }: { status: string }) {
  const { t } = useT();
  return (
    <Badge tone={ENROLLMENT_STATUS_TONE[status] ?? 'neutral'}>
      {t(`activity.enrollment.status.${status}`)}
    </Badge>
  );
}

// ---------------------------------------------------------------------------
// Formulario de actividad (alta y edición)
// ---------------------------------------------------------------------------

const CATEGORIES = Object.values(ActivityCategory);

function ActivityForm({
  initial,
  onSubmit,
  loading,
  submitLabel,
}: {
  initial?: Partial<z.infer<typeof activityCreateSchema>>;
  onSubmit: (data: z.infer<typeof activityCreateSchema>) => void;
  loading: boolean;
  submitLabel: string;
}) {
  const { t } = useT();
  const form = useZodForm(activityCreateSchema);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const raw = {
      name:        fd.get('name') as string,
      description: (fd.get('description') as string) || undefined,
      category:    fd.get('category') as ActivityCategory,
      location:    (fd.get('location') as string) || undefined,
      maxCapacity: Number(fd.get('maxCapacity')),
      durationMin: Number(fd.get('durationMin')),
    };
    const data = form.validate(raw);
    if (data) onSubmit(data);
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
      {/* Nombre */}
      <div>
        <Label htmlFor="act-name">{t('activities.form.name')}</Label>
        <Input
          id="act-name"
          name="name"
          defaultValue={initial?.name ?? ''}
          placeholder={t('activities.form.namePh')}
          aria-describedby={form.errors.name ? 'act-name-err' : undefined}
          aria-invalid={!!form.errors.name}
        />
        <FieldError id="act-name-err">{form.errors.name}</FieldError>
      </div>

      {/* Descripción */}
      <div>
        <Label htmlFor="act-desc">{t('activities.form.description')}</Label>
        <textarea
          id="act-desc"
          name="description"
          defaultValue={initial?.description ?? ''}
          rows={3}
          className="min-h-touch w-full rounded-2xl border border-brand-200 px-3 py-2 text-base focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
        />
        <FieldError>{form.errors.description}</FieldError>
      </div>

      {/* Categoría */}
      <div>
        <Label htmlFor="act-category">{t('activities.form.category')}</Label>
        <Select
          id="act-category"
          name="category"
          defaultValue={initial?.category ?? 'OTRA'}
          aria-describedby={form.errors.category ? 'act-category-err' : undefined}
          aria-invalid={!!form.errors.category}
        >
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {t(`activity.category.${c}`)}
            </option>
          ))}
        </Select>
        <FieldError id="act-category-err">{form.errors.category}</FieldError>
      </div>

      {/* Lugar */}
      <div>
        <Label htmlFor="act-location">{t('activities.form.location')}</Label>
        <Input
          id="act-location"
          name="location"
          defaultValue={initial?.location ?? ''}
          placeholder={t('activities.form.locationPh')}
        />
        <FieldError>{form.errors.location}</FieldError>
      </div>

      {/* Aforo + Duración */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="act-capacity">{t('activities.form.maxCapacity')}</Label>
          <Input
            id="act-capacity"
            name="maxCapacity"
            type="number"
            min={1}
            max={500}
            defaultValue={initial?.maxCapacity ?? 20}
            aria-describedby={form.errors.maxCapacity ? 'act-capacity-err' : undefined}
            aria-invalid={!!form.errors.maxCapacity}
          />
          <FieldError id="act-capacity-err">{form.errors.maxCapacity}</FieldError>
        </div>
        <div>
          <Label htmlFor="act-duration">{t('activities.form.durationMin')}</Label>
          <Input
            id="act-duration"
            name="durationMin"
            type="number"
            min={5}
            max={480}
            defaultValue={initial?.durationMin ?? 60}
            aria-describedby={form.errors.durationMin ? 'act-duration-err' : undefined}
            aria-invalid={!!form.errors.durationMin}
          />
          <FieldError id="act-duration-err">{form.errors.durationMin}</FieldError>
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <DialogClose asChild>
          <Button type="button" variant="secondary" size="lg">
            {t('action.cancel')}
          </Button>
        </DialogClose>
        <Button type="submit" size="lg" disabled={loading}>
          {loading ? t('activities.form.submitting') : submitLabel}
        </Button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Tab Catálogo
// ---------------------------------------------------------------------------

function CatalogTab({ canManage }: { canManage: boolean }) {
  const { t } = useT();
  const toast = useToast();
  const confirm = useConfirm();
  const utils = api.useUtils();

  const [showAll, setShowAll] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [editActivity, setEditActivity] = useState<Activity | null>(null);

  const catalogQ = api.actividades.catalog.list.useQuery({ onlyActive: !showAll });
  const activities = catalogQ.data ?? [];

  const createMut = api.actividades.catalog.create.useMutation({
    onSuccess: async () => {
      await utils.actividades.catalog.list.invalidate();
      toast.success(t('activities.form.success'));
      setCreateOpen(false);
    },
    onError: (err) => toast.error(err.message),
  });

  const updateMut = api.actividades.catalog.update.useMutation({
    onSuccess: async () => {
      await utils.actividades.catalog.list.invalidate();
      toast.success(t('activities.form.updated'));
      setEditActivity(null);
    },
    onError: (err) => toast.error(err.message),
  });

  const archiveMut = api.actividades.catalog.archive.useMutation({
    onSuccess: async () => {
      await utils.actividades.catalog.list.invalidate();
      toast.success(t('activities.catalog.archived'));
    },
    onError: (err) => toast.error(err.message),
  });

  async function handleArchive(id: string, name: string) {
    const result = await confirm({
      title:        t('activities.catalog.archive'),
      description:  name,
      confirmLabel: t('activities.catalog.archive'),
      tone:         'danger',
    });
    if (!result) return;
    archiveMut.mutate({ id });
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Barra de acciones */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-sm text-[#1A3A3F]/70">
          <input
            type="checkbox"
            checked={showAll}
            onChange={(e) => setShowAll(e.target.checked)}
            className="h-4 w-4 rounded border-brand-300 accent-brand-700"
          />
          {t('activities.catalog.inactive')}
        </label>

        {canManage && (
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <Button size="lg" onClick={() => setCreateOpen(true)}>
              {t('activities.catalog.new')}
            </Button>
            <DialogContent aria-describedby={undefined}>
              <DialogTitle>{t('activities.catalog.new')}</DialogTitle>
              <ActivityForm
                submitLabel={t('activities.form.submit')}
                loading={createMut.isPending}
                onSubmit={(data) => createMut.mutate(data)}
              />
            </DialogContent>
          </Dialog>
        )}
      </div>

      {/* Listado */}
      {catalogQ.isLoading ? (
        <div className="flex flex-col gap-3">
          {[0, 1, 2].map((i) => <Skeleton key={i} className="h-24 w-full rounded-2xl" />)}
        </div>
      ) : activities.length === 0 ? (
        <EmptyState
          title={t('activities.catalog.empty.title')}
          description={t('activities.catalog.empty.desc')}
        />
      ) : (
        <div role="list" aria-label={t('activities.catalog.title')} className="flex flex-col gap-3">
          {activities.map((act) => (
            <div key={act.id} role="listitem">
              <Card className={!act.active ? 'opacity-60' : undefined}>
                <CardContent className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex flex-col gap-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-[#1A3A3F]">{act.name}</span>
                      <CategoryBadge category={act.category as ActivityCategory} />
                      {!act.active && (
                        <Badge tone="red">{t('activities.catalog.inactive')}</Badge>
                      )}
                    </div>
                    {act.description && (
                      <p className="text-sm text-[#1A3A3F]/60 line-clamp-2">{act.description}</p>
                    )}
                    <p className="text-xs text-[#1A3A3F]/40">
                      {act.location && <>{act.location} · </>}
                      {t('activities.enrollments.capacity', {
                        enrolled: '—',
                        max: act.maxCapacity,
                      })} · {act.durationMin} min
                    </p>
                  </div>

                  {canManage && act.active && (
                    <div className="flex gap-2 shrink-0">
                      {/* Editar — abre el dialog externo */}
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => setEditActivity(act as Activity)}
                        aria-label={`Editar ${act.name}`}
                      >
                        Editar
                      </Button>

                      {/* Archivar */}
                      <button
                        type="button"
                        onClick={() => handleArchive(act.id, act.name)}
                        disabled={archiveMut.isPending}
                        className="min-h-[44px] rounded-full border border-red-200 px-3 py-1 text-sm font-medium text-red-600 transition hover:bg-red-50 disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-500"
                        aria-label={`${t('activities.catalog.archive')} ${act.name}`}
                      >
                        {t('activities.catalog.archive')}
                      </button>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          ))}
        </div>
      )}

      {/* Dialog de edición (separado del listado para que solo haya uno activo) */}
      {editActivity && (
        <Dialog
          open={!!editActivity}
          onOpenChange={(open) => { if (!open) setEditActivity(null); }}
        >
          <DialogContent aria-describedby={undefined}>
            <DialogTitle>{editActivity.name}</DialogTitle>
            <ActivityForm
              initial={{
                name:        editActivity.name,
                category:    editActivity.category,
                description: editActivity.description ?? undefined,
                location:    editActivity.location ?? undefined,
                maxCapacity: editActivity.maxCapacity,
                durationMin: editActivity.durationMin,
              }}
              submitLabel={t('activities.form.updated')}
              loading={updateMut.isPending}
              onSubmit={(data) => updateMut.mutate({ id: editActivity.id, data })}
            />
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Formulario de sesión
// ---------------------------------------------------------------------------

function toDatetimeLocal(d: Date | string): string {
  const dt = new Date(d);
  // Formato YYYY-MM-DDTHH:mm requerido por input[type=datetime-local]
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}T${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
}

function SessionForm({
  activities,
  initial,
  onSubmit,
  loading,
  submitLabel,
}: {
  activities: Activity[];
  initial?: {
    activityId?: string;
    startsAt?: Date;
    endsAt?: Date;
    notes?: string | null;
  };
  onSubmit: (data: z.infer<typeof sessionCreateSchema>) => void;
  loading: boolean;
  submitLabel: string;
}) {
  const { t } = useT();
  const form = useZodForm(sessionCreateSchema);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const raw = {
      activityId: fd.get('activityId') as string,
      startsAt:   fd.get('startsAt') as string,
      endsAt:     fd.get('endsAt') as string,
      notes:      (fd.get('notes') as string) || undefined,
    };
    const data = form.validate(raw);
    if (data) onSubmit(data);
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
      {/* Actividad */}
      <div>
        <Label htmlFor="ses-activity">{t('activities.form.name')}</Label>
        <Select
          id="ses-activity"
          name="activityId"
          defaultValue={initial?.activityId ?? ''}
          aria-describedby={form.errors.activityId ? 'ses-activity-err' : undefined}
          aria-invalid={!!form.errors.activityId}
        >
          <option value="">—</option>
          {activities.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </Select>
        <FieldError id="ses-activity-err">{form.errors.activityId}</FieldError>
      </div>

      {/* Inicio */}
      <div>
        <Label htmlFor="ses-starts">{t('activities.sessions.startsAt')}</Label>
        <Input
          id="ses-starts"
          name="startsAt"
          type="datetime-local"
          defaultValue={initial?.startsAt ? toDatetimeLocal(initial.startsAt) : ''}
          aria-describedby={form.errors.startsAt ? 'ses-starts-err' : undefined}
          aria-invalid={!!form.errors.startsAt}
        />
        <FieldError id="ses-starts-err">{form.errors.startsAt}</FieldError>
      </div>

      {/* Fin */}
      <div>
        <Label htmlFor="ses-ends">{t('activities.sessions.endsAt')}</Label>
        <Input
          id="ses-ends"
          name="endsAt"
          type="datetime-local"
          defaultValue={initial?.endsAt ? toDatetimeLocal(initial.endsAt) : ''}
          aria-describedby={form.errors.endsAt ? 'ses-ends-err' : undefined}
          aria-invalid={!!form.errors.endsAt}
        />
        <FieldError id="ses-ends-err">{form.errors.endsAt}</FieldError>
      </div>

      {/* Notas */}
      <div>
        <Label htmlFor="ses-notes">{t('activities.sessions.notes')}</Label>
        <textarea
          id="ses-notes"
          name="notes"
          defaultValue={initial?.notes ?? ''}
          rows={3}
          className="min-h-touch w-full rounded-2xl border border-brand-200 px-3 py-2 text-base focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
        />
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <DialogClose asChild>
          <Button type="button" variant="secondary" size="lg">
            {t('action.cancel')}
          </Button>
        </DialogClose>
        <Button type="submit" size="lg" disabled={loading}>
          {loading ? t('activities.form.submitting') : submitLabel}
        </Button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Tab Sesiones
// ---------------------------------------------------------------------------

function SessionsTab({
  canManage,
  onSelectSession,
}: {
  canManage: boolean;
  onSelectSession: (session: SessionWithActivity) => void;
}) {
  const { t, locale } = useT();
  const toast = useToast();
  const confirm = useConfirm();
  const utils = api.useUtils();

  // Filtro: semana actual por defecto
  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);
  const [fromStr, setFromStr] = useState(todayStr);
  const [toStr, setToStr] = useState(() => {
    const d = new Date(today);
    d.setDate(d.getDate() + 7);
    return d.toISOString().slice(0, 10);
  });

  const [createOpen, setCreateOpen] = useState(false);
  const [editSession, setEditSession] = useState<SessionWithActivity | null>(null);

  const catalogQ = api.actividades.catalog.list.useQuery({ onlyActive: true });
  const activeActivities = (catalogQ.data ?? []) as Activity[];

  const sessionsQ = api.actividades.sessions.list.useQuery({
    from: new Date(`${fromStr}T00:00:00`),
    to:   new Date(`${toStr}T23:59:59`),
  });
  const sessions = (sessionsQ.data ?? []) as SessionWithActivity[];

  const createMut = api.actividades.sessions.create.useMutation({
    onSuccess: async () => {
      await utils.actividades.sessions.list.invalidate();
      toast.success(t('activities.sessions.new'));
      setCreateOpen(false);
    },
    onError: (err) => toast.error(err.message),
  });

  const updateMut = api.actividades.sessions.update.useMutation({
    onSuccess: async () => {
      await utils.actividades.sessions.list.invalidate();
      toast.success(t('activities.form.updated'));
      setEditSession(null);
    },
    onError: (err) => toast.error(err.message),
  });

  const cancelMut = api.actividades.sessions.cancel.useMutation({
    onSuccess: async () => {
      await utils.actividades.sessions.list.invalidate();
      toast.success(t('activities.sessions.cancelled'));
    },
    onError: (err) => toast.error(err.message),
  });

  async function handleCancel(session: SessionWithActivity) {
    const result = await confirm({
      title:        t('activities.sessions.cancel'),
      description:  `${session.activity.name} — ${formatDateTime(locale, session.startsAt)}`,
      confirmLabel: t('activities.sessions.cancel'),
      tone:         'danger',
      reason: {
        label:       t('activities.sessions.notes'),
        required:    false,
        placeholder: '…',
      },
    });
    if (!result) return;
    cancelMut.mutate({ id: session.id, notes: result.reason ?? undefined });
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Filtros y botón nueva sesión */}
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <Label htmlFor="ses-from">{t('activities.sessions.startsAt')}</Label>
          <Input
            id="ses-from"
            type="date"
            value={fromStr}
            onChange={(e) => setFromStr(e.target.value)}
            className="min-h-[44px]"
          />
        </div>
        <div>
          <Label htmlFor="ses-to">{t('activities.sessions.endsAt')}</Label>
          <Input
            id="ses-to"
            type="date"
            value={toStr}
            onChange={(e) => setToStr(e.target.value)}
            className="min-h-[44px]"
          />
        </div>
        {canManage && (
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <Button size="lg" onClick={() => setCreateOpen(true)}>
              {t('activities.sessions.new')}
            </Button>
            <DialogContent aria-describedby={undefined}>
              <DialogTitle>{t('activities.sessions.new')}</DialogTitle>
              <SessionForm
                activities={activeActivities}
                submitLabel={t('activities.sessions.new')}
                loading={createMut.isPending}
                onSubmit={(data) => createMut.mutate(data)}
              />
            </DialogContent>
          </Dialog>
        )}
      </div>

      {/* Listado de sesiones */}
      {sessionsQ.isLoading ? (
        <div className="flex flex-col gap-3">
          {[0, 1, 2].map((i) => <Skeleton key={i} className="h-28 w-full rounded-2xl" />)}
        </div>
      ) : sessions.length === 0 ? (
        <EmptyState
          title={t('activities.sessions.empty.title')}
          description={t('activities.sessions.empty.desc')}
        />
      ) : (
        <div role="list" aria-label={t('activities.sessions.title')} className="flex flex-col gap-3">
          {sessions.map((ses) => {
            const enrolled = ses._count.enrollments;
            const max      = ses.activity.maxCapacity;
            const isFull   = enrolled >= max;

            return (
              <div key={ses.id} role="listitem">
                <Card className={ses.status === 'CANCELADA' ? 'opacity-60' : undefined}>
                  <CardContent className="flex flex-wrap items-start justify-between gap-3">
                    {/* Info principal */}
                    <div className="flex flex-col gap-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-[#1A3A3F]">{ses.activity.name}</span>
                        <CategoryBadge category={ses.activity.category as ActivityCategory} />
                        <SessionStatusBadge status={ses.status} />
                      </div>
                      <time
                        dateTime={ses.startsAt.toString()}
                        className="text-sm text-[#1A3A3F]/70"
                      >
                        {formatDateTime(locale, ses.startsAt)} — {formatDateTime(locale, ses.endsAt)}
                      </time>
                      <div className="flex flex-wrap items-center gap-2 text-xs text-[#1A3A3F]/50">
                        <span
                          aria-label={t('activities.enrollments.capacity', { enrolled, max })}
                        >
                          {t('activities.enrollments.capacity', { enrolled, max })}
                        </span>
                        {isFull && (
                          <Badge tone="amber">{t('activities.enrollments.full')}</Badge>
                        )}
                      </div>
                      {ses.notes && (
                        <p className="text-xs text-[#1A3A3F]/50 italic">{ses.notes}</p>
                      )}
                    </div>

                    {/* Acciones */}
                    <div className="flex flex-wrap gap-2 shrink-0">
                      {/* Ver detalle (inscripciones + asistencia) */}
                      <button
                        type="button"
                        onClick={() => onSelectSession(ses)}
                        className="min-h-[44px] rounded-full border border-brand-200 px-4 py-1.5 text-sm font-medium text-brand-700 transition hover:bg-brand-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
                        aria-label={`${t('activities.enrollments.title')} ${ses.activity.name}`}
                      >
                        {t('activities.enrollments.title')}
                      </button>

                      {canManage && ses.status !== 'CANCELADA' && (
                        <>
                          {/* Editar sesión — abre el dialog externo */}
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => setEditSession(ses)}
                            aria-label={`Editar sesión ${ses.activity.name}`}
                          >
                            Editar
                          </Button>

                          {/* Cancelar sesión */}
                          <button
                            type="button"
                            onClick={() => handleCancel(ses)}
                            disabled={cancelMut.isPending}
                            className="min-h-[44px] rounded-full border border-red-200 px-3 py-1 text-sm font-medium text-red-600 transition hover:bg-red-50 disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-500"
                            aria-label={`${t('activities.sessions.cancel')} ${ses.activity.name}`}
                          >
                            {t('activities.sessions.cancel')}
                          </button>
                        </>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </div>
            );
          })}
        </div>
      )}

      {/* Dialog externo de edición de sesión (único en el DOM) */}
      {editSession && (
        <Dialog
          open={!!editSession}
          onOpenChange={(open) => { if (!open) setEditSession(null); }}
        >
          <DialogContent aria-describedby={undefined}>
            <DialogTitle>{editSession.activity.name}</DialogTitle>
            <SessionForm
              activities={activeActivities}
              initial={{
                activityId: editSession.activity.id,
                startsAt:   editSession.startsAt,
                endsAt:     editSession.endsAt,
                notes:      editSession.notes,
              }}
              submitLabel={t('activities.form.updated')}
              loading={updateMut.isPending}
              onSubmit={(data) =>
                updateMut.mutate({
                  id:   editSession.id,
                  data: { startsAt: data.startsAt, endsAt: data.endsAt, notes: data.notes },
                })
              }
            />
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab Sesión — Inscripciones + Asistencia
// ---------------------------------------------------------------------------

function SessionDetailTab({
  session,
  canManage,
}: {
  session: SessionWithActivity;
  canManage: boolean;
}) {
  const { t, locale } = useT();
  const toast = useToast();
  const confirm = useConfirm();
  const utils = api.useUtils();

  const [enrollOpen, setEnrollOpen] = useState(false);
  const [selectedResidentId, setSelectedResidentId] = useState('');

  // Inscripciones de la sesión
  const enrollmentsQ = api.actividades.enrollments.list.useQuery({ sessionId: session.id });
  const enrollments = (enrollmentsQ.data ?? []) as Enrollment[];

  // Asistencia (no-cancelados)
  const attendanceQ = api.actividades.attendance.list.useQuery({ sessionId: session.id });
  const attendanceList = (attendanceQ.data ?? []) as Enrollment[];

  // Residentes del tenant para el select de inscripción
  const residentsQ = api.residents.list.useQuery();
  const residents = (residentsQ.data ?? []) as Resident[];

  const enrolledIds = new Set(
    enrollments.filter((e) => e.status !== 'CANCELADO').map((e) => e.resident.id),
  );

  const enrollMut = api.actividades.enrollments.enroll.useMutation({
    onSuccess: async (result) => {
      await utils.actividades.enrollments.list.invalidate();
      await utils.actividades.sessions.list.invalidate();
      const key =
        (result as { status: string }).status === 'LISTA_ESPERA'
          ? 'activities.enrollments.waiting'
          : 'activities.enrollments.enrolled';
      toast.success(t(key));
      setEnrollOpen(false);
      setSelectedResidentId('');
    },
    onError: (err) => toast.error(err.message),
  });

  const cancelEnrollMut = api.actividades.enrollments.cancel.useMutation({
    onSuccess: async () => {
      await utils.actividades.enrollments.list.invalidate();
      await utils.actividades.sessions.list.invalidate();
      toast.success(t('activities.enrollments.cancelled'));
    },
    onError: (err) => toast.error(err.message),
  });

  const recordMut = api.actividades.attendance.record.useMutation({
    onSuccess: async () => {
      await utils.actividades.attendance.list.invalidate();
      toast.success(t('activities.attendance.saved'));
    },
    onError: (err) => toast.error(err.message),
  });

  async function handleCancelEnroll(enrollment: Enrollment) {
    const result = await confirm({
      title:        t('activities.enrollments.cancel'),
      description:  `${enrollment.resident.firstName} ${enrollment.resident.lastName}`,
      confirmLabel: t('activities.enrollments.cancel'),
      tone:         'danger',
    });
    if (!result) return;
    cancelEnrollMut.mutate({ enrollmentId: enrollment.id });
  }

  const canEnrollMore = session.status === 'PROGRAMADA';
  const canRecordAttendance = session.status === 'PROGRAMADA' || session.status === 'REALIZADA';

  // Contadores de espera
  const waiting = enrollments.filter((e) => e.status === 'LISTA_ESPERA').length;

  return (
    <div className="flex flex-col gap-6">
      {/* Cabecera de la sesión seleccionada */}
      <Card className="border-2 border-brand-200 bg-brand-50/30">
        <CardContent className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex flex-col gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold text-[#1A3A3F]">{session.activity.name}</span>
              <CategoryBadge category={session.activity.category as ActivityCategory} />
              <SessionStatusBadge status={session.status} />
            </div>
            <time className="text-sm text-[#1A3A3F]/70">
              {formatDateTime(locale, session.startsAt)} — {formatDateTime(locale, session.endsAt)}
            </time>
            <p className="text-xs text-[#1A3A3F]/50">
              {t('activities.enrollments.capacity', {
                enrolled: session._count.enrollments,
                max:      session.activity.maxCapacity,
              })}
              {waiting > 0 && (
                <> · <Badge tone="amber">{t('activities.enrollments.waiting.count', { count: waiting })}</Badge></>
              )}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Sección Inscripciones */}
      <section aria-labelledby="enrollments-heading">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 id="enrollments-heading" className="text-base font-semibold text-[#1A3A3F]">
            {t('activities.enrollments.title')}
          </h2>
          {canManage && canEnrollMore && (
            <Dialog open={enrollOpen} onOpenChange={setEnrollOpen}>
              <Button size="lg" onClick={() => setEnrollOpen(true)}>
                {t('activities.enrollments.enroll')}
              </Button>
              <DialogContent aria-describedby={undefined}>
                <DialogTitle>{t('activities.enrollments.enroll')}</DialogTitle>
                <div className="flex flex-col gap-4">
                  <div>
                    <Label htmlFor="enroll-resident">{t('activities.enrollments.title')}</Label>
                    <Select
                      id="enroll-resident"
                      value={selectedResidentId}
                      onChange={(e) => setSelectedResidentId(e.target.value)}
                    >
                      <option value="">—</option>
                      {residents
                        .filter((r) => !enrolledIds.has(r.id))
                        .map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.firstName} {r.lastName}
                          </option>
                        ))}
                    </Select>
                  </div>
                </div>
                <DialogFooter>
                  <DialogClose asChild>
                    <Button type="button" variant="secondary" size="lg">
                      {t('action.cancel')}
                    </Button>
                  </DialogClose>
                  <Button
                    size="lg"
                    disabled={!selectedResidentId || enrollMut.isPending}
                    onClick={() =>
                      enrollMut.mutate({
                        sessionId:  session.id,
                        residentId: selectedResidentId,
                      })
                    }
                  >
                    {enrollMut.isPending
                      ? t('activities.form.submitting')
                      : t('activities.enrollments.enroll')}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </div>

        {enrollmentsQ.isLoading ? (
          <div className="flex flex-col gap-2">
            {[0, 1].map((i) => <Skeleton key={i} className="h-14 w-full rounded-2xl" />)}
          </div>
        ) : enrollments.length === 0 ? (
          <p className="text-sm text-[#1A3A3F]/60">{t('activities.sessions.empty.desc')}</p>
        ) : (
          <div role="list" className="flex flex-col gap-2">
            {enrollments.map((enr) => (
              <div
                key={enr.id}
                role="listitem"
                className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-brand-100/60 bg-white px-4 py-3"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-[#1A3A3F]">
                    {enr.resident.firstName} {enr.resident.lastName}
                  </span>
                  <EnrollmentStatusBadge status={enr.status} />
                </div>
                {canManage && enr.status !== 'CANCELADO' && (
                  <button
                    type="button"
                    onClick={() => handleCancelEnroll(enr)}
                    disabled={cancelEnrollMut.isPending}
                    className="min-h-[44px] rounded-full border border-red-200 px-3 py-1 text-sm font-medium text-red-600 transition hover:bg-red-50 disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-500"
                    aria-label={`${t('activities.enrollments.cancel')} ${enr.resident.firstName} ${enr.resident.lastName}`}
                  >
                    {t('activities.enrollments.cancel')}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Sección Asistencia — solo visible si la sesión permite registrar */}
      {canRecordAttendance && (
        <section aria-labelledby="attendance-heading">
          <h2 id="attendance-heading" className="mb-3 text-base font-semibold text-[#1A3A3F]">
            {t('activities.attendance.title')}
          </h2>

          {attendanceQ.isLoading ? (
            <div className="flex flex-col gap-2">
              {[0, 1].map((i) => <Skeleton key={i} className="h-24 w-full rounded-2xl" />)}
            </div>
          ) : attendanceList.length === 0 ? (
            <p className="text-sm text-[#1A3A3F]/60">{t('activities.sessions.empty.desc')}</p>
          ) : (
            <div role="list" className="flex flex-col gap-3">
              {attendanceList.map((enr) => (
                <AttendanceRow
                  key={enr.id}
                  enrollment={enr}
                  canManage={canManage}
                  onRecord={(attended, observation) =>
                    recordMut.mutate({
                      enrollmentId: enr.id,
                      attended,
                      observation,
                    })
                  }
                  recording={recordMut.isPending}
                />
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Fila de asistencia inline
// ---------------------------------------------------------------------------

function AttendanceRow({
  enrollment,
  canManage,
  onRecord,
  recording,
}: {
  enrollment: Enrollment;
  canManage: boolean;
  onRecord: (attended: boolean, observation?: string) => void;
  recording: boolean;
}) {
  const { t } = useT();
  const [obs, setObs] = useState(enrollment.observation ?? '');

  const attended    = enrollment.attended;
  const residentName = `${enrollment.resident.firstName} ${enrollment.resident.lastName}`;

  return (
    <div
      role="listitem"
      className="flex flex-col gap-3 rounded-2xl border border-brand-100/60 bg-white px-4 py-3"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-medium text-[#1A3A3F]">{residentName}</span>
        {attended === null ? (
          <Badge tone="neutral">{t('activities.portal.pending')}</Badge>
        ) : attended ? (
          <Badge tone="green">{t('activities.attendance.attended')}</Badge>
        ) : (
          <Badge tone="red">{t('activities.attendance.notAttended')}</Badge>
        )}
      </div>

      {canManage && (
        <div className="flex flex-col gap-2">
          {/* Observación */}
          <div>
            <Label htmlFor={`obs-${enrollment.id}`}>{t('activities.attendance.observation')}</Label>
            <Input
              id={`obs-${enrollment.id}`}
              value={obs}
              onChange={(e) => setObs(e.target.value)}
              placeholder={t('activities.attendance.observationPh')}
              aria-label={`${t('activities.attendance.observation')} ${residentName}`}
            />
          </div>
          {/* Botones de asistencia */}
          <div className="flex gap-2">
            <button
              type="button"
              disabled={recording}
              onClick={() => onRecord(true, obs || undefined)}
              className={`min-h-[48px] flex-1 rounded-full px-4 py-2 text-sm font-semibold transition disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 ${
                attended === true
                  ? 'bg-brand-700 text-white'
                  : 'border border-brand-200 text-brand-700 hover:bg-brand-50'
              }`}
              aria-pressed={attended === true}
            >
              {t('activities.attendance.attended')}
            </button>
            <button
              type="button"
              disabled={recording}
              onClick={() => onRecord(false, obs || undefined)}
              className={`min-h-[48px] flex-1 rounded-full px-4 py-2 text-sm font-semibold transition disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-500 ${
                attended === false
                  ? 'bg-red-600 text-white'
                  : 'border border-red-200 text-red-600 hover:bg-red-50'
              }`}
              aria-pressed={attended === false}
            >
              {t('activities.attendance.notAttended')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Componente raíz
// ---------------------------------------------------------------------------

export default function ActividadesPage() {
  const { t } = useT();
  const meQ = api.me.useQuery();
  const permissions = meQ.data?.permissions ?? [];
  const canManage = permissions.includes('activities:manage');

  const [activeTab, setActiveTab] = useState<'catalog' | 'sessions' | 'session'>('catalog');
  const [selectedSession, setSelectedSession] = useState<SessionWithActivity | null>(null);

  function handleSelectSession(session: SessionWithActivity) {
    setSelectedSession(session);
    setActiveTab('session');
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t('nav.activities')}
        subtitle={t('activities.sessions.title')}
        accent
      />

      <Tabs
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as 'catalog' | 'sessions' | 'session')}
      >
        <TabsList aria-label={t('nav.activities')}>
          <TabsTrigger value="catalog">
            {t('activities.catalog.title')}
          </TabsTrigger>
          <TabsTrigger value="sessions">
            {t('activities.sessions.title')}
          </TabsTrigger>
          {selectedSession && (
            <TabsTrigger value="session">
              {selectedSession.activity.name}
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="catalog">
          <CatalogTab canManage={canManage} />
        </TabsContent>

        <TabsContent value="sessions">
          <SessionsTab
            canManage={canManage}
            onSelectSession={handleSelectSession}
          />
        </TabsContent>

        {selectedSession && (
          <TabsContent value="session">
            <SessionDetailTab
              session={selectedSession}
              canManage={canManage}
            />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
