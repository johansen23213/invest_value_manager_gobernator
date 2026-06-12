'use client';

import { useState } from 'react';
import { Badge, Card, CardContent, EmptyState, FieldError, Input, Label, Skeleton } from '@vetlla/ui';
import { api } from '@/trpc/react';
import { useT } from '@/i18n/provider';
import { useToast } from '@/components/toast';
import { useConfirm } from '@/components/confirm';

const DAYS_OF_WEEK = [0, 1, 2, 3, 4, 5, 6] as const;

type SlotRow = {
  id: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  capacity: number;
  autoApprove: boolean;
  active: boolean;
};

function SlotForm({
  centerId,
  initial,
  onDone,
}: {
  centerId: string;
  initial?: SlotRow;
  onDone: () => void;
}) {
  const { t } = useT();
  const toast = useToast();
  const utils = api.useUtils();

  const [day, setDay]             = useState(initial?.dayOfWeek ?? 1);
  const [start, setStart]         = useState(initial?.startTime ?? '10:00');
  const [end, setEnd]             = useState(initial?.endTime ?? '11:00');
  const [capacity, setCapacity]   = useState(initial?.capacity ?? 5);
  const [autoApprove, setAutoApprove] = useState(initial?.autoApprove ?? true);
  const [active, setActive]       = useState(initial?.active ?? true);
  const [errors, setErrors]       = useState<Record<string, string>>({});

  const upsertMut = api.visits.slotConfig.upsert.useMutation({
    onSuccess: async () => {
      await utils.visits.slotConfig.list.invalidate();
      toast.success(t('visits.slots.form.saved'));
      onDone();
    },
    onError: (err) => toast.error(err.message),
  });

  function validate(): boolean {
    const errs: Record<string, string> = {};
    if (!start.match(/^\d{2}:\d{2}$/)) errs.start = 'Formato HH:MM';
    if (!end.match(/^\d{2}:\d{2}$/)) errs.end = 'Formato HH:MM';
    if (start >= end) errs.end = 'La hora fin debe ser posterior a la hora inicio.';
    if (capacity < 1 || capacity > 100) errs.capacity = 'Entre 1 y 100.';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    upsertMut.mutate({
      ...(initial?.id ? { id: initial.id } : {}),
      centerId,
      dayOfWeek:   day,
      startTime:   start,
      endTime:     end,
      capacity,
      autoApprove,
      active,
    });
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
      {/* Día de la semana */}
      <div>
        <Label htmlFor="sf-day">{t('visits.slots.form.day')}</Label>
        <select
          id="sf-day"
          value={day}
          onChange={(e) => setDay(Number(e.target.value))}
          className="min-h-[48px] w-full rounded-2xl border border-brand-200 bg-white px-3 py-2 text-base focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
        >
          {DAYS_OF_WEEK.map((d) => (
            <option key={d} value={d}>
              {t(`visit.weekday.${d}`)}
            </option>
          ))}
        </select>
      </div>

      <div className="flex gap-3">
        {/* Hora inicio */}
        <div className="flex-1">
          <Label htmlFor="sf-start">{t('visits.slots.form.start')}</Label>
          <Input
            id="sf-start"
            type="time"
            value={start}
            onChange={(e) => setStart(e.target.value)}
            aria-describedby={errors.start ? 'sf-start-err' : undefined}
            aria-invalid={Boolean(errors.start)}
            className="min-h-[48px]"
          />
          <FieldError id="sf-start-err">{errors.start}</FieldError>
        </div>
        {/* Hora fin */}
        <div className="flex-1">
          <Label htmlFor="sf-end">{t('visits.slots.form.end')}</Label>
          <Input
            id="sf-end"
            type="time"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
            aria-describedby={errors.end ? 'sf-end-err' : undefined}
            aria-invalid={Boolean(errors.end)}
            className="min-h-[48px]"
          />
          <FieldError id="sf-end-err">{errors.end}</FieldError>
        </div>
      </div>

      {/* Aforo */}
      <div>
        <Label htmlFor="sf-cap">{t('visits.slots.form.capacity')}</Label>
        <Input
          id="sf-cap"
          type="number"
          min={1}
          max={100}
          value={capacity}
          onChange={(e) => setCapacity(Number(e.target.value))}
          aria-describedby={errors.capacity ? 'sf-cap-err' : undefined}
          aria-invalid={Boolean(errors.capacity)}
          className="min-h-[48px]"
        />
        <FieldError id="sf-cap-err">{errors.capacity}</FieldError>
      </div>

      {/* Checkboxes */}
      <div className="flex flex-wrap gap-4">
        <label className="flex min-h-[44px] cursor-pointer items-center gap-2 text-sm font-medium text-[#1A3A3F]">
          <input
            type="checkbox"
            checked={autoApprove}
            onChange={(e) => setAutoApprove(e.target.checked)}
            className="h-5 w-5 rounded border-brand-300 text-brand-700 focus:ring-brand-500"
          />
          {t('visits.slots.form.autoApprove')}
        </label>
        <label className="flex min-h-[44px] cursor-pointer items-center gap-2 text-sm font-medium text-[#1A3A3F]">
          <input
            type="checkbox"
            checked={active}
            onChange={(e) => setActive(e.target.checked)}
            className="h-5 w-5 rounded border-brand-300 text-brand-700 focus:ring-brand-500"
          />
          {t('visits.slots.form.active')}
        </label>
      </div>

      {/* Acciones */}
      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={upsertMut.isPending}
          className="inline-flex min-h-[48px] items-center justify-center rounded-full bg-brand-700 px-5 py-2 text-base font-semibold text-white transition hover:bg-brand-800 disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
        >
          {upsertMut.isPending
            ? t('visits.slots.form.submitting')
            : t('visits.slots.form.submit')}
        </button>
        <button
          type="button"
          onClick={onDone}
          className="inline-flex min-h-[48px] items-center justify-center rounded-full border border-brand-200 bg-white px-5 py-2 text-base font-semibold text-brand-700 transition hover:bg-brand-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
        >
          {t('action.cancel')}
        </button>
      </div>
    </form>
  );
}

export default function FranjasPage() {
  const { t } = useT();
  const toast = useToast();
  const confirm = useConfirm();
  const utils = api.useUtils();

  const centersQ = api.centers.list.useQuery();
  const centers = centersQ.data ?? [];
  const [selectedCenterId, setSelectedCenterId] = useState('');
  const centerId = selectedCenterId || (centers[0]?.id ?? '');

  const slotsQ = api.visits.slotConfig.list.useQuery(
    { centerId },
    { enabled: Boolean(centerId) },
  );
  const slots = (slotsQ.data ?? []) as SlotRow[];

  const [showForm, setShowForm] = useState(false);
  const [editSlot, setEditSlot] = useState<SlotRow | undefined>(undefined);

  const deleteMut = api.visits.slotConfig.delete.useMutation({
    onSuccess: async () => {
      await utils.visits.slotConfig.list.invalidate();
      toast.success(t('visits.slots.form.deactivated'));
    },
    onError: (err) => toast.error(err.message),
  });

  async function handleDeactivate(slot: SlotRow) {
    const result = await confirm({
      title:        t('visits.slots.form.deactivate.title'),
      description:  t('visits.slots.form.deactivate.desc'),
      confirmLabel: t('visits.slots.form.deactivate'),
      tone:         'danger',
    });
    if (!result) return;
    deleteMut.mutate({ id: slot.id });
  }

  function openAdd() {
    setEditSlot(undefined);
    setShowForm(true);
  }

  function openEdit(slot: SlotRow) {
    setEditSlot(slot);
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditSlot(undefined);
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Cabecera */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-[#1A3A3F]">
            {t('visits.slots.title')}
          </h1>
          <p className="mt-1 text-sm text-[#1A3A3F]/60">{t('visits.slots.intro')}</p>
        </div>
        <button
          type="button"
          onClick={openAdd}
          className="inline-flex min-h-[48px] items-center justify-center rounded-full bg-brand-700 px-5 py-2 text-base font-semibold text-white transition hover:bg-brand-800 active:bg-brand-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-1"
        >
          {t('visits.slots.new')}
        </button>
      </div>

      {/* Selector de centro (si hay más de uno) */}
      {centers.length > 1 && (
        <div>
          <label htmlFor="slots-center" className="sr-only">
            {t('visits.staff.center')}
          </label>
          <select
            id="slots-center"
            value={centerId}
            onChange={(e) => setSelectedCenterId(e.target.value)}
            className="min-h-[44px] rounded-2xl border border-brand-200 bg-white px-3 py-2 text-base focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
          >
            {centers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Formulario inline */}
      {showForm && centerId && (
        <Card className="border-2 border-brand-200">
          <CardContent>
            <h2 className="mb-4 font-semibold text-[#1A3A3F]">
              {editSlot ? t('visits.slots.form.edit') : t('visits.slots.new')}
            </h2>
            <SlotForm
              centerId={centerId}
              initial={editSlot}
              onDone={closeForm}
            />
          </CardContent>
        </Card>
      )}

      {/* Lista de franjas */}
      {slotsQ.isLoading ? (
        <div className="flex flex-col gap-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-24 w-full rounded-2xl" />
          ))}
        </div>
      ) : slots.length === 0 ? (
        <EmptyState
          title={t('visits.slots.empty.title')}
          description={t('visits.slots.empty.desc')}
          action={
            <button
              type="button"
              onClick={openAdd}
              className="inline-flex min-h-[48px] items-center justify-center rounded-full bg-brand-700 px-5 py-2 text-base font-semibold text-white transition hover:bg-brand-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-1"
            >
              {t('visits.slots.new')}
            </button>
          }
        />
      ) : (
        // Agrupar por día de la semana
        <div className="flex flex-col gap-6">
          {DAYS_OF_WEEK.map((d) => {
            const daySlots = slots.filter((s) => s.dayOfWeek === d);
            if (daySlots.length === 0) return null;
            return (
              <section key={d} aria-labelledby={`day-heading-${d}`}>
                <h2
                  id={`day-heading-${d}`}
                  className="mb-2 text-base font-semibold text-[#1A3A3F]"
                >
                  {t(`visit.weekday.${d}`)}
                </h2>
                <div className="flex flex-col gap-2">
                  {daySlots.map((slot) => (
                    <Card key={slot.id} className={slot.active ? '' : 'opacity-50'}>
                      <CardContent className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-3">
                          <span className="font-semibold text-[#1A3A3F]">
                            {slot.startTime}–{slot.endTime}
                          </span>
                          <Badge tone="neutral">
                            {t('visits.slots.capacity', { n: slot.capacity })}
                          </Badge>
                          <Badge tone={slot.autoApprove ? 'green' : 'amber'}>
                            {slot.autoApprove
                              ? t('visits.slots.autoApprove.yes')
                              : t('visits.slots.autoApprove.no')}
                          </Badge>
                          <Badge tone={slot.active ? 'green' : 'neutral'}>
                            {slot.active
                              ? t('visits.slots.active')
                              : t('visits.slots.inactive')}
                          </Badge>
                        </div>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => openEdit(slot)}
                            className="inline-flex min-h-[44px] items-center justify-center rounded-full border border-brand-200 px-3 text-sm font-medium text-brand-700 hover:bg-brand-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
                          >
                            {t('visits.slots.form.edit')}
                          </button>
                          {slot.active && (
                            <button
                              type="button"
                              onClick={() => handleDeactivate(slot)}
                              disabled={deleteMut.isPending}
                              className="inline-flex min-h-[44px] items-center justify-center rounded-full border border-red-200 px-3 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-500"
                            >
                              {t('visits.slots.form.deactivate')}
                            </button>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
