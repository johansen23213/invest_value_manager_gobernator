'use client';

/**
 * AssistiveDevicesTab — pestaña "Ayudas técnicas" del expediente del residente.
 *
 * Muestra dispositivos de apoyo en dos secciones:
 *   - Activas  (ACTIVO)
 *   - Retiradas (RETIRADO)
 *
 * Permisos:
 *   - Leer:    residents:read  (DIRECTOR, SANITARIO, AUXILIAR)
 *   - Escribir: clinical:write (DIRECTOR, SANITARIO)
 *
 * RBAC: el servidor valida; la UI solo oculta controles sin permiso.
 */

import { useState } from 'react';
import { z } from 'zod';
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
import { AssistiveDeviceType, AssistiveDeviceStatus } from '@vetlla/db';
import { api } from '@/trpc/react';
import { useT } from '@/i18n/provider';
import { formatDate } from '@/lib/format';
import { useToast } from '@/components/toast';
import { useZodForm } from '@/lib/form';
import {
  createAssistiveDeviceSchema,
  updateAssistiveDeviceSchema,
  retireAssistiveDeviceSchema,
} from '@/server/routers/diagnosticos';

// ---------------------------------------------------------------------------
// Tipos locales
// ---------------------------------------------------------------------------

type DeviceRow = {
  id: string;
  type: AssistiveDeviceType;
  description: string | null;
  status: AssistiveDeviceStatus;
  prescribedAt: Date;
  retiredAt: Date | null;
  ownedByCenter: boolean;
  notes: string | null;
};

// ---------------------------------------------------------------------------
// Helpers de presentación
// ---------------------------------------------------------------------------

function statusTone(status: AssistiveDeviceStatus): 'green' | 'neutral' {
  return status === 'ACTIVO' ? 'green' : 'neutral';
}

// ---------------------------------------------------------------------------
// Esquemas Zod para formularios del cliente
// ---------------------------------------------------------------------------

const adCreateClientSchema = createAssistiveDeviceSchema.omit({ residentId: true });
const adUpdateClientSchema = updateAssistiveDeviceSchema.omit({ id: true, residentId: true });
const adRetireClientSchema = retireAssistiveDeviceSchema.omit({ id: true, residentId: true });

type AdCreateForm = z.infer<typeof adCreateClientSchema>;
type AdUpdateForm = z.infer<typeof adUpdateClientSchema>;
type AdRetireForm = z.infer<typeof adRetireClientSchema>;

// Todos los tipos de ayuda técnica del enum
const ALL_DEVICE_TYPES: AssistiveDeviceType[] = [
  'SILLA_RUEDAS',
  'ANDADOR',
  'GRUA',
  'CAMA_ARTICULADA',
  'AUDIFONO',
  'OXIGENO',
  'MULETAS',
  'ORTESIS',
  'SILLA_DUCHA',
  'COLCHON_ANTIESCARAS',
  'OTRO',
];

// ---------------------------------------------------------------------------
// Componente principal
// ---------------------------------------------------------------------------

interface AssistiveDevicesTabProps {
  residentId: string;
  canClinical: boolean;
}

export function AssistiveDevicesTab({
  residentId,
  canClinical,
}: AssistiveDevicesTabProps) {
  const { locale, t } = useT();
  const fmtDate = (d: Date | string | null | undefined) => formatDate(locale, d);
  const toast = useToast();
  const utils = api.useUtils();

  const refresh = () =>
    utils.diagnosticos.assistiveDevices.listForResident.invalidate({ residentId });

  // ── Datos ─────────────────────────────────────────────────────────────────
  const { data, isLoading } = api.diagnosticos.assistiveDevices.listForResident.useQuery({
    residentId,
  });

  const activeDevices = (data ?? []).filter((d) => d.status === 'ACTIVO') as DeviceRow[];
  const retiredDevices = (data ?? []).filter((d) => d.status === 'RETIRADO') as DeviceRow[];

  const today = new Date().toISOString().split('T')[0]!;

  // ── Dialog: nueva ayuda técnica ────────────────────────────────────────────
  const [addOpen, setAddOpen] = useState(false);
  const [addFields, setAddFields] = useState<{
    type: string;
    description: string;
    prescribedAt: string;
    ownedByCenter: boolean;
    notes: string;
  }>({
    type: 'SILLA_RUEDAS',
    description: '',
    prescribedAt: today,
    ownedByCenter: false,
    notes: '',
  });
  const addForm = useZodForm(adCreateClientSchema);

  const createDevice = api.diagnosticos.assistiveDevices.create.useMutation({
    onSuccess: async () => {
      setAddOpen(false);
      setAddFields({
        type: 'SILLA_RUEDAS',
        description: '',
        prescribedAt: today,
        ownedByCenter: false,
        notes: '',
      });
      addForm.clearErrors();
      await refresh();
      toast.success(t('exp.ad.form.saved'));
    },
    onError: (e) => toast.error(e.message),
  });

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const payload: AdCreateForm = {
      type: addFields.type as AssistiveDeviceType,
      description: addFields.description || undefined,
      prescribedAt: new Date(addFields.prescribedAt || today),
      ownedByCenter: addFields.ownedByCenter,
      notes: addFields.notes || undefined,
    };
    const data = addForm.validate(payload);
    if (!data) return;
    createDevice.mutate({ residentId, ...data });
  }

  // ── Dialog: editar ayuda técnica ───────────────────────────────────────────
  const [editOpen, setEditOpen] = useState(false);
  const [editId, setEditId] = useState('');
  const [editFields, setEditFields] = useState<{
    description: string;
    ownedByCenter: boolean;
    notes: string;
  }>({ description: '', ownedByCenter: false, notes: '' });
  const editForm = useZodForm(adUpdateClientSchema);

  const updateDevice = api.diagnosticos.assistiveDevices.update.useMutation({
    onSuccess: async () => {
      setEditOpen(false);
      editForm.clearErrors();
      await refresh();
      toast.success(t('exp.ad.form.saved'));
    },
    onError: (e) => toast.error(e.message),
  });

  function openEdit(device: DeviceRow) {
    setEditId(device.id);
    setEditFields({
      description: device.description ?? '',
      ownedByCenter: device.ownedByCenter,
      notes: device.notes ?? '',
    });
    editForm.clearErrors();
    setEditOpen(true);
  }

  function handleUpdate(e: React.FormEvent) {
    e.preventDefault();
    const payload: AdUpdateForm = {
      description: editFields.description || undefined,
      ownedByCenter: editFields.ownedByCenter,
      notes: editFields.notes || undefined,
    };
    const data = editForm.validate(payload);
    if (!data) return;
    updateDevice.mutate({ id: editId, residentId, ...data });
  }

  // ── Dialog: retirar ayuda técnica ─────────────────────────────────────────
  const [retireOpen, setRetireOpen] = useState(false);
  const [retireId, setRetireId] = useState('');
  const [retireFields, setRetireFields] = useState<{
    retiredAt: string;
    notes: string;
  }>({ retiredAt: today, notes: '' });
  const retireForm = useZodForm(adRetireClientSchema);

  const retireDevice = api.diagnosticos.assistiveDevices.retire.useMutation({
    onSuccess: async () => {
      setRetireOpen(false);
      retireForm.clearErrors();
      await refresh();
      toast.success(t('exp.ad.retire.done'));
    },
    onError: (e) => toast.error(e.message),
  });

  function openRetire(device: DeviceRow) {
    setRetireId(device.id);
    setRetireFields({ retiredAt: today, notes: '' });
    retireForm.clearErrors();
    setRetireOpen(true);
  }

  function handleRetire(e: React.FormEvent) {
    e.preventDefault();
    const payload: AdRetireForm = {
      retiredAt: new Date(retireFields.retiredAt || today),
      notes: retireFields.notes || undefined,
    };
    const data = retireForm.validate(payload);
    if (!data) return;
    retireDevice.mutate({ id: retireId, residentId, ...data });
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-4">

      {/* Sección: Activas */}
      <SectionCard
        title={t('exp.ad.section.active')}
        aside={
          canClinical ? (
            <Button size="sm" onClick={() => setAddOpen(true)}>
              {t('exp.ad.add')}
            </Button>
          ) : undefined
        }
      >
        {isLoading ? (
          <p className="text-sm text-[#1A3A3F]/60">{t('state.loading')}</p>
        ) : activeDevices.length === 0 ? (
          <p className="text-sm text-[#1A3A3F]/60">{t('exp.ad.section.active.empty')}</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {activeDevices.map((device) => (
              <DeviceRow
                key={device.id}
                device={device}
                fmtDate={fmtDate}
                t={t}
                canClinical={canClinical}
                onEdit={openEdit}
                onRetire={openRetire}
              />
            ))}
          </ul>
        )}
      </SectionCard>

      {/* Sección: Retiradas */}
      <SectionCard title={t('exp.ad.section.retired')}>
        {isLoading ? (
          <p className="text-sm text-[#1A3A3F]/60">{t('state.loading')}</p>
        ) : retiredDevices.length === 0 ? (
          <p className="text-sm text-[#1A3A3F]/60">{t('exp.ad.section.retired.empty')}</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {retiredDevices.map((device) => (
              <DeviceRow
                key={device.id}
                device={device}
                fmtDate={fmtDate}
                t={t}
                canClinical={canClinical}
                onEdit={openEdit}
                onRetire={openRetire}
              />
            ))}
          </ul>
        )}
      </SectionCard>

      {/* ── Dialog: nueva ayuda técnica ─────────────────────────────────── */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-lg">
          <DialogTitle>{t('exp.ad.form.title')}</DialogTitle>
          <form
            className="mt-3 flex flex-col gap-3"
            noValidate
            onSubmit={handleCreate}
          >
            {/* Tipo */}
            <div>
              <Label htmlFor="ad-type">{t('exp.ad.form.type')}</Label>
              <Select
                id="ad-type"
                value={addFields.type}
                onChange={(e) => setAddFields((s) => ({ ...s, type: e.target.value }))}
              >
                {ALL_DEVICE_TYPES.map((dt) => (
                  <option key={dt} value={dt}>
                    {t(`ad.type.${dt}`)}
                  </option>
                ))}
              </Select>
            </div>

            {/* Descripción */}
            <div>
              <Label htmlFor="ad-desc">{t('exp.ad.form.description')}</Label>
              <Input
                id="ad-desc"
                placeholder={t('exp.ad.form.descriptionPh')}
                maxLength={300}
                value={addFields.description}
                onChange={(e) => setAddFields((s) => ({ ...s, description: e.target.value }))}
              />
            </div>

            {/* Fecha de asignación */}
            <div>
              <Label htmlFor="ad-prescribed">{t('exp.ad.form.prescribedAt')}</Label>
              <Input
                id="ad-prescribed"
                type="date"
                max={today}
                required
                aria-required="true"
                aria-invalid={Boolean(addForm.errors.prescribedAt)}
                aria-describedby={
                  addForm.errors.prescribedAt ? 'ad-prescribed-err' : undefined
                }
                value={addFields.prescribedAt}
                onChange={(e) => setAddFields((s) => ({ ...s, prescribedAt: e.target.value }))}
              />
              <FieldError id="ad-prescribed-err">{addForm.errors.prescribedAt}</FieldError>
            </div>

            {/* Propiedad */}
            <label className="flex min-h-[48px] cursor-pointer items-center gap-3 text-sm">
              <input
                type="checkbox"
                className="h-5 w-5 rounded accent-brand-600"
                checked={addFields.ownedByCenter}
                onChange={(e) =>
                  setAddFields((s) => ({ ...s, ownedByCenter: e.target.checked }))
                }
                aria-label={t('exp.ad.form.ownedByCenter')}
              />
              <span>{t('exp.ad.form.ownedByCenter')}</span>
            </label>

            {/* Notas */}
            <div>
              <Label htmlFor="ad-notes">{t('exp.ad.form.notes')}</Label>
              <Input
                id="ad-notes"
                placeholder={t('exp.ad.form.notesPh')}
                maxLength={500}
                value={addFields.notes}
                onChange={(e) => setAddFields((s) => ({ ...s, notes: e.target.value }))}
              />
            </div>

            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="ghost">{t('action.cancel')}</Button>
              </DialogClose>
              <Button type="submit" disabled={createDevice.isPending}>
                {createDevice.isPending
                  ? t('exp.ad.form.submitting')
                  : t('exp.ad.form.submit')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Dialog: editar ayuda técnica ────────────────────────────────── */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-lg">
          <DialogTitle>{t('exp.ad.form.title')}</DialogTitle>
          <form
            className="mt-3 flex flex-col gap-3"
            noValidate
            onSubmit={handleUpdate}
          >
            <div>
              <Label htmlFor="ade-desc">{t('exp.ad.form.description')}</Label>
              <Input
                id="ade-desc"
                placeholder={t('exp.ad.form.descriptionPh')}
                maxLength={300}
                value={editFields.description}
                onChange={(e) => setEditFields((s) => ({ ...s, description: e.target.value }))}
              />
            </div>
            <label className="flex min-h-[48px] cursor-pointer items-center gap-3 text-sm">
              <input
                type="checkbox"
                className="h-5 w-5 rounded accent-brand-600"
                checked={editFields.ownedByCenter}
                onChange={(e) =>
                  setEditFields((s) => ({ ...s, ownedByCenter: e.target.checked }))
                }
                aria-label={t('exp.ad.form.ownedByCenter')}
              />
              <span>{t('exp.ad.form.ownedByCenter')}</span>
            </label>
            <div>
              <Label htmlFor="ade-notes">{t('exp.ad.form.notes')}</Label>
              <Input
                id="ade-notes"
                placeholder={t('exp.ad.form.notesPh')}
                maxLength={500}
                value={editFields.notes}
                onChange={(e) => setEditFields((s) => ({ ...s, notes: e.target.value }))}
              />
            </div>
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="ghost">{t('action.cancel')}</Button>
              </DialogClose>
              <Button type="submit" disabled={updateDevice.isPending}>
                {updateDevice.isPending
                  ? t('exp.ad.form.submitting')
                  : t('exp.ad.form.submit')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Dialog: retirar ayuda técnica ───────────────────────────────── */}
      <Dialog open={retireOpen} onOpenChange={setRetireOpen}>
        <DialogContent>
          <DialogTitle>{t('exp.ad.retire.title')}</DialogTitle>
          <form
            className="mt-3 flex flex-col gap-3"
            noValidate
            onSubmit={handleRetire}
          >
            <div>
              <Label htmlFor="ad-retiredAt">{t('exp.ad.retire.retiredAt')}</Label>
              <Input
                id="ad-retiredAt"
                type="date"
                max={today}
                required
                aria-required="true"
                aria-invalid={Boolean(retireForm.errors.retiredAt)}
                aria-describedby={
                  retireForm.errors.retiredAt ? 'ad-retiredAt-err' : undefined
                }
                value={retireFields.retiredAt}
                onChange={(e) => setRetireFields((s) => ({ ...s, retiredAt: e.target.value }))}
              />
              <FieldError id="ad-retiredAt-err">{retireForm.errors.retiredAt}</FieldError>
            </div>
            <div>
              <Label htmlFor="ad-retire-notes">{t('exp.ad.retire.notes')}</Label>
              <Input
                id="ad-retire-notes"
                placeholder={t('exp.ad.retire.notesPh')}
                maxLength={500}
                value={retireFields.notes}
                onChange={(e) => setRetireFields((s) => ({ ...s, notes: e.target.value }))}
              />
            </div>
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="ghost">{t('action.cancel')}</Button>
              </DialogClose>
              <Button type="submit" disabled={retireDevice.isPending}>
                {retireDevice.isPending
                  ? t('exp.ad.form.submitting')
                  : t('exp.ad.retire.submit')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Componente de fila de ayuda técnica
// ---------------------------------------------------------------------------

interface DeviceRowProps {
  device: DeviceRow;
  fmtDate: (d: Date | string | null | undefined) => string;
  t: (key: string, vars?: Record<string, string | number>) => string;
  canClinical: boolean;
  onEdit: (device: DeviceRow) => void;
  onRetire: (device: DeviceRow) => void;
}

function DeviceRow({
  device,
  fmtDate,
  t,
  canClinical,
  onEdit,
  onRetire,
}: DeviceRowProps) {
  const isRetired = device.status === 'RETIRADO';

  return (
    <li
      className={`rounded-md border p-3 text-sm ${
        isRetired
          ? 'border-brand-100/40 bg-[#F7F5F0]'
          : 'border-brand-100 bg-brand-50'
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        {/* Columna izquierda: badges + tipo + descripción */}
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={statusTone(device.status)}>
              {t(`ad.status.${device.status}`)}
            </Badge>
            <span className="font-medium text-[#1A3A3F]">
              {t(`ad.type.${device.type}`)}
            </span>
            <Badge tone="neutral">
              {device.ownedByCenter
                ? t('ad.ownership.center')
                : t('ad.ownership.resident')}
            </Badge>
          </div>

          {device.description && (
            <p className="text-[#1A3A3F]/70">{device.description}</p>
          )}

          <div className="flex flex-wrap gap-3 text-xs text-[#1A3A3F]/50">
            <span>
              {t('exp.ad.prescribedAt')} {fmtDate(device.prescribedAt)}
            </span>
            {device.retiredAt && (
              <span>
                {t('exp.ad.retiredAt')} {fmtDate(device.retiredAt)}
              </span>
            )}
          </div>

          {device.notes && (
            <p className="mt-0.5 text-xs text-[#1A3A3F]/60 italic">{device.notes}</p>
          )}
        </div>

        {/* Columna derecha: acciones */}
        {canClinical && (
          <div className="flex shrink-0 flex-wrap gap-2">
            {!isRetired && (
              <>
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label={`Editar: ${t(`ad.type.${device.type}`)}`}
                  onClick={() => onEdit(device)}
                >
                  Editar
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label={`Retirar: ${t(`ad.type.${device.type}`)}`}
                  onClick={() => onRetire(device)}
                >
                  {t('exp.ad.retire.title')}
                </Button>
              </>
            )}
          </div>
        )}
      </div>
    </li>
  );
}
