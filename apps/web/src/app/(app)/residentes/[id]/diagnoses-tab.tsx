'use client';

/**
 * DiagnosesTab — pestaña "Diagnósticos" del expediente del residente.
 *
 * Muestra diagnósticos separados en dos secciones:
 *   - Activos y crónicos (ACTIVO | CRONICO)
 *   - Resueltos (RESUELTO)
 *
 * Permisos:
 *   - Leer:    residents:read  (DIRECTOR, SANITARIO, AUXILIAR)
 *   - Escribir: clinical:write (DIRECTOR, SANITARIO)
 *
 * RBAC: el servidor valida; la UI solo oculta controles sin permiso.
 */

import { useState } from 'react';
import {
  Badge,
  Button,
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
} from '@vetlla/ui';
import { api } from '@/trpc/react';
import { useT } from '@/i18n/provider';
import { formatDate } from '@/lib/format';
import { useToast } from '@/components/toast';
import { useConfirm } from '@/components/confirm';
import { useZodForm } from '@/lib/form';
import {
  availableTransitions,
  activeDiagnoses,
  resolvedDiagnoses,
} from '@/lib/diagnosticos';
import type { DiagnosisStatus as DxStatus } from '@/lib/diagnosticos';
import {
  createDiagnosisSchema,
  updateDiagnosisSchema,
  transitionDiagnosisSchema,
  DiagnosisType,
  DiagnosisStatus,
} from '@/lib/schemas/diagnosticos';

// ---------------------------------------------------------------------------
// Tipos locales
// ---------------------------------------------------------------------------

type DxRow = {
  id: string;
  code: string | null;
  description: string;
  type: DiagnosisType;
  status: DiagnosisStatus;
  diagnosedAt: Date | null;
  resolvedAt: Date | null;
  notes: string | null;
};

// ---------------------------------------------------------------------------
// Helpers de presentación
// ---------------------------------------------------------------------------

/** Tone de Badge según estado del diagnóstico (paleta @vetlla/ui). */
function statusTone(status: DiagnosisStatus): 'green' | 'amber' | 'neutral' {
  if (status === 'ACTIVO') return 'green';
  if (status === 'CRONICO') return 'amber';
  return 'neutral';
}

/** Tone de Badge según tipo de diagnóstico. */
function typeTone(type: DiagnosisType): 'neutral' | 'blue' {
  return type === 'PRINCIPAL' ? 'blue' : 'neutral';
}

// ---------------------------------------------------------------------------
// Esquemas Zod para formularios del cliente
// (reutilizan los del router, acotados a lo que necesita cada form)
// ---------------------------------------------------------------------------

const dxCreateClientSchema = createDiagnosisSchema.omit({ residentId: true });
const dxUpdateClientSchema = updateDiagnosisSchema.omit({ id: true, residentId: true });
const dxTransitionClientSchema = transitionDiagnosisSchema.omit({ id: true, residentId: true });

// ---------------------------------------------------------------------------
// Componente principal
// ---------------------------------------------------------------------------

interface DiagnosesTabProps {
  residentId: string;
  canClinical: boolean;
}

export function DiagnosesTab({ residentId, canClinical }: DiagnosesTabProps) {
  const { locale, t } = useT();
  const fmtDate = (d: Date | string | null | undefined) => formatDate(locale, d);
  const toast = useToast();
  const confirm = useConfirm();
  const utils = api.useUtils();

  const refresh = () => utils.diagnosticos.diagnoses.listForResident.invalidate({ residentId });

  // ── Datos ─────────────────────────────────────────────────────────────────
  const { data, isLoading } = api.diagnosticos.diagnoses.listForResident.useQuery({ residentId });

  const active = activeDiagnoses((data ?? []) as DxRow[]);
  const resolved = resolvedDiagnoses((data ?? []) as DxRow[]);

  // ── Dialog: nuevo diagnóstico ──────────────────────────────────────────────
  const [addOpen, setAddOpen] = useState(false);
  const [addFields, setAddFields] = useState<{
    description: string;
    code: string;
    type: string;
    status: string;
    diagnosedAt: string;
    notes: string;
  }>({
    description: '',
    code: '',
    type: 'PRINCIPAL',
    status: 'ACTIVO',
    diagnosedAt: '',
    notes: '',
  });
  const addForm = useZodForm(dxCreateClientSchema);

  const createDx = api.diagnosticos.diagnoses.create.useMutation({
    onSuccess: async () => {
      setAddOpen(false);
      setAddFields({ description: '', code: '', type: 'PRINCIPAL', status: 'ACTIVO', diagnosedAt: '', notes: '' });
      addForm.clearErrors();
      await refresh();
      toast.success(t('exp.dx.form.saved'));
    },
    onError: (e) => toast.error(e.message),
  });

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const payload = {
      description: addFields.description,
      code: addFields.code || undefined,
      type: addFields.type as DiagnosisType,
      status: addFields.status as DiagnosisStatus,
      diagnosedAt: addFields.diagnosedAt ? new Date(addFields.diagnosedAt) : undefined,
      notes: addFields.notes || undefined,
      // resolvedAt only if creating as RESUELTO (edge case; transition dialog covers this)
    };
    const data = addForm.validate(payload);
    if (!data) return;
    createDx.mutate({ residentId, ...data });
  }

  // ── Dialog: editar diagnóstico ─────────────────────────────────────────────
  const [editOpen, setEditOpen] = useState(false);
  const [editId, setEditId] = useState('');
  const [editFields, setEditFields] = useState<{
    description: string;
    code: string;
    diagnosedAt: string;
    notes: string;
  }>({ description: '', code: '', diagnosedAt: '', notes: '' });
  const editForm = useZodForm(dxUpdateClientSchema);

  const updateDx = api.diagnosticos.diagnoses.update.useMutation({
    onSuccess: async () => {
      setEditOpen(false);
      editForm.clearErrors();
      await refresh();
      toast.success(t('exp.dx.form.saved'));
    },
    onError: (e) => toast.error(e.message),
  });

  function openEdit(dx: DxRow) {
    setEditId(dx.id);
    setEditFields({
      description: dx.description,
      code: dx.code ?? '',
      diagnosedAt: dx.diagnosedAt ? dx.diagnosedAt.toISOString().split('T')[0]! : '',
      notes: dx.notes ?? '',
    });
    editForm.clearErrors();
    setEditOpen(true);
  }

  function handleUpdate(e: React.FormEvent) {
    e.preventDefault();
    const payload = {
      description: editFields.description || undefined,
      code: editFields.code || undefined,
      diagnosedAt: editFields.diagnosedAt ? new Date(editFields.diagnosedAt) : undefined,
      notes: editFields.notes || undefined,
    };
    const data = editForm.validate(payload);
    if (!data) return;
    updateDx.mutate({ id: editId, residentId, ...data });
  }

  // ── Dialog: cambio de estado ───────────────────────────────────────────────
  const [transOpen, setTransOpen] = useState(false);
  const [transId, setTransId] = useState('');
  const [transCurrentStatus, setTransCurrentStatus] = useState<DiagnosisStatus>('ACTIVO');
  const [transFields, setTransFields] = useState<{
    next: string;
    resolvedAt: string;
  }>({ next: '', resolvedAt: '' });
  const transForm = useZodForm(dxTransitionClientSchema);

  const transitionDx = api.diagnosticos.diagnoses.transition.useMutation({
    onSuccess: async () => {
      setTransOpen(false);
      transForm.clearErrors();
      await refresh();
      toast.success(t('exp.dx.transition.done'));
    },
    onError: (e) => toast.error(e.message),
  });

  function openTransition(dx: DxRow) {
    const available = availableTransitions(dx.status as DxStatus);
    if (available.length === 0) return;
    setTransId(dx.id);
    setTransCurrentStatus(dx.status);
    setTransFields({ next: available[0] ?? '', resolvedAt: '' });
    transForm.clearErrors();
    setTransOpen(true);
  }

  function handleTransition(e: React.FormEvent) {
    e.preventDefault();
    const payload = {
      next: transFields.next as DiagnosisStatus,
      resolvedAt: transFields.resolvedAt ? new Date(transFields.resolvedAt) : undefined,
    };
    const data = transForm.validate(payload);
    if (!data) return;
    transitionDx.mutate({ id: transId, residentId, ...data });
  }

  // ── Resolución rápida ──────────────────────────────────────────────────────
  async function handleQuickResolve(dx: DxRow) {
    const ok = await confirm({
      title: t('exp.dx.resolve.title'),
      description: `${dx.description} — ${t('exp.dx.resolve.resolvedAt')}`,
      confirmLabel: t('exp.dx.resolve.submit'),
    });
    if (!ok) return;
    const today = new Date();
    transitionDx.mutate({
      id: dx.id,
      residentId,
      next: 'RESUELTO' as DiagnosisStatus,
      resolvedAt: today,
    });
  }

  const today = new Date().toISOString().split('T')[0]!;

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-4">

      {/* Sección: Activos y crónicos */}
      <SectionCard
        title={t('exp.dx.section.active')}
        aside={
          canClinical ? (
            <Button size="sm" onClick={() => setAddOpen(true)}>
              {t('exp.dx.add')}
            </Button>
          ) : undefined
        }
      >
        {isLoading ? (
          <p className="text-sm text-[#1A3A3F]/60">{t('state.loading')}</p>
        ) : active.length === 0 ? (
          <p className="text-sm text-[#1A3A3F]/60">{t('exp.dx.empty')}</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {active.map((dx) => (
              <DiagnosisRow
                key={dx.id}
                dx={dx}
                fmtDate={fmtDate}
                t={t}
                canClinical={canClinical}
                onEdit={openEdit}
                onTransition={openTransition}
                onQuickResolve={handleQuickResolve}
              />
            ))}
          </ul>
        )}
      </SectionCard>

      {/* Sección: Resueltos */}
      <SectionCard title={t('exp.dx.section.resolved')}>
        {isLoading ? (
          <p className="text-sm text-[#1A3A3F]/60">{t('state.loading')}</p>
        ) : resolved.length === 0 ? (
          <p className="text-sm text-[#1A3A3F]/60">{t('exp.dx.section.resolved.empty')}</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {resolved.map((dx) => (
              <DiagnosisRow
                key={dx.id}
                dx={dx}
                fmtDate={fmtDate}
                t={t}
                canClinical={canClinical}
                onEdit={openEdit}
                onTransition={openTransition}
                onQuickResolve={handleQuickResolve}
              />
            ))}
          </ul>
        )}
      </SectionCard>

      {/* ── Dialog: nuevo diagnóstico ───────────────────────────────────── */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-lg">
          <DialogTitle>{t('exp.dx.form.title')}</DialogTitle>
          <form
            className="mt-3 flex flex-col gap-3"
            noValidate
            onSubmit={handleCreate}
          >
            {/* Descripción */}
            <div>
              <Label htmlFor="dx-desc">{t('exp.dx.form.description')}</Label>
              <Input
                id="dx-desc"
                placeholder={t('exp.dx.form.descriptionPh')}
                aria-invalid={Boolean(addForm.errors.description)}
                aria-describedby={addForm.errors.description ? 'dx-desc-err' : undefined}
                value={addFields.description}
                onChange={(e) => setAddFields((s) => ({ ...s, description: e.target.value }))}
              />
              <FieldError id="dx-desc-err">{addForm.errors.description}</FieldError>
            </div>

            {/* Código CIE-10 */}
            <div>
              <Label htmlFor="dx-code">{t('exp.dx.form.code')}</Label>
              <Input
                id="dx-code"
                placeholder={t('exp.dx.codePh')}
                maxLength={20}
                value={addFields.code}
                onChange={(e) => setAddFields((s) => ({ ...s, code: e.target.value }))}
              />
            </div>

            {/* Tipo */}
            <div>
              <Label htmlFor="dx-type">{t('exp.dx.form.type')}</Label>
              <Select
                id="dx-type"
                value={addFields.type}
                onChange={(e) => setAddFields((s) => ({ ...s, type: e.target.value }))}
              >
                <option value="PRINCIPAL">{t('exp.dx.badge.PRINCIPAL')}</option>
                <option value="SECUNDARIO">{t('exp.dx.badge.SECUNDARIO')}</option>
              </Select>
            </div>

            {/* Estado inicial */}
            <div>
              <Label htmlFor="dx-status">{t('exp.dx.form.status')}</Label>
              <Select
                id="dx-status"
                value={addFields.status}
                onChange={(e) => setAddFields((s) => ({ ...s, status: e.target.value }))}
              >
                <option value="ACTIVO">{t('exp.dx.badge.ACTIVO')}</option>
                <option value="CRONICO">{t('exp.dx.badge.CRONICO')}</option>
                <option value="RESUELTO">{t('exp.dx.badge.RESUELTO')}</option>
              </Select>
            </div>

            {/* Fecha de diagnóstico */}
            <div>
              <Label htmlFor="dx-date">{t('exp.dx.form.diagnosedAt')}</Label>
              <Input
                id="dx-date"
                type="date"
                max={today}
                value={addFields.diagnosedAt}
                onChange={(e) => setAddFields((s) => ({ ...s, diagnosedAt: e.target.value }))}
              />
            </div>

            {/* Fecha de resolución — solo si estado RESUELTO */}
            {addFields.status === 'RESUELTO' && (
              <div>
                <Label htmlFor="dx-resolved">{t('exp.dx.resolvedAt')}</Label>
                <Input
                  id="dx-resolved"
                  type="date"
                  max={today}
                  value={addFields.diagnosedAt}
                  onChange={(e) => setAddFields((s) => ({ ...s, diagnosedAt: e.target.value }))}
                />
              </div>
            )}

            {/* Notas */}
            <div>
              <Label htmlFor="dx-notes">{t('exp.dx.form.notes')}</Label>
              <Input
                id="dx-notes"
                placeholder={t('exp.dx.form.notesPh')}
                value={addFields.notes}
                onChange={(e) => setAddFields((s) => ({ ...s, notes: e.target.value }))}
              />
            </div>

            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="ghost">{t('action.cancel')}</Button>
              </DialogClose>
              <Button type="submit" disabled={createDx.isPending}>
                {createDx.isPending
                  ? t('exp.dx.form.submitting')
                  : t('exp.dx.form.submit')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Dialog: editar diagnóstico ──────────────────────────────────── */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-lg">
          <DialogTitle>{t('exp.dx.form.edit')}</DialogTitle>
          <form
            className="mt-3 flex flex-col gap-3"
            noValidate
            onSubmit={handleUpdate}
          >
            <div>
              <Label htmlFor="dxe-desc">{t('exp.dx.form.description')}</Label>
              <Input
                id="dxe-desc"
                placeholder={t('exp.dx.form.descriptionPh')}
                aria-invalid={Boolean(editForm.errors.description)}
                aria-describedby={editForm.errors.description ? 'dxe-desc-err' : undefined}
                value={editFields.description}
                onChange={(e) => setEditFields((s) => ({ ...s, description: e.target.value }))}
              />
              <FieldError id="dxe-desc-err">{editForm.errors.description}</FieldError>
            </div>
            <div>
              <Label htmlFor="dxe-code">{t('exp.dx.form.code')}</Label>
              <Input
                id="dxe-code"
                placeholder={t('exp.dx.codePh')}
                maxLength={20}
                value={editFields.code}
                onChange={(e) => setEditFields((s) => ({ ...s, code: e.target.value }))}
              />
            </div>
            <div>
              <Label htmlFor="dxe-date">{t('exp.dx.form.diagnosedAt')}</Label>
              <Input
                id="dxe-date"
                type="date"
                max={today}
                value={editFields.diagnosedAt}
                onChange={(e) => setEditFields((s) => ({ ...s, diagnosedAt: e.target.value }))}
              />
            </div>
            <div>
              <Label htmlFor="dxe-notes">{t('exp.dx.form.notes')}</Label>
              <Input
                id="dxe-notes"
                placeholder={t('exp.dx.form.notesPh')}
                value={editFields.notes}
                onChange={(e) => setEditFields((s) => ({ ...s, notes: e.target.value }))}
              />
            </div>
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="ghost">{t('action.cancel')}</Button>
              </DialogClose>
              <Button type="submit" disabled={updateDx.isPending}>
                {updateDx.isPending
                  ? t('exp.dx.form.submitting')
                  : t('exp.dx.form.submit')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Dialog: cambio de estado ────────────────────────────────────── */}
      <Dialog open={transOpen} onOpenChange={setTransOpen}>
        <DialogContent>
          <DialogTitle>{t('exp.dx.transition.title')}</DialogTitle>
          <form
            className="mt-3 flex flex-col gap-3"
            noValidate
            onSubmit={handleTransition}
          >
            <div>
              <Label htmlFor="tx-next">{t('exp.dx.transition.next')}</Label>
              <Select
                id="tx-next"
                value={transFields.next}
                onChange={(e) =>
                  setTransFields((s) => ({
                    ...s,
                    next: e.target.value,
                    resolvedAt: e.target.value !== 'RESUELTO' ? '' : s.resolvedAt,
                  }))
                }
              >
                {availableTransitions(transCurrentStatus as DxStatus).map((st) => (
                  <option key={st} value={st}>
                    {t(`exp.dx.badge.${st}`)}
                  </option>
                ))}
              </Select>
            </div>

            {transFields.next === 'RESUELTO' && (
              <div>
                <Label htmlFor="tx-resolved">{t('exp.dx.transition.resolvedAt')}</Label>
                <Input
                  id="tx-resolved"
                  type="date"
                  max={today}
                  required
                  aria-required="true"
                  aria-invalid={Boolean(transForm.errors.resolvedAt)}
                  aria-describedby={transForm.errors.resolvedAt ? 'tx-resolved-err' : undefined}
                  value={transFields.resolvedAt}
                  onChange={(e) => setTransFields((s) => ({ ...s, resolvedAt: e.target.value }))}
                />
                <FieldError id="tx-resolved-err">{transForm.errors.resolvedAt}</FieldError>
              </div>
            )}

            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="ghost">{t('action.cancel')}</Button>
              </DialogClose>
              <Button type="submit" disabled={transitionDx.isPending}>
                {transitionDx.isPending
                  ? t('exp.dx.transition.submitting')
                  : t('exp.dx.transition.submit')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Componente de fila de diagnóstico
// ---------------------------------------------------------------------------

interface DiagnosisRowProps {
  dx: DxRow;
  fmtDate: (d: Date | string | null | undefined) => string;
  t: (key: string, vars?: Record<string, string | number>) => string;
  canClinical: boolean;
  onEdit: (dx: DxRow) => void;
  onTransition: (dx: DxRow) => void;
  onQuickResolve: (dx: DxRow) => void;
}

function DiagnosisRow({
  dx,
  fmtDate,
  t,
  canClinical,
  onEdit,
  onTransition,
  onQuickResolve,
}: DiagnosisRowProps) {
  const isResolved = dx.status === 'RESUELTO';
  const hasTransitions = availableTransitions(dx.status as DxStatus).length > 0;

  return (
    <li
      className={`rounded-md border p-3 text-sm ${
        isResolved
          ? 'border-brand-100/40 bg-[#F7F5F0]'
          : 'border-brand-100 bg-brand-50'
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        {/* Columna izquierda: badges + descripción */}
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={statusTone(dx.status)}>
              {t(`exp.dx.badge.${dx.status}`)}
            </Badge>
            <Badge tone={typeTone(dx.type)}>
              {t(`exp.dx.badge.${dx.type}`)}
            </Badge>
            {dx.code && (
              <span className="rounded bg-[#E8EAF6] px-1.5 py-0.5 text-xs font-mono text-[#1A3A3F]/70">
                {dx.code}
              </span>
            )}
          </div>
          <span className="font-medium text-[#1A3A3F]">{dx.description}</span>
          <div className="flex flex-wrap gap-3 text-xs text-[#1A3A3F]/50">
            {dx.diagnosedAt && (
              <span>
                Diag.: {fmtDate(dx.diagnosedAt)}
              </span>
            )}
            {dx.resolvedAt && (
              <span>
                {t('exp.dx.resolvedAt')}: {fmtDate(dx.resolvedAt)}
              </span>
            )}
          </div>
          {dx.notes && (
            <p className="mt-0.5 text-xs text-[#1A3A3F]/60 italic">{dx.notes}</p>
          )}
        </div>

        {/* Columna derecha: acciones */}
        {canClinical && (
          <div className="flex shrink-0 flex-wrap gap-2">
            {!isResolved && (
              <>
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label={`Editar: ${dx.description}`}
                  onClick={() => onEdit(dx)}
                >
                  Editar
                </Button>
                {hasTransitions && (
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label={`Cambiar estado de: ${dx.description}`}
                    onClick={() => onTransition(dx)}
                  >
                    {t('exp.dx.transition.title')}
                  </Button>
                )}
                {dx.status !== 'RESUELTO' && (
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label={`Marcar como resuelto: ${dx.description}`}
                    onClick={() => void onQuickResolve(dx)}
                  >
                    {t('exp.dx.resolve.submit')}
                  </Button>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </li>
  );
}
