'use client';

/**
 * Cuadrante de personal — Épica D (RF-PRO-003/004).
 *
 * Vista semanal/mensual del cuadrante de asignaciones del equipo.
 * Muestra alerta de infra-cobertura (shifts.coverage) por turno y día.
 *
 * Permisos:
 *   - Vista: shifts:read (AUXILIAR, SANITARIO, DIRECTOR, SUPERADMIN).
 *   - Edición: shifts:manage (DIRECTOR, SUPERADMIN).
 *
 * Ruta: /cuadrante
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
  Select,
  Input,
} from '@vetlla/ui';
import { api } from '@/trpc/react';
import { useT } from '@/i18n/provider';
import { useToast } from '@/components/toast';
import { useConfirm } from '@/components/confirm';
import {
  ASSIGNMENT_STATUS_LABELS,
  ASSIGNMENT_STATUS_TONE,
} from '@/lib/labels';

// ---------------------------------------------------------------------------
// Tipos locales
// ---------------------------------------------------------------------------

type StaffShift = 'MANANA' | 'TARDE' | 'NOCHE';
const SHIFTS: StaffShift[] = ['MANANA', 'TARDE', 'NOCHE'];

type AssignmentStatus = 'PLANIFICADO' | 'CONFIRMADO' | 'AUSENTE' | 'SUSTITUIDO';

type Assignment = {
  id: string;
  userId: string;
  date: Date;
  shift: string;
  status: string;
  notes: string | null;
  unitId: string | null;
  substituteUserId: string | null;
  user: { id: string; name: string | null; email: string; jobTitle: string | null };
  substituteUser: { id: string; name: string | null; email: string; jobTitle: string | null } | null;
};

// ---------------------------------------------------------------------------
// Utilidades de fecha
// ---------------------------------------------------------------------------

function getWeekDays(anchor: Date): Date[] {
  const d = new Date(anchor);
  const day = d.getDay(); // 0=domingo
  const monday = new Date(d);
  monday.setDate(d.getDate() - ((day === 0 ? 7 : day) - 1));
  return Array.from({ length: 7 }, (_, i) => {
    const dd = new Date(monday);
    dd.setDate(monday.getDate() + i);
    return dd;
  });
}

function getMonthDays(anchor: Date): Date[] {
  const year = anchor.getFullYear();
  const month = anchor.getMonth();
  const last = new Date(year, month + 1, 0).getDate();
  return Array.from({ length: last }, (_, i) => new Date(year, month, i + 1));
}

function isoDay(d: Date): string {
  return d.toISOString().split('T')[0]!;
}

function isToday(d: Date): boolean {
  return isoDay(d) === isoDay(new Date());
}

function formatDayShort(locale: string, d: Date): string {
  return new Intl.DateTimeFormat(locale === 'ca' ? 'ca-ES' : 'es-ES', {
    weekday: 'short',
    day: 'numeric',
  }).format(d);
}

function formatMonthYear(locale: string, d: Date): string {
  return new Intl.DateTimeFormat(locale === 'ca' ? 'ca-ES' : 'es-ES', {
    month: 'long',
    year: 'numeric',
  }).format(d);
}

// ---------------------------------------------------------------------------
// Icono decorativo: warning
// ---------------------------------------------------------------------------
function IconWarn({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12" y2="17.01" />
    </svg>
  );
}

function IconPlus({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Modal de asignación / edición
// ---------------------------------------------------------------------------

type AssignModalProps = {
  open: boolean;
  onClose: () => void;
  date: Date;
  shift: StaffShift;
  unitId: string | undefined;
  existing: Assignment | null;
  users: { id: string; name: string | null; email: string; jobTitle: string | null }[];
  canManage: boolean;
  onSaved: () => void;
};

function AssignModal({
  open,
  onClose,
  date,
  shift,
  unitId,
  existing,
  users,
  canManage,
  onSaved,
}: AssignModalProps) {
  const { t } = useT();
  const { success, error: toastError } = useToast();

  const [userId, setUserId] = useState(existing?.userId ?? '');
  const [status, setStatus] = useState<AssignmentStatus>(
    (existing?.status as AssignmentStatus) ?? 'PLANIFICADO',
  );
  const [substituteUserId, setSubstituteUserId] = useState(
    existing?.substituteUserId ?? '',
  );
  const [notes, setNotes] = useState(existing?.notes ?? '');

  // Reset when opening
  useEffect(() => {
    if (open) {
      setUserId(existing?.userId ?? '');
      setStatus((existing?.status as AssignmentStatus) ?? 'PLANIFICADO');
      setSubstituteUserId(existing?.substituteUserId ?? '');
      setNotes(existing?.notes ?? '');
    }
  }, [open, existing]);

  const upsertMutation = api.shifts.assignment.upsert.useMutation({
    onSuccess: () => {
      success(t('cuadrante.action.saved'));
      onSaved();
      onClose();
    },
    onError: () => {
      toastError(t('cuadrante.action.saved') + ' — error');
    },
  });

  const setStatusMutation = api.shifts.assignment.setStatus.useMutation({
    onSuccess: () => {
      success(t('cuadrante.action.statusUpdated'));
      onSaved();
      onClose();
    },
    onError: () => {
      toastError(t('cuadrante.action.statusUpdated') + ' — error');
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!userId) return;

    if (existing && status !== existing.status) {
      // Solo cambia de estado
      setStatusMutation.mutate({
        id: existing.id,
        status,
        substituteUserId: substituteUserId || undefined,
        notes: notes || undefined,
      });
    } else {
      upsertMutation.mutate({
        id: existing?.id,
        userId,
        date,
        shift,
        unitId: unitId || undefined,
        status,
        substituteUserId: substituteUserId || undefined,
        notes: notes || undefined,
      });
    }
  }

  const isPending = upsertMutation.isPending || setStatusMutation.isPending;
  const showSubstitute = status === 'AUSENTE' || status === 'SUSTITUIDO';

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent aria-describedby={undefined}>
        <DialogTitle>
          {t('cuadrante.assign.title')} — {t(`cuadrante.shift.${shift}`)} {isoDay(date)}
        </DialogTitle>
        <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-4">
          {/* Trabajador */}
          <div>
            <Label htmlFor="assign-worker">{t('cuadrante.assign.worker')}</Label>
            <Select
              id="assign-worker"
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              required
              aria-required="true"
              disabled={Boolean(existing) || !canManage}
            >
              <option value="">{t('cuadrante.assign.workerPh')}</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name ?? u.email}
                  {u.jobTitle ? ` · ${u.jobTitle}` : ''}
                </option>
              ))}
            </Select>
          </div>

          {/* Estado */}
          <div>
            <Label htmlFor="assign-status">{t('cuadrante.assign.status')}</Label>
            <Select
              id="assign-status"
              value={status}
              onChange={(e) => setStatus(e.target.value as AssignmentStatus)}
              disabled={!canManage}
            >
              {(Object.keys(ASSIGNMENT_STATUS_LABELS) as AssignmentStatus[]).map((s) => (
                <option key={s} value={s}>
                  {ASSIGNMENT_STATUS_LABELS[s]}
                </option>
              ))}
            </Select>
          </div>

          {/* Sustituto (solo visible en AUSENTE/SUSTITUIDO) */}
          {showSubstitute && (
            <div>
              <Label htmlFor="assign-substitute">{t('cuadrante.assign.substitute')}</Label>
              <Select
                id="assign-substitute"
                value={substituteUserId}
                onChange={(e) => setSubstituteUserId(e.target.value)}
                disabled={!canManage}
              >
                <option value="">{t('cuadrante.assign.substitutePh')}</option>
                {users
                  .filter((u) => u.id !== userId)
                  .map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name ?? u.email}
                      {u.jobTitle ? ` · ${u.jobTitle}` : ''}
                    </option>
                  ))}
              </Select>
            </div>
          )}

          {/* Notas */}
          <div>
            <Label htmlFor="assign-notes">{t('cuadrante.assign.notes')}</Label>
            <Input
              id="assign-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={t('cuadrante.assign.notesPh')}
              maxLength={2000}
              disabled={!canManage}
            />
          </div>

          {canManage && (
            <DialogFooter>
              <Button type="button" variant="secondary" onClick={onClose}>
                {t('action.cancel')}
              </Button>
              <Button type="submit" disabled={isPending || !userId}>
                {isPending ? t('cuadrante.assign.submitting') : t('cuadrante.assign.submit')}
              </Button>
            </DialogFooter>
          )}
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Chip de trabajador asignado en la celda del cuadrante
// ---------------------------------------------------------------------------

type WorkerChipProps = {
  assignment: Assignment;
  canManage: boolean;
  onClick: () => void;
  onDelete: () => void;
};

function WorkerChip({ assignment, canManage, onClick, onDelete }: WorkerChipProps) {
  const { t } = useT();
  const name =
    assignment.user.name ?? assignment.user.email;
  const isAbsent = assignment.status === 'AUSENTE';
  const isSustituido = assignment.status === 'SUSTITUIDO';
  const tone = ASSIGNMENT_STATUS_TONE[assignment.status] ?? 'neutral';

  return (
    <div
      className={`group relative flex min-h-[44px] flex-col gap-0.5 rounded-xl border px-2.5 py-1.5 text-xs transition-colors ${
        isAbsent
          ? 'border-red-200 bg-red-50 opacity-75'
          : 'border-brand-100 bg-brand-50 hover:border-brand-300 hover:bg-brand-100'
      }`}
      role="listitem"
    >
      <span
        className={`font-medium leading-tight text-[#1A3A3F] ${isAbsent ? 'line-through opacity-60' : ''}`}
      >
        {name}
      </span>
      {assignment.user.jobTitle && (
        <span className="text-[10px] text-[#1A3A3F]/50 leading-tight">
          {assignment.user.jobTitle}
        </span>
      )}
      {/* Sustituto */}
      {isSustituido && assignment.substituteUser && (
        <span className="mt-0.5 text-[10px] text-amber-700 leading-tight">
          → {assignment.substituteUser.name ?? assignment.substituteUser.email}
        </span>
      )}
      <Badge tone={tone} className="mt-0.5 self-start text-[10px]">
        {t(`cuadrante.status.${assignment.status}`)}
      </Badge>

      {/* Controles (solo si canManage) */}
      {canManage && (
        <div className="absolute right-1 top-1 hidden flex-col gap-0.5 group-hover:flex group-focus-within:flex">
          <button
            type="button"
            aria-label={`${t('cuadrante.action.edit')} ${name}`}
            onClick={onClick}
            className="rounded p-0.5 hover:bg-brand-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
          >
            <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4Z" />
            </svg>
          </button>
          <button
            type="button"
            aria-label={`${t('cuadrante.action.delete')} ${name}`}
            onClick={onDelete}
            className="rounded p-0.5 text-red-500 hover:bg-red-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
          >
            <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
              <path d="M10 11v6M14 11v6" />
              <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Celda del cuadrante (un día × un turno)
// ---------------------------------------------------------------------------

type CellProps = {
  date: Date;
  shift: StaffShift;
  centerId: string;
  unitId: string | undefined;
  assignments: Assignment[];
  canManage: boolean;
  onAddClick: (date: Date, shift: StaffShift) => void;
  onEditClick: (a: Assignment) => void;
  onDeleteClick: (a: Assignment) => void;
};

function QuadrantCell({
  date,
  shift,
  centerId,
  unitId,
  assignments,
  canManage,
  onAddClick,
  onEditClick,
  onDeleteClick,
}: CellProps) {
  const { t } = useT();

  const coverageQuery = api.shifts.coverage.useQuery(
    { centerId, date, shift, unitId },
    { enabled: Boolean(centerId) },
  );

  const coverage = coverageQuery.data;
  const hasUnderstaffed = coverage?.understaffed === true;
  const hasNoTemplate = coverage?.noTemplate === true;

  return (
    <div
      className={`flex min-h-[80px] flex-col gap-1 rounded-xl border p-1.5 ${
        hasUnderstaffed
          ? 'border-red-200 bg-red-50/60'
          : hasNoTemplate
          ? 'border-brand-100/40 bg-white/60'
          : 'border-brand-100 bg-white'
      }`}
    >
      {/* Alerta de cobertura */}
      {hasUnderstaffed && coverage && (
        <div
          className="flex items-center gap-1 rounded-lg bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-700"
          role="status"
          aria-label={t('cuadrante.coverage.understaffed', {
            assigned: coverage.assigned,
            required: coverage.required,
          })}
        >
          <IconWarn />
          {t('cuadrante.coverage.understaffed', {
            assigned: coverage.assigned,
            required: coverage.required,
          })}
        </div>
      )}
      {hasNoTemplate && !hasUnderstaffed && (
        <div className="flex items-center gap-1 rounded-lg bg-brand-50 px-1.5 py-0.5 text-[10px] text-brand-600">
          <span aria-hidden="true">—</span>
          {t('cuadrante.coverage.noTemplate')}
        </div>
      )}
      {!hasUnderstaffed && !hasNoTemplate && coverage && coverage.required > 0 && (
        <div className="rounded-lg bg-green-50 px-1.5 py-0.5 text-[10px] text-green-700">
          {t('cuadrante.coverage.ok', {
            assigned: coverage.assigned,
            required: coverage.required,
          })}
        </div>
      )}

      {/* Workers */}
      <ul role="list" className="flex flex-col gap-1">
        {assignments.map((a) => (
          <WorkerChip
            key={a.id}
            assignment={a}
            canManage={canManage}
            onClick={() => onEditClick(a)}
            onDelete={() => onDeleteClick(a)}
          />
        ))}
      </ul>

      {/* Botón añadir */}
      {canManage && (
        <button
          type="button"
          aria-label={`${t('cuadrante.action.assign')} ${t(`cuadrante.shift.${shift}`)} ${isoDay(date)}`}
          onClick={() => onAddClick(date, shift)}
          className="mt-auto flex min-h-[36px] items-center justify-center rounded-lg border border-dashed border-brand-200 text-brand-500 hover:border-brand-400 hover:bg-brand-50 hover:text-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
        >
          <IconPlus />
          <span className="sr-only">{t('cuadrante.action.assign')}</span>
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sección de Plantillas (modal secundaria)
// ---------------------------------------------------------------------------

type TemplatesSectionProps = {
  centerId: string;
  units: { id: string; name: string }[];
  canManage: boolean;
};

function TemplatesSection({ centerId, units, canManage }: TemplatesSectionProps) {
  const { t } = useT();
  const { success: toastSuccess, error: toastError } = useToast();
  const confirm = useConfirm();

  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | undefined>(undefined);
  const [name, setName] = useState('');
  const [shift, setShift] = useState<StaffShift>('MANANA');
  const [startTime, setStartTime] = useState('06:00');
  const [endTime, setEndTime] = useState('14:00');
  const [minStaff, setMinStaff] = useState(2);
  const [formUnitId, setFormUnitId] = useState('');

  const templatesQuery = api.shifts.template.list.useQuery(
    { centerId, activeOnly: false },
    { enabled: Boolean(centerId) },
  );

  const upsertMutation = api.shifts.template.upsert.useMutation({
    onSuccess: () => {
      toastSuccess(t('cuadrante.templates.saved'));
      void templatesQuery.refetch();
      resetForm();
    },
    onError: () => toastError(t('cuadrante.templates.saved') + ' — error'),
  });

  const deleteMutation = api.shifts.template.delete.useMutation({
    onSuccess: () => {
      toastSuccess(t('cuadrante.templates.deactivated'));
      void templatesQuery.refetch();
    },
    onError: () => toastError(t('cuadrante.templates.deactivated') + ' — error'),
  });

  function resetForm() {
    setShowForm(false);
    setEditId(undefined);
    setName('');
    setShift('MANANA');
    setStartTime('06:00');
    setEndTime('14:00');
    setMinStaff(2);
    setFormUnitId('');
  }

  async function handleDeactivate(id: string) {
    const result = await confirm({
      title: t('cuadrante.templates.deactivate.title'),
      description: t('cuadrante.templates.deactivate.desc'),
      confirmLabel: t('cuadrante.templates.deactivate'),
      tone: 'danger',
    });
    if (!result) return;
    deleteMutation.mutate({ id });
  }

  function handleEdit(tpl: {
    id: string; name: string; shift: string; startTime: string; endTime: string;
    minStaff: number; unitId: string | null;
  }) {
    setEditId(tpl.id);
    setName(tpl.name);
    setShift(tpl.shift as StaffShift);
    setStartTime(tpl.startTime);
    setEndTime(tpl.endTime);
    setMinStaff(tpl.minStaff);
    setFormUnitId(tpl.unitId ?? '');
    setShowForm(true);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    upsertMutation.mutate({
      id: editId,
      centerId,
      unitId: formUnitId || undefined,
      name,
      shift,
      startTime,
      endTime,
      minStaff,
      active: true,
    });
  }

  const templates = templatesQuery.data ?? [];

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle>{t('cuadrante.templates.title')}</CardTitle>
            <p className="mt-0.5 text-sm text-[#1A3A3F]/60">
              {t('cuadrante.templates.subtitle')}
            </p>
          </div>
          {canManage && (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => { resetForm(); setShowForm(true); }}
            >
              {t('cuadrante.templates.new')}
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {/* Formulario */}
        {showForm && canManage && (
          <form onSubmit={handleSubmit} className="mb-6 flex flex-col gap-4 rounded-2xl border border-brand-100 bg-brand-50 p-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="tpl-name">{t('cuadrante.templates.form.name')}</Label>
                <Input
                  id="tpl-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t('cuadrante.templates.form.namePh')}
                  required
                  maxLength={200}
                />
              </div>
              <div>
                <Label htmlFor="tpl-shift">{t('cuadrante.templates.form.shift')}</Label>
                <Select id="tpl-shift" value={shift} onChange={(e) => setShift(e.target.value as StaffShift)}>
                  {SHIFTS.map((s) => (
                    <option key={s} value={s}>{t(`cuadrante.shift.${s}`)}</option>
                  ))}
                </Select>
              </div>
              <div>
                <Label htmlFor="tpl-start">{t('cuadrante.templates.form.start')}</Label>
                <Input id="tpl-start" type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} required />
              </div>
              <div>
                <Label htmlFor="tpl-end">{t('cuadrante.templates.form.end')}</Label>
                <Input id="tpl-end" type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} required />
              </div>
              <div>
                <Label htmlFor="tpl-min">{t('cuadrante.templates.form.minStaff')}</Label>
                <Input
                  id="tpl-min"
                  type="number"
                  min={1}
                  max={100}
                  value={minStaff}
                  onChange={(e) => setMinStaff(parseInt(e.target.value, 10))}
                  required
                />
              </div>
              {units.length > 0 && (
                <div>
                  <Label htmlFor="tpl-unit">{t('cuadrante.templates.form.unit')}</Label>
                  <Select id="tpl-unit" value={formUnitId} onChange={(e) => setFormUnitId(e.target.value)}>
                    <option value="">{t('cuadrante.templates.form.unitNone')}</option>
                    {units.map((u) => (
                      <option key={u.id} value={u.id}>{u.name}</option>
                    ))}
                  </Select>
                </div>
              )}
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="secondary" size="sm" onClick={resetForm}>
                {t('action.cancel')}
              </Button>
              <Button type="submit" size="sm" disabled={upsertMutation.isPending}>
                {upsertMutation.isPending
                  ? t('cuadrante.templates.form.submitting')
                  : t('cuadrante.templates.form.submit')}
              </Button>
            </div>
          </form>
        )}

        {/* Lista de plantillas */}
        {templates.length === 0 ? (
          <p className="text-sm text-[#1A3A3F]/60">{t('cuadrante.templates.empty')}</p>
        ) : (
          <ul role="list" className="flex flex-col gap-2">
            {templates.map((tpl) => (
              <li
                key={tpl.id}
                className={`flex flex-wrap items-center justify-between gap-3 rounded-2xl border px-4 py-3 ${
                  !tpl.active ? 'border-brand-100/40 bg-[#FAF7F2] opacity-60' : 'border-brand-100 bg-white'
                }`}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone="neutral">{t(`cuadrante.shift.${tpl.shift}`)}</Badge>
                  <span className="font-medium text-[#1A3A3F]">{tpl.name}</span>
                  <span className="text-sm text-[#1A3A3F]/50">
                    {tpl.startTime}–{tpl.endTime}
                  </span>
                  <Badge tone={tpl.active ? 'green' : 'neutral'}>
                    Min. {tpl.minStaff}
                  </Badge>
                  {(tpl as { unit?: { name: string } | null }).unit && (
                    <Badge tone="blue">
                      {(tpl as { unit: { name: string } }).unit.name}
                    </Badge>
                  )}
                </div>
                {canManage && tpl.active && (
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => handleEdit(tpl)}
                    >
                      {t('action.save').replace('Guardar', 'Editar')}
                    </Button>
                    <Button
                      size="sm"
                      variant="danger"
                      onClick={() => void handleDeactivate(tpl.id)}
                      disabled={deleteMutation.isPending}
                    >
                      {t('cuadrante.templates.deactivate')}
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Componente principal
// ---------------------------------------------------------------------------

export default function CuadrantePage() {
  const { t, locale } = useT();
  const { success: toastSuccess } = useToast();
  const confirm = useConfirm();

  const today = new Date();
  const [anchorDate, setAnchorDate] = useState(today);
  const [viewMode, setViewMode] = useState<'week' | 'month'>('week');
  const [selectedCenterId, setSelectedCenterId] = useState('');
  const [selectedUnitId, setSelectedUnitId] = useState('');
  const [showTemplates, setShowTemplates] = useState(false);

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [modalDate, setModalDate] = useState<Date>(today);
  const [modalShift, setModalShift] = useState<StaffShift>('MANANA');
  const [editingAssignment, setEditingAssignment] = useState<Assignment | null>(null);

  // Data
  const centersQuery = api.centers.list.useQuery();
  const meQuery = api.me.useQuery();

  useEffect(() => {
    const data = centersQuery.data;
    if (data && data.length > 0 && !selectedCenterId) {
      setSelectedCenterId(data[0]!.id);
    }
  }, [centersQuery.data, selectedCenterId]);

  const centerDetailQuery = api.centers.get.useQuery(
    { id: selectedCenterId },
    { enabled: Boolean(selectedCenterId) },
  );

  const days = viewMode === 'week' ? getWeekDays(anchorDate) : getMonthDays(anchorDate);
  const dateFrom = days[0]!;
  const dateTo = days[days.length - 1]!;

  const assignmentsQuery = api.shifts.assignment.list.useQuery(
    {
      centerId: selectedCenterId,
      dateFrom,
      dateTo,
      unitId: selectedUnitId || undefined,
    },
    { enabled: Boolean(selectedCenterId) },
  );

  const usersQuery = api.users.list.useQuery(undefined, {
    enabled: Boolean(selectedCenterId),
  });

  const deleteMutation = api.shifts.assignment.delete.useMutation({
    onSuccess: () => {
      toastSuccess(t('cuadrante.action.deleted'));
      void assignmentsQuery.refetch();
    },
  });

  const canManage = meQuery.data?.permissions.includes('shifts:manage') ?? false;

  const centers = centersQuery.data ?? [];
  const units = centerDetailQuery.data?.units ?? [];
  const assignments = (assignmentsQuery.data ?? []) as Assignment[];
  const users = usersQuery.data ?? [];

  // Index assignments by day + shift
  function getAssignments(date: Date, shift: StaffShift): Assignment[] {
    const dayStr = isoDay(date);
    return assignments.filter(
      (a) => isoDay(new Date(a.date)) === dayStr && a.shift === shift,
    );
  }

  function handleAddClick(date: Date, shift: StaffShift) {
    setModalDate(date);
    setModalShift(shift);
    setEditingAssignment(null);
    setModalOpen(true);
  }

  function handleEditClick(a: Assignment) {
    setModalDate(new Date(a.date));
    setModalShift(a.shift as StaffShift);
    setEditingAssignment(a);
    setModalOpen(true);
  }

  async function handleDeleteClick(a: Assignment) {
    const result = await confirm({
      title: t('cuadrante.action.delete.confirm.title'),
      description: t('cuadrante.action.delete.confirm.desc'),
      confirmLabel: t('cuadrante.action.delete'),
      tone: 'danger',
    });
    if (!result) return;
    deleteMutation.mutate({ id: a.id });
  }

  function navigate(delta: number) {
    const d = new Date(anchorDate);
    if (viewMode === 'week') {
      d.setDate(d.getDate() + delta * 7);
    } else {
      d.setMonth(d.getMonth() + delta);
    }
    setAnchorDate(d);
  }

  const periodLabel = viewMode === 'week'
    ? `${formatDayShort(locale, days[0]!)} – ${formatDayShort(locale, days[days.length - 1]!)}`
    : formatMonthYear(locale, anchorDate);

  if (centersQuery.isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <p className="text-sm text-[#1A3A3F]/60">{t('cuadrante.loading')}</p>
      </div>
    );
  }

  if (centers.length === 0) {
    return (
      <div className="flex items-center justify-center py-16">
        <p className="text-sm text-[#1A3A3F]/60">{t('cuadrante.noCenters')}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Cabecera */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-[#1A3A3F]">
            {t('cuadrante.title')}
          </h1>
          <p className="mt-1 text-sm text-[#1A3A3F]/60">{t('cuadrante.subtitle')}</p>
        </div>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => setShowTemplates((v) => !v)}
        >
          {t('cuadrante.templates.title')}
        </Button>
      </div>

      {/* Filtros */}
      <Card>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {/* Vista semana/mes */}
            <div>
              <Label htmlFor="cuadrante-view">{t('cuadrante.view')}</Label>
              <Select
                id="cuadrante-view"
                value={viewMode}
                onChange={(e) => {
                  setViewMode(e.target.value as 'week' | 'month');
                  setAnchorDate(new Date());
                }}
              >
                <option value="week">{t('cuadrante.view.week')}</option>
                <option value="month">{t('cuadrante.view.month')}</option>
              </Select>
            </div>

            {/* Centro */}
            {centers.length > 1 && (
              <div>
                <Label htmlFor="cuadrante-center">{t('cuadrante.center')}</Label>
                <Select
                  id="cuadrante-center"
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
                <Label htmlFor="cuadrante-unit">{t('cuadrante.unit')}</Label>
                <Select
                  id="cuadrante-unit"
                  value={selectedUnitId}
                  onChange={(e) => setSelectedUnitId(e.target.value)}
                >
                  <option value="">{t('cuadrante.unitAll')}</option>
                  {units.map((u) => (
                    <option key={u.id} value={u.id}>{u.name}</option>
                  ))}
                </Select>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Navegación de período */}
      <div className="flex flex-wrap items-center gap-3" role="navigation" aria-label={t('cuadrante.view')}>
        <button
          type="button"
          aria-label={t('cuadrante.prevPeriod')}
          onClick={() => navigate(-1)}
          className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full border border-brand-200 text-[#1A3A3F]/70 hover:bg-brand-50 hover:text-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
        >
          ‹
        </button>
        <span className="text-sm font-semibold text-[#1A3A3F]" aria-live="polite" aria-atomic="true">
          {periodLabel}
        </span>
        <button
          type="button"
          aria-label={t('cuadrante.nextPeriod')}
          onClick={() => navigate(1)}
          className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full border border-brand-200 text-[#1A3A3F]/70 hover:bg-brand-50 hover:text-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
        >
          ›
        </button>
        <Button size="sm" variant="secondary" onClick={() => setAnchorDate(new Date())}>
          {t('cuadrante.today')}
        </Button>
        {assignmentsQuery.isLoading && (
          <span className="text-sm text-[#1A3A3F]/50" aria-live="polite">
            {t('cuadrante.loading')}
          </span>
        )}
      </div>

      {/* Leyenda de estados */}
      <div className="flex flex-wrap items-center gap-2" role="list" aria-label="Leyenda de estados">
        {(Object.keys(ASSIGNMENT_STATUS_LABELS) as (keyof typeof ASSIGNMENT_STATUS_LABELS)[]).map((s) => (
          <Badge key={s} tone={ASSIGNMENT_STATUS_TONE[s]}>
            {ASSIGNMENT_STATUS_LABELS[s]}
          </Badge>
        ))}
      </div>

      {/* Grid del cuadrante */}
      <div
        className="overflow-x-auto rounded-2xl border border-brand-100 bg-white shadow-card"
        role="region"
        aria-label={t('cuadrante.title')}
      >
        {/* Cabecera: días */}
        <div
          className="grid border-b border-brand-100 bg-brand-50"
          style={{
            gridTemplateColumns: `5rem repeat(${days.length}, minmax(110px, 1fr))`,
          }}
        >
          {/* Columna turno */}
          <div className="px-3 py-2 text-xs font-semibold uppercase tracking-widest text-[#1A3A3F]/40">
            {t('cuadrante.view')}
          </div>
          {days.map((d) => (
            <div
              key={isoDay(d)}
              className={`border-l border-brand-100 px-2 py-2 text-center text-xs font-semibold text-[#1A3A3F]/70 ${
                isToday(d) ? 'bg-brand-100/60 text-brand-700' : ''
              }`}
              aria-current={isToday(d) ? 'date' : undefined}
            >
              {formatDayShort(locale, d)}
            </div>
          ))}
        </div>

        {/* Filas: turnos */}
        {SHIFTS.map((shift) => (
          <div
            key={shift}
            className="grid border-b border-brand-100 last:border-b-0"
            style={{
              gridTemplateColumns: `5rem repeat(${days.length}, minmax(110px, 1fr))`,
            }}
          >
            {/* Etiqueta de turno */}
            <div className="flex items-start border-r border-brand-100 px-3 py-2">
              <span className="text-xs font-semibold uppercase tracking-widest text-[#1A3A3F]/60">
                {t(`cuadrante.shift.${shift}`)}
              </span>
            </div>

            {/* Celdas */}
            {days.map((d) => (
              <div key={isoDay(d)} className="border-l border-brand-100 p-1">
                <QuadrantCell
                  date={d}
                  shift={shift}
                  centerId={selectedCenterId}
                  unitId={selectedUnitId || undefined}
                  assignments={getAssignments(d, shift)}
                  canManage={canManage}
                  onAddClick={handleAddClick}
                  onEditClick={handleEditClick}
                  onDeleteClick={(a) => void handleDeleteClick(a)}
                />
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* Sección Plantillas (expandible) */}
      {showTemplates && (
        <TemplatesSection
          centerId={selectedCenterId}
          units={units}
          canManage={canManage}
        />
      )}

      {/* Modal asignación */}
      {modalOpen && (
        <AssignModal
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          date={modalDate}
          shift={modalShift}
          unitId={selectedUnitId || undefined}
          existing={editingAssignment}
          users={users}
          canManage={canManage}
          onSaved={() => void assignmentsQuery.refetch()}
        />
      )}
    </div>
  );
}
