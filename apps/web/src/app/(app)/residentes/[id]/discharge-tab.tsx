'use client';

/**
 * DischargeTab — pestaña "Bajas" del expediente del residente.
 *
 * Accesible (WCAG 2.1 AA): roles, aria, foco, objetivos táctiles ≥48 px.
 * Lenguaje: respetuoso en caso de defunción.
 * STAFF-ONLY: el familiar no accede nunca a esta pestaña.
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
import type { DischargeType } from '@vetlla/db';
import { api } from '@/trpc/react';
import { useT } from '@/i18n/provider';
import { useToast } from '@/components/toast';
import { useConfirm } from '@/components/confirm';
import { useZodForm } from '@/lib/form';
import { formatDate } from '@/lib/format';
import { RegisterDischargeInput } from '@/server/routers/discharge';
import { DISCHARGE_TYPE_LABELS } from '@/lib/labels';

// ---------------------------------------------------------------------------
// Esquema local (reutiliza RegisterDischargeInput del backend)
// ---------------------------------------------------------------------------

const dischargeFormSchema = RegisterDischargeInput.omit({ residentId: true });
type DischargeFormValues = z.infer<typeof dischargeFormSchema>;

// Tipos de baja ordenados para el selector
const DISCHARGE_TYPES: DischargeType[] = [
  'DEFUNCION',
  'VOLUNTARIA',
  'TRASLADO_CENTRO',
  'TRASLADO_HOSPITAL',
  'FIN_ESTANCIA',
  'OTRO',
];

interface DischargeTabProps {
  residentId: string;
  residentStatus: string;
  canWrite: boolean;
}

// ---------------------------------------------------------------------------
// Chip de tipo de baja
// ---------------------------------------------------------------------------
function DischargeTypeBadge({ type }: { type: string }) {
  const tone = type === 'DEFUNCION' ? 'neutral' : type.startsWith('TRASLADO') ? 'blue' : 'neutral';
  return (
    <Badge tone={tone as 'neutral' | 'blue'}>
      {DISCHARGE_TYPE_LABELS[type] ?? type}
    </Badge>
  );
}

// ---------------------------------------------------------------------------
// Componente principal
// ---------------------------------------------------------------------------
export function DischargeTab({ residentId, residentStatus, canWrite }: DischargeTabProps) {
  const { t, locale } = useT();
  const toast = useToast();
  const confirm = useConfirm();
  const utils = api.useUtils();

  const fmtDate = (d: Date | string | null | undefined) => formatDate(locale, d);
  const today = new Date().toISOString().slice(0, 16); // datetime-local

  // ── queries ───────────────────────────────────────────────────────────────
  const history = api.discharge.listByResident.useQuery({ residentId });

  // ── dialog ────────────────────────────────────────────────────────────────
  const [open, setOpen] = useState(false);
  const [dischargeType, setDischargeType] = useState<DischargeType>('VOLUNTARIA');
  const [fields, setFields] = useState({
    dischargedAt: today,
    reason: '',
    certifiedBy: '',
    destination: '',
    familyNotifiedAt: '',
    belongingsReturned: false,
    notes: '',
  });

  const form = useZodForm(dischargeFormSchema);

  // ── mutation ──────────────────────────────────────────────────────────────
  const register = api.discharge.register.useMutation({
    onSuccess: async () => {
      setOpen(false);
      resetFields();
      await Promise.all([
        utils.discharge.listByResident.invalidate({ residentId }),
        utils.residents.get.invalidate({ id: residentId }),
      ]);
      toast.success(t('exp.discharge.saved'));
    },
    onError: (e) => toast.error(e.message),
  });

  function resetFields() {
    setDischargeType('VOLUNTARIA');
    setFields({
      dischargedAt: today,
      reason: '',
      certifiedBy: '',
      destination: '',
      familyNotifiedAt: '',
      belongingsReturned: false,
      notes: '',
    });
    form.clearErrors();
  }

  const isDefuncion = dischargeType === 'DEFUNCION';
  const isTraslado = dischargeType === 'TRASLADO_CENTRO' || dischargeType === 'TRASLADO_HOSPITAL';

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const values: DischargeFormValues = {
      type: dischargeType,
      dischargedAt: new Date(fields.dischargedAt),
      reason: fields.reason || undefined,
      certifiedBy: fields.certifiedBy || undefined,
      destination: fields.destination || undefined,
      familyNotifiedAt: fields.familyNotifiedAt ? new Date(fields.familyNotifiedAt) : undefined,
      belongingsReturned: fields.belongingsReturned,
      notes: fields.notes || undefined,
    };
    const data = form.validate(values);
    if (!data) return;

    const confirmed = await confirm({
      title: t('exp.discharge.confirm.title'),
      description: t('exp.discharge.confirm.desc'),
      confirmLabel: t('exp.discharge.confirm.button'),
      tone: 'danger',
    });
    if (!confirmed) return;

    register.mutate({ residentId, ...data });
  }

  // ── render ────────────────────────────────────────────────────────────────
  const isActivo = residentStatus === 'ACTIVO';

  return (
    <div className="flex flex-col gap-4">
      {/* Cabecera con botón de acción */}
      <SectionCard
        title={t('exp.discharge.title')}
        aside={canWrite && isActivo ? (
          <Button
            size="sm"
            variant="danger"
            onClick={() => setOpen(true)}
            aria-haspopup="dialog"
          >
            {t('exp.discharge.register')}
          </Button>
        ) : undefined}
      >
          {/* Histórico */}
          <section aria-label={t('exp.discharge.history.title')}>
            <h3 className="mb-2 text-sm font-semibold text-[#1A3A3F]">
              {t('exp.discharge.history.title')}
            </h3>
            {history.isLoading ? (
              <p className="text-sm text-[#1A3A3F]/60">Cargando…</p>
            ) : (history.data ?? []).length === 0 ? (
              <p className="text-sm text-[#1A3A3F]/60">{t('exp.discharge.history.empty')}</p>
            ) : (
              <ul className="flex flex-col gap-3 text-sm">
                {(history.data ?? []).map((d) => (
                  <li
                    key={d.id}
                    className="rounded-md border border-brand-100 p-3"
                    aria-label={`${DISCHARGE_TYPE_LABELS[d.type] ?? d.type} — ${fmtDate(d.dischargedAt)}`}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <DischargeTypeBadge type={d.type} />
                      <span className="text-[#1A3A3F]/60">{fmtDate(d.dischargedAt)}</span>
                      {d.belongingsReturned && (
                        <Badge tone="green">Pertenencias devueltas</Badge>
                      )}
                    </div>
                    {d.type === 'DEFUNCION' && (
                      <p className="mt-1 text-xs italic text-[#1A3A3F]/60">
                        {t('exp.discharge.defuncion.note')}
                      </p>
                    )}
                    {d.certifiedBy && (
                      <p className="mt-1 text-xs text-[#1A3A3F]/70">
                        {t('exp.discharge.field.certifiedBy')}: {d.certifiedBy}
                      </p>
                    )}
                    {d.destination && (
                      <p className="mt-1 text-xs text-[#1A3A3F]/70">
                        {t('exp.discharge.field.destination')}: {d.destination}
                      </p>
                    )}
                    {d.reason && (
                      <p className="mt-1 text-xs text-[#1A3A3F]/70">
                        {t('exp.discharge.field.reason')}: {d.reason}
                      </p>
                    )}
                    {d.notes && (
                      <p className="mt-1 text-xs text-[#1A3A3F]/60">{d.notes}</p>
                    )}
                    {d.recordedBy && (
                      <p className="mt-1 text-xs text-[#1A3A3F]/40">
                        Registrado por {d.recordedBy.name ?? d.recordedBy.id}
                        {d.recordedBy.jobTitle ? ` (${d.recordedBy.jobTitle})` : ''}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
      </SectionCard>

      {/* Dialog de registro de baja */}
      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetFields(); }}>
        <DialogContent className="max-w-lg">
          <DialogTitle>{t('exp.discharge.register')}</DialogTitle>

          {/* Nota de acción irreversible */}
          <p className="mt-1 rounded-md border border-warm-300 bg-warm-50 px-3 py-2 text-xs text-warm-800" role="note">
            {t('exp.discharge.confirm.desc')}
          </p>

          <form
            className="mt-3 flex flex-col gap-3"
            noValidate
            onSubmit={(e) => void handleSubmit(e)}
          >
            {/* Tipo de baja */}
            <div>
              <Label htmlFor="disc-type">{t('exp.discharge.field.type')}</Label>
              <Select
                id="disc-type"
                value={dischargeType}
                onChange={(e) => setDischargeType(e.target.value as DischargeType)}
              >
                {DISCHARGE_TYPES.map((dt) => (
                  <option key={dt} value={dt}>
                    {DISCHARGE_TYPE_LABELS[dt] ?? dt}
                  </option>
                ))}
              </Select>
            </div>

            {/* Nota de respeto para defunción */}
            {isDefuncion && (
              <p className="rounded-md bg-brand-50 px-3 py-2 text-xs text-[#1A3A3F]/70" role="note">
                {t('exp.discharge.defuncion.note')}
              </p>
            )}

            {/* Fecha y hora */}
            <div>
              <Label htmlFor="disc-at">{t('exp.discharge.field.dischargedAt')}</Label>
              <Input
                id="disc-at"
                type="datetime-local"
                value={fields.dischargedAt}
                onChange={(e) => setFields((s) => ({ ...s, dischargedAt: e.target.value }))}
              />
            </div>

            {/* Médico certificante (solo DEFUNCION) */}
            {isDefuncion && (
              <div>
                <Label htmlFor="disc-cert">
                  {t('exp.discharge.field.certifiedBy')}
                  <span className="ml-1 text-xs text-[#1A3A3F]/50">({t('exp.discharge.field.certifiedByHint')})</span>
                </Label>
                <Input
                  id="disc-cert"
                  placeholder="Dr./Dra. …"
                  value={fields.certifiedBy}
                  onChange={(e) => setFields((s) => ({ ...s, certifiedBy: e.target.value }))}
                />
              </div>
            )}

            {/* Destino (solo traslado) */}
            {isTraslado && (
              <div>
                <Label htmlFor="disc-dest">
                  {t('exp.discharge.field.destination')}
                  <span className="ml-1 text-xs text-[#1A3A3F]/50">({t('exp.discharge.field.destinationHint')})</span>
                </Label>
                <Input
                  id="disc-dest"
                  placeholder="Nombre del centro u hospital…"
                  value={fields.destination}
                  onChange={(e) => setFields((s) => ({ ...s, destination: e.target.value }))}
                />
              </div>
            )}

            {/* Motivo */}
            <div>
              <Label htmlFor="disc-reason">{t('exp.discharge.field.reason')}</Label>
              <Input
                id="disc-reason"
                placeholder="Motivo de la baja…"
                value={fields.reason}
                onChange={(e) => setFields((s) => ({ ...s, reason: e.target.value }))}
              />
            </div>

            {/* Pertenencias devueltas */}
            <label className="flex min-h-[48px] cursor-pointer items-center gap-3 text-sm">
              <input
                type="checkbox"
                className="h-5 w-5 rounded accent-brand-600"
                checked={fields.belongingsReturned}
                onChange={(e) => setFields((s) => ({ ...s, belongingsReturned: e.target.checked }))}
                aria-label={t('exp.discharge.field.belongingsReturned')}
              />
              <span className="text-[#1A3A3F]">{t('exp.discharge.field.belongingsReturned')}</span>
            </label>

            {/* Notificación a familia */}
            <div>
              <Label htmlFor="disc-family">{t('exp.discharge.field.familyNotifiedAt')}</Label>
              <Input
                id="disc-family"
                type="datetime-local"
                value={fields.familyNotifiedAt}
                onChange={(e) => setFields((s) => ({ ...s, familyNotifiedAt: e.target.value }))}
              />
            </div>

            {/* Notas */}
            <div>
              <Label htmlFor="disc-notes">{t('exp.discharge.field.notes')}</Label>
              <Input
                id="disc-notes"
                placeholder="Notas adicionales…"
                value={fields.notes}
                onChange={(e) => setFields((s) => ({ ...s, notes: e.target.value }))}
              />
              <FieldError>{form.errors._form}</FieldError>
            </div>

            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="ghost">Cancelar</Button>
              </DialogClose>
              <Button type="submit" variant="danger" disabled={register.isPending}>
                {register.isPending ? 'Registrando…' : t('exp.discharge.confirm.button')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
