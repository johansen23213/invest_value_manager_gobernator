'use client';

/**
 * Traspaso de turno — pantalla de lectura rápida para el equipo entrante.
 * Épica A — RF-PRO-008/009.
 * Épica D — RF-PRO-010/013: cierre de turno firmado + traspaso recibido.
 *
 * Permiso: care:read (AUXILIAR + SANITARIO + DIRECTOR).
 * Cierre de turno (Firmar): care:write.
 *
 * Flujo:
 *   1. El usuario selecciona turno (preselección = currentShift) y fecha.
 *   2. Si el tenant tiene más de un centro, elige centro; si tiene varios,
 *      elige también unidad (opcional).
 *   3. Se muestra el traspaso recibido del turno anterior (handover anterior).
 *   4. Se muestra la lista de residentes con sus notas del turno.
 *      - Residentes con categoría INCIDENCIA se destacan visualmente.
 *      - Residentes sin notas muestran estado vacío amable.
 *   5. Si care:write, botón "Cerrar turno": abre el cierre pre-relleno con
 *      incidencias del turno y el hint de medicaciones. Al firmar: closedById+closedAt.
 *   6. Si el turno ya está cerrado: muestra el cierre en modo lectura.
 *
 * Ruta: /relevo
 */

import { useState, useEffect } from 'react';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogTitle,
  Label,
  PageHeader,
  Select,
} from '@vetlla/ui';
import { api } from '@/trpc/react';
import { useT } from '@/i18n/provider';
import { useToast } from '@/components/toast';
import { formatDate, formatTime } from '@/lib/format';
import { currentShift, type Shift } from '@/lib/mar';
import {
  NURSING_NOTE_SHIFT_LABELS,
  NURSING_NOTE_CATEGORY_LABELS,
} from '@/lib/labels';

// ---------------------------------------------------------------------------
// Colores semánticos
// ---------------------------------------------------------------------------

const SHIFT_CHIP_TONE: Record<string, 'blue' | 'amber' | 'neutral'> = {
  MANANA: 'blue',
  TARDE:  'amber',
  NOCHE:  'neutral',
};

const CATEGORY_CHIP_TONE: Record<string, 'red' | 'amber' | 'neutral' | 'green' | 'blue'> = {
  INCIDENCIA:   'red',
  DOLOR:        'amber',
  CURA:         'blue',
  ALIMENTACION: 'green',
  SUENO:        'neutral',
  CONDUCTA:     'neutral',
  GENERAL:      'neutral',
};

// ---------------------------------------------------------------------------
// Icono de alerta (decorativo) — incidencias destacadas
// ---------------------------------------------------------------------------
function IconAlert({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      className={className}
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12" y2="17.01" />
    </svg>
  );
}

function IconSignature({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      className={className}
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 17h4l9-9-4-4-9 9v4z" />
      <line x1="14" y1="4" x2="20" y2="10" />
      <line x1="3" y1="21" x2="21" y2="21" />
    </svg>
  );
}

function IconCheck({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      className={className}
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Panel: traspaso recibido del turno anterior
// ---------------------------------------------------------------------------

type PreviousHandoverPanelProps = {
  centerId: string;
  date: string;
  shift: Shift;
  unitId: string | undefined;
};

/**
 * Calcula el turno ANTERIOR al dado para mostrar el traspaso que recibe el
 * equipo entrante. El equipo entrante de MANANA lee el cierre de NOCHE;
 * el de TARDE lee el de MANANA; el de NOCHE lee el de TARDE.
 */
function previousShift(shift: Shift): Shift {
  if (shift === 'MANANA') return 'NOCHE';
  if (shift === 'TARDE')  return 'MANANA';
  return 'TARDE';
}

/**
 * Cuando el turno anterior es NOCHE y el turno actual es MANANA,
 * el cierre de NOCHE es del día anterior.
 */
function previousShiftDate(date: string, shift: Shift): Date {
  const d = new Date(date);
  if (shift === 'MANANA') {
    d.setDate(d.getDate() - 1);
  }
  return d;
}

function PreviousHandoverPanel({ centerId, date, shift, unitId }: PreviousHandoverPanelProps) {
  const { t, locale } = useT();
  const prevShift = previousShift(shift);
  const prevDate  = previousShiftDate(date, shift);

  const handoverQuery = api.shifts.handover.getForShift.useQuery(
    { centerId, date: prevDate, shift: prevShift, unitId },
    { enabled: Boolean(centerId) },
  );

  const handover = handoverQuery.data;

  if (handoverQuery.isLoading) {
    return (
      <Card className="border-brand-200">
        <CardContent>
          <p className="text-sm text-[#1A3A3F]/60">{t('state.loading')}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <section aria-labelledby="previous-handover-heading">
      <Card className="border-l-4 border-l-brand-500">
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle id="previous-handover-heading">
              {t('handover.received.title')}
            </CardTitle>
            <Badge tone={SHIFT_CHIP_TONE[prevShift] ?? 'neutral'}>
              {NURSING_NOTE_SHIFT_LABELS[prevShift] ?? prevShift}
            </Badge>
            <Badge tone="neutral">{formatDate(locale, prevDate)}</Badge>
          </div>
        </CardHeader>
        <CardContent>
          {!handover ? (
            <p className="text-sm italic text-[#1A3A3F]/50">{t('handover.received.none')}</p>
          ) : (
            <div className="flex flex-col gap-4">
              {/* Firma */}
              <div className="flex flex-wrap items-center gap-2">
                <IconCheck className="text-green-600" />
                <span className="text-sm font-semibold text-[#1A3A3F]">
                  {t('handover.received.signedBy', { name: handover.closedBy?.name ?? '—' })}
                  {handover.closedAt
                    ? ` ${t('handover.received.at', { time: formatTime(locale, handover.closedAt) })}`
                    : ''}
                </span>
              </div>

              {/* Resumen */}
              <div>
                <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-[#1A3A3F]/40">
                  {t('handover.received.summary')}
                </p>
                <p className="whitespace-pre-wrap text-sm text-[#1A3A3F]">{handover.summary}</p>
              </div>

              {/* Incidencias */}
              {handover.incidentsSummary && (
                <div>
                  <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-[#1A3A3F]/40">
                    {t('handover.received.incidents')}
                  </p>
                  <p className="whitespace-pre-wrap text-sm text-warm-700">{handover.incidentsSummary}</p>
                </div>
              )}

              {/* Pendientes */}
              {handover.pendingTasks && (
                <div>
                  <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-[#1A3A3F]/40">
                    {t('handover.received.pending')}
                  </p>
                  <p className="whitespace-pre-wrap text-sm text-amber-800">{handover.pendingTasks}</p>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Panel: cierre de turno actual (lectura o acción de firmar)
// ---------------------------------------------------------------------------

type HandoverCloseProps = {
  centerId: string;
  date: string;
  shift: Shift;
  unitId: string | undefined;
  canWrite: boolean;
  onHandoverChange: () => void;
};

function HandoverClosePanel({
  centerId,
  date,
  shift,
  unitId,
  canWrite,
  onHandoverChange,
}: HandoverCloseProps) {
  const { t, locale } = useT();
  const { success: toastSuccess, error: toastError } = useToast();

  const [open, setOpen] = useState(false);
  const [summary, setSummary] = useState('');
  const [incidentsSummary, setIncidentsSummary] = useState('');
  const [pendingTasks, setPendingTasks] = useState('');
  const [summaryError, setSummaryError] = useState('');

  // Cargar el cierre existente
  const closedQuery = api.shifts.handover.getForShift.useQuery(
    { centerId, date: new Date(date), shift, unitId },
    { enabled: Boolean(centerId) },
  );

  // Cargar el draft al abrir el modal
  const draftQuery = api.shifts.handover.draft.useQuery(
    { centerId, date: new Date(date), shift, unitId },
    { enabled: open && Boolean(centerId) },
  );

  // Cuando llega el draft, pre-rellenar
  useEffect(() => {
    if (!open) return;
    const existing = draftQuery.data?.existingHandover;
    if (existing) {
      setSummary(existing.summary ?? '');
      setIncidentsSummary(existing.incidentsSummary ?? '');
      setPendingTasks(existing.pendingTasks ?? '');
    }
  }, [draftQuery.data, open]);

  const closeMutation = api.shifts.handover.close.useMutation({
    onSuccess: () => {
      toastSuccess(t('handover.close.signed'));
      setOpen(false);
      void closedQuery.refetch();
      onHandoverChange();
    },
    onError: () => {
      toastError(t('handover.close.error'));
    },
  });

  function handleOpen() {
    setSummary('');
    setIncidentsSummary('');
    setPendingTasks('');
    setSummaryError('');
    setOpen(true);
  }

  function handleSign(e: React.FormEvent) {
    e.preventDefault();
    setSummaryError('');
    if (!summary.trim()) {
      setSummaryError(t('handover.close.required.summary'));
      return;
    }
    closeMutation.mutate({
      centerId,
      date: new Date(date),
      shift,
      unitId,
      summary: summary.trim(),
      incidentsSummary: incidentsSummary.trim() || undefined,
      pendingTasks: pendingTasks.trim() || undefined,
    });
  }

  const closed = closedQuery.data;
  const draft  = draftQuery.data;

  if (closedQuery.isLoading) {
    return null;
  }

  // MODO LECTURA: turno ya cerrado
  if (closed) {
    return (
      <section aria-labelledby="current-handover-heading">
        <Card className="border-l-4 border-l-green-500">
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <IconCheck className="text-green-600" />
                <CardTitle id="current-handover-heading">
                  {t('handover.closed.title')}
                </CardTitle>
              </div>
              {canWrite && (
                <Button size="sm" variant="secondary" onClick={handleOpen}>
                  {t('handover.closed.edit')}
                </Button>
              )}
            </div>
            <p className="mt-1 text-sm text-green-700">
              {t('handover.closed.signedBy', { name: closed.closedBy?.name ?? '—' })}
              {closed.closedAt
                ? ` ${t('handover.closed.at', {
                    time: formatTime(locale, closed.closedAt),
                    date: formatDate(locale, closed.closedAt),
                  })}`
                : ''}
            </p>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-4">
              <div>
                <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-[#1A3A3F]/40">
                  {t('handover.received.summary')}
                </p>
                <p className="whitespace-pre-wrap text-sm text-[#1A3A3F]">{closed.summary}</p>
              </div>
              {closed.incidentsSummary && (
                <div>
                  <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-[#1A3A3F]/40">
                    {t('handover.received.incidents')}
                  </p>
                  <p className="whitespace-pre-wrap text-sm text-warm-700">{closed.incidentsSummary}</p>
                </div>
              )}
              {closed.pendingTasks && (
                <div>
                  <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-[#1A3A3F]/40">
                    {t('handover.received.pending')}
                  </p>
                  <p className="whitespace-pre-wrap text-sm text-amber-800">{closed.pendingTasks}</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Dialog de reedición */}
        {open && (
          <HandoverCloseDialog
            open={open}
            onClose={() => setOpen(false)}
            draft={draft ?? null}
            summary={summary}
            setSummary={setSummary}
            incidentsSummary={incidentsSummary}
            setIncidentsSummary={setIncidentsSummary}
            pendingTasks={pendingTasks}
            setPendingTasks={setPendingTasks}
            summaryError={summaryError}
            onSign={handleSign}
            isPending={closeMutation.isPending}
            t={t}
          />
        )}
      </section>
    );
  }

  // MODO ACCIÓN: botón de cerrar turno
  if (!canWrite) return null;

  return (
    <>
      <div className="flex justify-end">
        <Button size="lg" onClick={handleOpen}>
          <IconSignature className="mr-2" />
          {t('handover.close.button')}
        </Button>
      </div>

      {open && (
        <HandoverCloseDialog
          open={open}
          onClose={() => setOpen(false)}
          draft={draft ?? null}
          summary={summary}
          setSummary={setSummary}
          incidentsSummary={incidentsSummary}
          setIncidentsSummary={setIncidentsSummary}
          pendingTasks={pendingTasks}
          setPendingTasks={setPendingTasks}
          summaryError={summaryError}
          onSign={handleSign}
          isPending={closeMutation.isPending}
          t={t}
        />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Dialog del cierre de turno
// ---------------------------------------------------------------------------

type IncidentNote = {
  id: string;
  body: string;
  resident?: { firstName: string; lastName: string } | null;
  author?: { name: string | null; jobTitle: string | null } | null;
};

type HandoverCloseDialogProps = {
  open: boolean;
  onClose: () => void;
  draft: {
    incidentNotes: IncidentNote[];
    existingHandover: unknown;
    medHint: string;
  } | null;
  summary: string;
  setSummary: (v: string) => void;
  incidentsSummary: string;
  setIncidentsSummary: (v: string) => void;
  pendingTasks: string;
  setPendingTasks: (v: string) => void;
  summaryError: string;
  onSign: (e: React.FormEvent) => void;
  isPending: boolean;
  t: (key: string, vars?: Record<string, string | number>) => string;
};

function HandoverCloseDialog({
  open,
  onClose,
  draft,
  summary,
  setSummary,
  incidentsSummary,
  setIncidentsSummary,
  pendingTasks,
  setPendingTasks,
  summaryError,
  onSign,
  isPending,
  t,
}: HandoverCloseDialogProps) {
  const incidentNotes = draft?.incidentNotes ?? [];

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        aria-describedby="handover-close-desc"
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto"
      >
        <DialogTitle>{t('handover.close.title')}</DialogTitle>
        <p id="handover-close-desc" className="mt-1 text-sm text-[#1A3A3F]/60">
          {t('handover.close.intro')}
        </p>

        {/* Hint de medicaciones */}
        <div className="mt-4 rounded-2xl bg-brand-50 px-4 py-3 text-sm text-brand-700">
          <span className="font-semibold">{t('handover.close.medHint')}: </span>
          {t('handover.close.medHintDesc')}
        </div>

        {/* Incidencias del turno */}
        <div className="mt-4">
          <h3 className="mb-2 text-sm font-semibold text-[#1A3A3F]">
            {t('handover.close.incidents.title')}
          </h3>
          {incidentNotes.length === 0 ? (
            <p className="text-sm italic text-[#1A3A3F]/50">
              {t('handover.close.incidents.empty')}
            </p>
          ) : (
            <ul role="list" className="flex flex-col gap-2">
              {incidentNotes.map((note) => (
                <li
                  key={note.id}
                  className="rounded-xl border border-warm-200 bg-warm-50 px-3 py-2"
                >
                  {note.resident && (
                    <p className="mb-0.5 text-xs font-semibold text-warm-700">
                      {note.resident.firstName} {note.resident.lastName}
                    </p>
                  )}
                  <p className="text-sm text-[#1A3A3F]">{note.body}</p>
                  {note.author?.name && (
                    <p className="mt-0.5 text-xs text-[#1A3A3F]/40">
                      {note.author.name}
                      {note.author.jobTitle ? ` · ${note.author.jobTitle}` : ''}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Formulario */}
        <form onSubmit={onSign} className="mt-6 flex flex-col gap-4" noValidate>
          {/* Resumen obligatorio */}
          <div>
            <Label htmlFor="handover-summary">
              {t('handover.close.field.summary')}
              <span className="ml-1 text-red-500" aria-hidden="true">*</span>
            </Label>
            <textarea
              id="handover-summary"
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder={t('handover.close.field.summaryPh')}
              rows={4}
              required
              aria-required="true"
              aria-invalid={Boolean(summaryError)}
              aria-describedby={summaryError ? 'handover-summary-err' : undefined}
              className="min-h-touch w-full rounded-2xl border border-brand-200 px-3 py-2 text-base focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
              maxLength={20000}
            />
            {summaryError && (
              <p id="handover-summary-err" role="alert" className="mt-1 text-sm text-red-600">
                {summaryError}
              </p>
            )}
          </div>

          {/* Incidencias (opcional) */}
          <div>
            <Label htmlFor="handover-incidents">{t('handover.close.field.incidents')}</Label>
            <textarea
              id="handover-incidents"
              value={incidentsSummary}
              onChange={(e) => setIncidentsSummary(e.target.value)}
              placeholder={t('handover.close.field.incidentsPh')}
              rows={3}
              className="min-h-touch w-full rounded-2xl border border-brand-200 px-3 py-2 text-base focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
              maxLength={10000}
            />
          </div>

          {/* Pendientes (opcional) */}
          <div>
            <Label htmlFor="handover-pending">{t('handover.close.field.pending')}</Label>
            <textarea
              id="handover-pending"
              value={pendingTasks}
              onChange={(e) => setPendingTasks(e.target.value)}
              placeholder={t('handover.close.field.pendingPh')}
              rows={3}
              className="min-h-touch w-full rounded-2xl border border-brand-200 px-3 py-2 text-base focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
              maxLength={10000}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="secondary" onClick={onClose}>
              {t('action.cancel')}
            </Button>
            <Button type="submit" disabled={isPending}>
              <IconSignature className="mr-2" />
              {isPending ? t('handover.close.signing') : t('handover.close.sign')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Componente principal
// ---------------------------------------------------------------------------

export default function RelevoPage() {
  const { locale } = useT();
  const today = new Date().toISOString().split('T')[0]!;

  // Controles del filtro
  const [selectedDate, setSelectedDate] = useState(today);
  const [selectedShift, setSelectedShift] = useState<Shift>(currentShift(new Date()));
  const [selectedCenterId, setSelectedCenterId] = useState<string>('');
  const [selectedUnitId, setSelectedUnitId] = useState<string>('');

  // handoverKey fuerza re-fetch del panel de traspaso recibido si se firma
  const [handoverKey, setHandoverKey] = useState(0);

  // Cargar centros del tenant
  const centersQuery = api.centers.list.useQuery();

  // Pre-seleccionar el primer centro cuando carguen
  useEffect(() => {
    const data = centersQuery.data;
    if (data && data.length > 0 && !selectedCenterId) {
      setSelectedCenterId(data[0]!.id);
    }
  }, [centersQuery.data, selectedCenterId]);

  // Cargar unidades del centro seleccionado
  const centerDetailQuery = api.centers.get.useQuery(
    { id: selectedCenterId },
    { enabled: Boolean(selectedCenterId) },
  );

  // Permisos del usuario
  const meQuery = api.me.useQuery();
  const canWrite = meQuery.data?.permissions.includes('care:write') ?? false;

  // Cargar el traspaso de turno (notas de enfermería)
  const handoverQuery = api.clinicalNotes.nursing.listForShiftHandover.useQuery(
    {
      centerId: selectedCenterId,
      unitId: selectedUnitId || undefined,
      shift: selectedShift,
      noteDate: new Date(selectedDate),
    },
    { enabled: Boolean(selectedCenterId) },
  );

  const fmtDate = (d: Date | string | null | undefined) => formatDate(locale, d);

  const centers = centersQuery.data ?? [];
  const units = centerDetailQuery.data?.units ?? [];
  const handover = handoverQuery.data ?? [];

  // Estadísticas: residentes con incidencia
  const withIncidencia = handover.filter((item) =>
    item.notes.some((n) => n.category === 'INCIDENCIA'),
  );

  // Estado: ningún centro disponible
  if (centersQuery.isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <p className="text-sm text-[#1A3A3F]/60">Cargando centros…</p>
      </div>
    );
  }

  if (centers.length === 0) {
    return (
      <div className="flex items-center justify-center py-16">
        <p className="text-sm text-[#1A3A3F]/60">No hay centros disponibles.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Cabecera */}
      <PageHeader
        title="Traspaso de turno"
        subtitle="Notas del turno para el equipo entrante. Escanea de un vistazo."
      />

      {/* Controles de filtro */}
      <Card>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {/* Turno */}
            <div>
              <Label htmlFor="relevo-shift">Turno</Label>
              <Select
                id="relevo-shift"
                value={selectedShift}
                onChange={(e) => setSelectedShift(e.target.value as Shift)}
              >
                {Object.entries(NURSING_NOTE_SHIFT_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </Select>
            </div>

            {/* Fecha */}
            <div>
              <Label htmlFor="relevo-date">Fecha</Label>
              <input
                id="relevo-date"
                type="date"
                max={today}
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="flex min-h-[48px] w-full rounded-2xl border border-brand-200 bg-white px-3 py-2 text-[#1A3A3F] focus:outline-none focus:ring-2 focus:ring-brand-500/30"
              />
            </div>

            {/* Centro (visible si hay más de uno) */}
            {centers.length > 1 && (
              <div>
                <Label htmlFor="relevo-center">Centro</Label>
                <Select
                  id="relevo-center"
                  value={selectedCenterId}
                  onChange={(e) => {
                    setSelectedCenterId(e.target.value);
                    setSelectedUnitId('');
                  }}
                >
                  {centers.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </Select>
              </div>
            )}

            {/* Unidad */}
            {units.length > 0 && (
              <div>
                <Label htmlFor="relevo-unit">Unidad</Label>
                <Select
                  id="relevo-unit"
                  value={selectedUnitId}
                  onChange={(e) => setSelectedUnitId(e.target.value)}
                >
                  <option value="">Todas las unidades</option>
                  {units.map((u) => (
                    <option key={u.id} value={u.id}>{u.name}</option>
                  ))}
                </Select>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ──────────────────────────────────────────────────────────────────
          Bloque Épica D: Traspaso del turno anterior + Cierre de turno
      ────────────────────────────────────────────────────────────────── */}
      {selectedCenterId && (
        <>
          {/* Traspaso recibido del turno anterior — prominente, arriba */}
          <PreviousHandoverPanel
            key={`prev-${handoverKey}-${selectedCenterId}-${selectedDate}-${selectedShift}-${selectedUnitId}`}
            centerId={selectedCenterId}
            date={selectedDate}
            shift={selectedShift}
            unitId={selectedUnitId || undefined}
          />

          {/* Cierre del turno actual (firmar / lectura) */}
          <HandoverClosePanel
            key={`close-${handoverKey}-${selectedCenterId}-${selectedDate}-${selectedShift}-${selectedUnitId}`}
            centerId={selectedCenterId}
            date={selectedDate}
            shift={selectedShift}
            unitId={selectedUnitId || undefined}
            canWrite={canWrite}
            onHandoverChange={() => setHandoverKey((k) => k + 1)}
          />
        </>
      )}

      {/* ──────────────────────────────────────────────────────────────────
          Bloque original: Notas del turno por residente
      ────────────────────────────────────────────────────────────────── */}

      {/* Resumen rápido del turno */}
      {!handoverQuery.isLoading && handover.length > 0 && (
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm font-semibold text-[#1A3A3F]">
            {handover.length} {handover.length === 1 ? 'residente' : 'residentes'}
          </span>
          <Badge tone={SHIFT_CHIP_TONE[selectedShift] ?? 'neutral'}>
            {NURSING_NOTE_SHIFT_LABELS[selectedShift] ?? selectedShift}
          </Badge>
          {withIncidencia.length > 0 && (
            <span
              className="inline-flex items-center gap-1 rounded-full bg-warm-50 px-3 py-1 text-sm font-semibold text-warm-700"
              role="status"
              aria-live="polite"
            >
              <IconAlert className="text-warm-500" />
              {withIncidencia.length} {withIncidencia.length === 1 ? 'residente con incidencia' : 'residentes con incidencias'}
            </span>
          )}
        </div>
      )}

      {/* Estado de carga */}
      {handoverQuery.isLoading && (
        <div className="flex items-center justify-center py-16">
          <p className="text-sm text-[#1A3A3F]/60">Cargando traspaso…</p>
        </div>
      )}

      {/* Estado vacío */}
      {!handoverQuery.isLoading && handover.length === 0 && selectedCenterId && (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-brand-100 bg-brand-50 py-16 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-100">
            <svg aria-hidden="true" className="h-7 w-7 text-brand-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25z" />
            </svg>
          </div>
          <p className="text-base font-semibold text-[#1A3A3F]">Sin notas en este turno</p>
          <p className="max-w-sm text-sm text-[#1A3A3F]/60">
            No hay notas de enfermería registradas para este turno y fecha.
          </p>
        </div>
      )}

      {/* Lista de residentes con sus notas */}
      {!handoverQuery.isLoading && handover.length > 0 && (
        <ul
          className="flex flex-col gap-4"
          role="list"
          aria-label={`Traspaso de turno ${NURSING_NOTE_SHIFT_LABELS[selectedShift] ?? selectedShift} — ${fmtDate(selectedDate)}`}
        >
          {handover.map(({ resident, notes }) => {
            const hasIncidencia = notes.some((n) => n.category === 'INCIDENCIA');
            const hasNotes = notes.length > 0;

            return (
              <li key={resident.id}>
                <article
                  className={`rounded-2xl border p-4 transition-shadow ${
                    hasIncidencia
                      ? 'border-warm-200 bg-warm-50 shadow-sm'
                      : 'border-brand-100 bg-white'
                  }`}
                  aria-label={`${resident.firstName} ${resident.lastName}${hasIncidencia ? ' — con incidencia' : ''}`}
                >
                  {/* Cabecera del residente */}
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      {hasIncidencia && (
                        <span aria-hidden="true">
                          <IconAlert className="h-4 w-4 text-warm-500" />
                        </span>
                      )}
                      <h2 className="text-base font-semibold text-[#1A3A3F]">
                        {resident.firstName} {resident.lastName}
                      </h2>
                      {resident.bed && (
                        <span className="text-xs text-[#1A3A3F]/50">
                          Plaza {resident.bed.code}
                        </span>
                      )}
                    </div>
                    {hasIncidencia && (
                      <Badge tone="red">
                        Incidencia
                      </Badge>
                    )}
                  </div>

                  {/* Notas del turno */}
                  {!hasNotes ? (
                    <p className="text-sm italic text-[#1A3A3F]/40">Sin notas en este turno.</p>
                  ) : (
                    <ul className="flex flex-col gap-3" role="list" aria-label={`Notas de ${resident.firstName} ${resident.lastName}`}>
                      {notes.map((note) => (
                        <li
                          key={note.id}
                          className={`rounded-xl border p-3 ${
                            note.category === 'INCIDENCIA'
                              ? 'border-warm-200 bg-white'
                              : 'border-brand-100 bg-brand-50'
                          }`}
                        >
                          <div className="mb-1.5 flex flex-wrap items-center gap-2">
                            <Badge tone={CATEGORY_CHIP_TONE[note.category ?? 'GENERAL'] ?? 'neutral'}>
                              {NURSING_NOTE_CATEGORY_LABELS[note.category ?? 'GENERAL'] ?? note.category}
                            </Badge>
                            <span className="text-xs text-[#1A3A3F]/40">
                              {fmtDate(note.noteDate)}
                            </span>
                            {note.author?.name && (
                              <span className="text-xs text-[#1A3A3F]/40">
                                · {note.author.name}
                                {note.author.jobTitle ? ` · ${note.author.jobTitle}` : ''}
                              </span>
                            )}
                          </div>
                          <p className="text-sm leading-relaxed text-[#1A3A3F]">{note.body}</p>
                        </li>
                      ))}
                    </ul>
                  )}
                </article>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
