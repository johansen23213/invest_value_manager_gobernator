'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Button, Card, CardContent, FieldError, Input, Label, Skeleton } from '@vetlla/ui';
import { api } from '@/trpc/react';
import { useT } from '@/i18n/provider';
import { useToast } from '@/components/toast';
import { formatDateTime } from '@/lib/format';
import { VisitStatusBadge } from '@/components/visit-status-badge';
import type { SlotAvailability } from '@/lib/visits';

// Devuelve la fecha mínima en formato YYYY-MM-DD para el input[type=date]
function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function NuevaVisitaPage() {
  const { t, locale } = useT();
  const toast = useToast();
  const utils = api.useUtils();

  // Residentes vinculados al familiar
  const portalQ = api.family.portal.useQuery();
  const residents = portalQ.data ?? [];

  // Estado del formulario
  const [residentId, setResidentId] = useState('');
  const [date, setDate] = useState('');
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null); // "HH:MM"
  const [visitors, setVisitors] = useState<string[]>(['']);
  const [notes, setNotes] = useState('');

  // Errores inline
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Residente seleccionado (para obtener centerId)
  const activeResidentId = residentId || (residents[0]?.id ?? '');
  const activeResident = residents.find((r) => r.id === activeResidentId) ?? residents[0];
  const centerId = activeResident?.center?.id ?? '';

  // Disponibilidad de franjas
  const availabilityQ = api.visits.availability.useQuery(
    { centerId, date },
    { enabled: Boolean(centerId) && Boolean(date) },
  );
  const slots: SlotAvailability[] = availabilityQ.data ?? [];

  // Resetear franja al cambiar fecha o residente
  function onDateChange(val: string) {
    setDate(val);
    setSelectedSlot(null);
  }
  function onResidentChange(val: string) {
    setResidentId(val);
    setSelectedSlot(null);
    setDate('');
  }

  // Visitantes dinámicos (1–6)
  function addVisitor() {
    if (visitors.length < 6) setVisitors((prev) => [...prev, '']);
  }
  function removeVisitor(idx: number) {
    setVisitors((prev) => prev.filter((_, i) => i !== idx));
  }
  function updateVisitor(idx: number, val: string) {
    setVisitors((prev) => prev.map((v, i) => (i === idx ? val : v)));
  }

  // Estado de visita creada con código (feedback post-submit)
  const [createdVisit, setCreatedVisit] = useState<{
    qrCode: string | null;
    status: string;
    scheduledAt: Date;
  } | null>(null);

  const requestMut = api.visits.request.useMutation({
    onSuccess: async (visit) => {
      await utils.visits.listMine.invalidate();
      setCreatedVisit({
        qrCode: visit.qrCode,
        status: visit.status,
        scheduledAt: visit.scheduledAt,
      });
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  function validate(): boolean {
    const errs: Record<string, string> = {};
    if (!activeResidentId) errs.residentId = 'Campo obligatorio.';
    if (!date) errs.date = 'Campo obligatorio.';
    if (!selectedSlot) errs.slot = 'Selecciona una franja horaria.';
    const trimmed = visitors.map((v) => v.trim()).filter(Boolean);
    if (trimmed.length === 0) errs.visitors = 'Añade al menos un visitante.';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!validate()) return;

    // scheduledAt = fecha + hora de inicio de la franja, en UTC (la convención del backend)
    const scheduledAt = new Date(`${date}T${selectedSlot!}:00Z`).toISOString();
    const trimmedVisitors = visitors.map((v) => v.trim()).filter(Boolean);

    requestMut.mutate({
      residentId:   activeResidentId,
      scheduledAt,
      visitorNames: trimmedVisitors,
      notes:        notes.trim() || undefined,
    });
  }

  // --- Pantalla de éxito ---
  if (createdVisit) {
    const confirmed = createdVisit.status === 'CONFIRMADA';
    return (
      <div className="flex flex-col gap-6">
        <div>
          <Link
            href="/portal/visitas"
            className="text-sm text-brand-700 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
          >
            {t('visits.form.back')}
          </Link>
        </div>
        <Card className={`border-2 ${confirmed ? 'border-green-300' : 'border-brand-200'}`}>
          <CardContent className="flex flex-col items-center gap-4 py-8 text-center">
            <VisitStatusBadge status={createdVisit.status as Parameters<typeof VisitStatusBadge>[0]['status']} />
            <p className="text-lg font-semibold text-[#1A3A3F]">
              {confirmed
                ? t('visits.form.successConfirmed')
                : t('visits.form.successPending')}
            </p>
            {/* Código en grande si confirmada */}
            {confirmed && createdVisit.qrCode && (
              <div className="flex flex-col items-center gap-1 rounded-2xl bg-brand-50 px-8 py-6">
                <p className="text-xs font-medium uppercase tracking-widest text-brand-600">
                  {t('visits.portal.codeLabel')}
                </p>
                <p
                  className="select-all font-mono text-4xl font-extrabold tracking-[0.25em] text-[#1A3A3F]"
                  aria-label={`${t('visits.portal.codeLabel')}: ${createdVisit.qrCode}`}
                >
                  {createdVisit.qrCode}
                </p>
                <p className="mt-1 text-xs text-brand-600">{t('visits.portal.presentNote')}</p>
              </div>
            )}
            <p className="text-sm text-[#1A3A3F]/60">
              {formatDateTime(locale, createdVisit.scheduledAt)}
            </p>
            <Link
              href="/portal/visitas"
              className="mt-2 inline-flex min-h-[48px] items-center justify-center rounded-full bg-brand-700 px-6 py-2 text-base font-semibold text-white transition hover:bg-brand-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-1"
            >
              {t('visits.portal.title')}
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  // --- Formulario ---
  return (
    <div className="flex flex-col gap-6">
      {/* Cabecera */}
      <div>
        <Link
          href="/portal/visitas"
          className="text-sm text-brand-700 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
        >
          {t('visits.form.back')}
        </Link>
        <h1 className="mt-2 text-2xl font-extrabold tracking-tight text-[#1A3A3F]">
          {t('visits.form.title')}
        </h1>
      </div>

      <Card>
        <CardContent>
          <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">

            {/* Residente (si hay más de uno) */}
            {residents.length > 1 && (
              <div>
                <Label htmlFor="nv-resident">{t('visits.form.resident')}</Label>
                <select
                  id="nv-resident"
                  value={activeResidentId}
                  onChange={(e) => onResidentChange(e.target.value)}
                  aria-describedby={errors.residentId ? 'nv-resident-err' : undefined}
                  aria-invalid={Boolean(errors.residentId)}
                  className="min-h-[48px] w-full rounded-2xl border border-brand-200 bg-white px-3 py-2 text-base focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
                >
                  {residents.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.firstName} {r.lastName}
                    </option>
                  ))}
                </select>
                <FieldError id="nv-resident-err">{errors.residentId}</FieldError>
              </div>
            )}
            {residents.length === 1 && (
              <input type="hidden" name="residentId" value={residents[0]!.id} />
            )}

            {/* Fecha */}
            <div>
              <Label htmlFor="nv-date">{t('visits.form.date')}</Label>
              <Input
                id="nv-date"
                type="date"
                min={todayISO()}
                value={date}
                onChange={(e) => onDateChange(e.target.value)}
                required
                aria-describedby={errors.date ? 'nv-date-err' : undefined}
                aria-invalid={Boolean(errors.date)}
                className="min-h-[48px]"
              />
              <FieldError id="nv-date-err">{errors.date}</FieldError>
            </div>

            {/* Franjas horarias */}
            <div>
              <Label htmlFor="nv-slots-group">{t('visits.form.slot')}</Label>
              {!date && (
                <p className="mt-1 text-sm text-[#1A3A3F]/60">{t('visits.form.slotHint')}</p>
              )}
              {date && availabilityQ.isLoading && (
                <div className="mt-2 flex flex-col gap-2">
                  {[0, 1, 2].map((i) => (
                    <Skeleton key={i} className="h-14 w-full rounded-2xl" />
                  ))}
                </div>
              )}
              {date && !availabilityQ.isLoading && slots.length === 0 && (
                <p className="mt-1 text-sm text-[#1A3A3F]/60">{t('visits.form.slotEmpty')}</p>
              )}
              {date && !availabilityQ.isLoading && slots.length > 0 && (
                <div
                  id="nv-slots-group"
                  role="group"
                  aria-label={t('visits.form.slot')}
                  aria-describedby={errors.slot ? 'nv-slot-err' : undefined}
                  className="mt-2 flex flex-col gap-2"
                >
                  {slots.map((slot) => {
                    const isSelected = selectedSlot === slot.startTime;
                    const isFull = slot.available === 0;
                    return (
                      <button
                        key={slot.slotConfigId}
                        type="button"
                        disabled={isFull}
                        onClick={() => !isFull && setSelectedSlot(slot.startTime)}
                        aria-pressed={isSelected}
                        className={`flex min-h-[48px] w-full items-center justify-between rounded-2xl border px-5 py-3 text-left transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 ${
                          isSelected
                            ? 'border-brand-700 bg-brand-700 text-white'
                            : isFull
                            ? 'border-brand-100 bg-brand-50 text-[#1A3A3F]/40 cursor-not-allowed'
                            : 'border-brand-200 bg-white text-[#1A3A3F] hover:border-brand-400 hover:bg-brand-50'
                        }`}
                      >
                        <span className="font-semibold">
                          {slot.startTime}–{slot.endTime}
                        </span>
                        <span className={`text-sm ${isSelected ? 'text-white/80' : isFull ? 'text-[#1A3A3F]/40' : 'text-[#1A3A3F]/60'}`}>
                          {isFull
                            ? t('visits.form.slotFull')
                            : t('visits.form.slotPlaces', { n: slot.available })}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
              <FieldError id="nv-slot-err">{errors.slot}</FieldError>
            </div>

            {/* Visitantes */}
            <div>
              <fieldset>
                <legend className="mb-2 text-sm font-medium text-[#1A3A3F]">
                  {t('visits.form.visitors')}
                </legend>
                <div className="flex flex-col gap-2">
                  {visitors.map((v, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <Input
                        id={`nv-visitor-${idx}`}
                        value={v}
                        placeholder={t('visits.form.visitorPh')}
                        onChange={(e) => updateVisitor(idx, e.target.value)}
                        aria-label={t('visits.form.visitor', { n: idx + 1 })}
                        className="min-h-[48px] flex-1"
                      />
                      {visitors.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeVisitor(idx)}
                          aria-label={t('visits.form.removeVisitor', { n: idx + 1 })}
                          className="flex h-[48px] w-[48px] shrink-0 items-center justify-center rounded-full border border-brand-200 text-[#1A3A3F]/60 hover:border-red-300 hover:text-red-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
                        >
                          ×
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                <FieldError id="nv-visitors-err">{errors.visitors}</FieldError>
                {visitors.length < 6 && (
                  <button
                    type="button"
                    onClick={addVisitor}
                    className="mt-2 text-sm font-medium text-brand-700 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 min-h-[44px] flex items-center"
                  >
                    + {t('visits.form.addVisitor')}
                  </button>
                )}
              </fieldset>
            </div>

            {/* Notas */}
            <div>
              <Label htmlFor="nv-notes">{t('visits.form.notes')}</Label>
              <textarea
                id="nv-notes"
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={t('visits.form.notesPh')}
                maxLength={500}
                className="min-h-[48px] w-full rounded-2xl border border-brand-200 px-3 py-2 text-base focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30 resize-y"
              />
            </div>

            {/* Acciones */}
            <div className="flex flex-wrap items-center justify-end gap-3">
              <Link
                href="/portal/visitas"
                className="inline-flex min-h-[48px] items-center justify-center rounded-full border border-brand-200 bg-white px-5 py-2 text-base font-semibold text-brand-700 transition hover:bg-brand-50 active:bg-brand-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-1"
              >
                {t('action.cancel')}
              </Link>
              <Button
                type="submit"
                disabled={requestMut.isPending || portalQ.isLoading}
              >
                {requestMut.isPending
                  ? t('visits.form.submitting')
                  : t('visits.form.submit')}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
