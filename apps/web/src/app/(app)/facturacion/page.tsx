'use client';

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
  EmptyState,
  FieldError,
  Input,
  Label,
  PageHeader,
  Pagination,
  SectionCard,
  Select,
  Skeleton,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@vetlla/ui';
import type { BillingUnit, InvoiceStatus } from '@vetlla/db';
import { api } from '@/trpc/react';
import { useT } from '@/i18n/provider';
import { useToast } from '@/components/toast';
import { useConfirm } from '@/components/confirm';
import { useZodForm } from '@/lib/form';
import { formatDate, formatEur } from '@/lib/format';

// ---------------------------------------------------------------------------
// Esquemas Zod (reutilizan los del backend — no divergen)
// ---------------------------------------------------------------------------

const tariffCreateSchema = z.object({
  code: z.string().min(1, 'Indica el código.').max(64),
  name: z.string().min(1, 'Indica el nombre.').max(255),
  baseAmount: z.preprocess(
    (v) => (v === '' || v == null ? undefined : Number(v)),
    z.number({ invalid_type_error: 'Introduce el importe.' }).nonnegative('Debe ser positivo o cero.'),
  ),
  unit: z.enum(['MENSUAL', 'DIARIO', 'UNICO']),
  vatPct: z.preprocess(
    (v) => (v === '' || v == null ? 0 : Number(v)),
    z.number().min(0).max(100),
  ),
  vatExempt: z.boolean().default(true),
});

const invoiceDraftSchema = z.object({
  residentId: z.string().min(1, 'Selecciona un residente.'),
  periodYear: z.preprocess(
    (v) => Number(v),
    z.number().int().min(2000).max(2100),
  ),
  periodMonth: z.preprocess(
    (v) => Number(v),
    z.number().int().min(1).max(12),
  ),
  series: z.string().max(10).default('A'),
});

// ---------------------------------------------------------------------------
// Badge de estado de factura
// ---------------------------------------------------------------------------

const STATUS_TONE: Record<InvoiceStatus, 'neutral' | 'blue' | 'green' | 'red'> = {
  DRAFT: 'neutral',
  ISSUED: 'blue',
  PAID: 'green',
  VOID: 'red',
};

function InvoiceStatusBadge({ status, t }: { status: InvoiceStatus; t: (k: string) => string }) {
  return (
    <Badge tone={STATUS_TONE[status]}>
      {t(`invoice.status.${status}`)}
    </Badge>
  );
}

// ---------------------------------------------------------------------------
// Vista de Tarifas
// ---------------------------------------------------------------------------

function TarifasTab() {
  const { t, locale } = useT();
  const toast = useToast();
  const confirm = useConfirm();
  const utils = api.useUtils();

  const [showForm, setShowForm] = useState(false);
  const [includeInactive, setIncludeInactive] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [fields, setFields] = useState({
    code: '',
    name: '',
    baseAmount: '',
    unit: 'MENSUAL' as BillingUnit,
    vatPct: '0',
    vatExempt: true,
  });

  const form = useZodForm(tariffCreateSchema);

  const tariffs = api.facturacion.tariffs.list.useQuery({ includeInactive });
  const me = api.me.useQuery();
  const canManage = me.data?.permissions.includes('billing:manage') ?? false;

  const createTariff = api.facturacion.tariffs.create.useMutation({
    onSuccess: async () => {
      setShowForm(false);
      resetForm();
      await utils.facturacion.tariffs.list.invalidate();
      toast.success(t('billing.tariffs.create'));
    },
    onError: (e) => toast.error(e.message),
  });

  const updateTariff = api.facturacion.tariffs.update.useMutation({
    onSuccess: async () => {
      setEditingId(null);
      resetForm();
      await utils.facturacion.tariffs.list.invalidate();
      toast.success(t('billing.tariffs.create'));
    },
    onError: (e) => toast.error(e.message),
  });

  const archiveTariff = api.facturacion.tariffs.archive.useMutation({
    onSuccess: async () => {
      await utils.facturacion.tariffs.list.invalidate();
      toast.success(t('billing.tariffs.archived'));
    },
    onError: (e) => toast.error(e.message),
  });

  function resetForm() {
    setFields({ code: '', name: '', baseAmount: '', unit: 'MENSUAL', vatPct: '0', vatExempt: true });
    form.clearErrors();
  }

  function startEdit(tariff: NonNullable<(typeof tariffs.data)>[number]) {
    setEditingId(tariff.id);
    setFields({
      code: tariff.code,
      name: tariff.name,
      baseAmount: String(Number(tariff.baseAmount)),
      unit: tariff.unit as BillingUnit,
      vatPct: String(Number(tariff.vatPct)),
      vatExempt: tariff.vatExempt,
    });
    setShowForm(true);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const data = form.validate({
      code: fields.code,
      name: fields.name,
      baseAmount: fields.baseAmount,
      unit: fields.unit,
      vatPct: fields.vatPct,
      vatExempt: fields.vatExempt,
    });
    if (!data) return;
    if (editingId) {
      updateTariff.mutate({ id: editingId, ...data });
    } else {
      createTariff.mutate(data);
    }
  }

  async function handleArchive(id: string, name: string) {
    const ok = await confirm({
      title: t('billing.tariffs.archive'),
      description: `¿Archivar la tarifa "${name}"? Quedará inactiva pero conservada para el historial.`,
      confirmLabel: t('billing.tariffs.archive'),
    });
    if (ok) archiveTariff.mutate({ id });
  }

  const list = tariffs.data ?? [];

  return (
    <div className="flex flex-col gap-4">
      <SectionCard
        title={t('billing.tariffs.title')}
        aside={
          canManage ? (
            <div className="flex items-center gap-2">
              <label className="flex cursor-pointer items-center gap-1.5 text-sm text-[#1A3A3F]/70">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded accent-brand-600"
                  checked={includeInactive}
                  onChange={(e) => setIncludeInactive(e.target.checked)}
                />
                Incluir archivadas
              </label>
              <Button
                size="sm"
                onClick={() => {
                  setEditingId(null);
                  resetForm();
                  setShowForm(true);
                }}
              >
                {t('billing.tariffs.create')}
              </Button>
            </div>
          ) : undefined
        }
      >
        {tariffs.isLoading ? (
          <div className="flex flex-col gap-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full rounded-xl" />
            ))}
          </div>
        ) : list.length === 0 ? (
          <EmptyState title={t('billing.tariffs.empty')} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm" role="table" aria-label={t('billing.tariffs.title')}>
              <thead>
                <tr className="border-b border-brand-100">
                  <th scope="col" className="pb-2 text-left text-xs font-semibold uppercase tracking-wide text-[#1A3A3F]/50">
                    {t('billing.tariffs.code')}
                  </th>
                  <th scope="col" className="pb-2 text-left text-xs font-semibold uppercase tracking-wide text-[#1A3A3F]/50">
                    {t('billing.tariffs.name')}
                  </th>
                  <th scope="col" className="pb-2 text-right text-xs font-semibold uppercase tracking-wide text-[#1A3A3F]/50">
                    {t('billing.tariffs.baseAmount')}
                  </th>
                  <th scope="col" className="pb-2 text-left text-xs font-semibold uppercase tracking-wide text-[#1A3A3F]/50">
                    {t('billing.tariffs.unit')}
                  </th>
                  <th scope="col" className="pb-2 text-center text-xs font-semibold uppercase tracking-wide text-[#1A3A3F]/50">
                    {t('billing.tariffs.active')}
                  </th>
                  {canManage && (
                    <th scope="col" className="pb-2">
                      <span className="sr-only">Acciones</span>
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {list.map((tariff) => (
                  <tr
                    key={tariff.id}
                    className={`border-b border-brand-100/50 last:border-0 ${
                      !tariff.active ? 'opacity-50' : ''
                    }`}
                  >
                    <td className="py-2 font-mono text-xs text-[#1A3A3F]/70">{tariff.code}</td>
                    <td className="py-2 font-medium text-[#1A3A3F]">{tariff.name}</td>
                    <td className="py-2 text-right tabular-nums text-[#1A3A3F]">
                      {formatEur(locale, Number(tariff.baseAmount))}
                    </td>
                    <td className="py-2">
                      <Badge tone="neutral">{t(`billing.unit.${tariff.unit}`)}</Badge>
                    </td>
                    <td className="py-2 text-center">
                      {tariff.active ? (
                        <Badge tone="green">{t('billing.tariffs.vatYes')}</Badge>
                      ) : (
                        <Badge tone="neutral">{t('billing.tariffs.vatNo')}</Badge>
                      )}
                    </td>
                    {canManage && (
                      <td className="py-2">
                        <div className="flex justify-end gap-1.5">
                          <Button size="sm" variant="ghost" onClick={() => startEdit(tariff)}>
                            {t('billing.tariffs.edit')}
                          </Button>
                          {tariff.active && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleArchive(tariff.id, tariff.name)}
                            >
                              {t('billing.tariffs.archive')}
                            </Button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      {/* Formulario crear/editar tarifa */}
      <Dialog
        open={showForm}
        onOpenChange={(open) => {
          if (!open) {
            setShowForm(false);
            setEditingId(null);
            resetForm();
          }
        }}
      >
        <DialogContent>
          <DialogTitle>
            {editingId ? 'Editar tarifa' : t('billing.tariffs.create')}
          </DialogTitle>
          <form id="tariff-form" noValidate onSubmit={handleSubmit} className="flex flex-col gap-4 mt-2">
            <div>
              <Label htmlFor="tariff-code">{t('billing.tariffs.code')}</Label>
              <Input
                id="tariff-code"
                value={fields.code}
                placeholder="CUOTA_PLAZA_MES"
                aria-invalid={Boolean(form.errors.code)}
                aria-describedby={form.errors.code ? 'tariff-code-err' : undefined}
                onChange={(e) => setFields((s) => ({ ...s, code: e.target.value }))}
              />
              <FieldError id="tariff-code-err">{form.errors.code}</FieldError>
            </div>
            <div>
              <Label htmlFor="tariff-name">{t('billing.tariffs.name')}</Label>
              <Input
                id="tariff-name"
                value={fields.name}
                placeholder="Cuota mensual de plaza"
                aria-invalid={Boolean(form.errors.name)}
                aria-describedby={form.errors.name ? 'tariff-name-err' : undefined}
                onChange={(e) => setFields((s) => ({ ...s, name: e.target.value }))}
              />
              <FieldError id="tariff-name-err">{form.errors.name}</FieldError>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="tariff-amount">{t('billing.tariffs.baseAmount')} (€)</Label>
                <Input
                  id="tariff-amount"
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min="0"
                  value={fields.baseAmount}
                  aria-invalid={Boolean(form.errors.baseAmount)}
                  aria-describedby={form.errors.baseAmount ? 'tariff-amount-err' : undefined}
                  onChange={(e) => setFields((s) => ({ ...s, baseAmount: e.target.value }))}
                />
                <FieldError id="tariff-amount-err">{form.errors.baseAmount}</FieldError>
              </div>
              <div>
                <Label htmlFor="tariff-unit">{t('billing.tariffs.unit')}</Label>
                <Select
                  id="tariff-unit"
                  value={fields.unit}
                  onChange={(e) => setFields((s) => ({ ...s, unit: e.target.value as BillingUnit }))}
                >
                  <option value="MENSUAL">{t('billing.unit.MENSUAL')}</option>
                  <option value="DIARIO">{t('billing.unit.DIARIO')}</option>
                  <option value="UNICO">{t('billing.unit.UNICO')}</option>
                </Select>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <label className="flex min-h-[48px] cursor-pointer items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded accent-brand-600"
                  checked={fields.vatExempt}
                  onChange={(e) => setFields((s) => ({ ...s, vatExempt: e.target.checked }))}
                  id="tariff-vatexempt"
                />
                <span>{t('billing.tariffs.vatExempt')}</span>
              </label>
              {!fields.vatExempt && (
                <div className="flex-1">
                  <Label htmlFor="tariff-vatpct">% IVA</Label>
                  <Input
                    id="tariff-vatpct"
                    type="number"
                    inputMode="numeric"
                    min="0"
                    max="100"
                    value={fields.vatPct}
                    onChange={(e) => setFields((s) => ({ ...s, vatPct: e.target.value }))}
                  />
                </div>
              )}
            </div>
          </form>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="secondary" type="button">
                Cancelar
              </Button>
            </DialogClose>
            <Button
              type="submit"
              form="tariff-form"
              disabled={createTariff.isPending || updateTariff.isPending}
            >
              {createTariff.isPending || updateTariff.isPending ? 'Guardando…' : 'Guardar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Vista de Facturas
// ---------------------------------------------------------------------------

const CURRENT_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: 5 }, (_, i) => CURRENT_YEAR - i);
const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);

const MONTH_NAMES_ES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

function FacturasTab() {
  const { t, locale } = useT();
  const toast = useToast();
  const confirm = useConfirm();
  const utils = api.useUtils();

  const [statusFilter, setStatusFilter] = useState<InvoiceStatus | ''>('');
  const [yearFilter, setYearFilter] = useState<number | ''>('');
  const [monthFilter, setMonthFilter] = useState<number | ''>('');
  const [page, setPage] = useState(1);
  const [draftDialogOpen, setDraftDialogOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);

  // Formulario crear borrador
  const [draftFields, setDraftFields] = useState({
    residentId: '',
    periodYear: String(CURRENT_YEAR),
    periodMonth: String(new Date().getMonth() + 1),
    series: 'A',
  });
  const draftForm = useZodForm(invoiceDraftSchema);

  const me = api.me.useQuery();
  const canManage = me.data?.permissions.includes('billing:manage') ?? false;

  const invoices = api.facturacion.invoices.list.useQuery({
    status: statusFilter || undefined,
    periodYear: yearFilter || undefined,
    periodMonth: monthFilter || undefined,
    page,
    pageSize: 20,
  });

  const residents = api.residents.list.useQuery();

  const invoiceDetail = api.facturacion.invoices.get.useQuery(
    { id: detailId! },
    { enabled: detailId !== null },
  );

  const createDraft = api.facturacion.invoices.createDraft.useMutation({
    onSuccess: async () => {
      setDraftDialogOpen(false);
      setDraftFields({ residentId: '', periodYear: String(CURRENT_YEAR), periodMonth: String(new Date().getMonth() + 1), series: 'A' });
      await utils.facturacion.invoices.list.invalidate();
      toast.success(t('billing.invoices.draft.created'));
    },
    onError: (e) => toast.error(e.message),
  });

  const issueInvoice = api.facturacion.invoices.issue.useMutation({
    onSuccess: async () => {
      await utils.facturacion.invoices.list.invalidate();
      if (detailId) await utils.facturacion.invoices.get.invalidate({ id: detailId });
      toast.success(t('billing.invoices.issued'));
    },
    onError: (e) => toast.error(e.message),
  });

  const markPaid = api.facturacion.invoices.markPaid.useMutation({
    onSuccess: async () => {
      await utils.facturacion.invoices.list.invalidate();
      if (detailId) await utils.facturacion.invoices.get.invalidate({ id: detailId });
      toast.success(t('billing.invoices.paid'));
    },
    onError: (e) => toast.error(e.message),
  });

  const voidInvoice = api.facturacion.invoices.void.useMutation({
    onSuccess: async () => {
      await utils.facturacion.invoices.list.invalidate();
      if (detailId) await utils.facturacion.invoices.get.invalidate({ id: detailId });
      toast.success(t('billing.invoices.voided'));
    },
    onError: (e) => toast.error(e.message),
  });

  async function handleIssue(id: string) {
    const ok = await confirm({
      title: t('billing.invoices.issue'),
      description: 'Al emitir, se asigna número correlativo y ya no se puede modificar. ¿Continuar?',
      confirmLabel: t('billing.invoices.issue'),
    });
    if (ok) issueInvoice.mutate({ id });
  }

  async function handleMarkPaid(id: string) {
    const ok = await confirm({
      title: t('billing.invoices.markPaid'),
      description: '¿Registrar el cobro de esta factura?',
      confirmLabel: t('billing.invoices.markPaid'),
    });
    if (ok) markPaid.mutate({ id });
  }

  async function handleVoid(id: string) {
    const result = await confirm({
      title: t('billing.invoices.void'),
      description: 'La anulación es irreversible. La factura quedará como VOID en el histórico.',
      confirmLabel: t('billing.invoices.void'),
      tone: 'danger',
      reason: {
        label: t('billing.invoices.voidReason'),
        required: true,
        placeholder: 'Indica el motivo de la anulación…',
      },
    });
    if (result?.reason) voidInvoice.mutate({ id, voidReason: result.reason });
  }

  function handleDraftSubmit(e: React.FormEvent) {
    e.preventDefault();
    const data = draftForm.validate(draftFields);
    if (!data) return;
    createDraft.mutate({
      residentId: data.residentId,
      periodYear: data.periodYear as number,
      periodMonth: data.periodMonth as number,
      series: data.series ?? 'A',
    });
  }

  const list = invoices.data?.items ?? [];
  const totalPages = invoices.data?.totalPages ?? 1;
  const total = invoices.data?.total ?? 0;
  const detail = invoiceDetail.data;

  return (
    <div className="flex flex-col gap-4">
      {/* Filtros */}
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="filter-status" className="sr-only">{t('billing.invoices.status')}</label>
          <Select
            id="filter-status"
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value as InvoiceStatus | ''); setPage(1); }}
            className="w-auto min-w-[10rem]"
          >
            <option value="">{t('billing.invoices.status')}: Todos</option>
            {(['DRAFT', 'ISSUED', 'PAID', 'VOID'] as const).map((s) => (
              <option key={s} value={s}>{t(`invoice.status.${s}`)}</option>
            ))}
          </Select>
        </div>
        <div>
          <label htmlFor="filter-year" className="sr-only">Año</label>
          <Select
            id="filter-year"
            value={String(yearFilter)}
            onChange={(e) => { setYearFilter(e.target.value ? Number(e.target.value) : ''); setPage(1); }}
            className="w-auto"
          >
            <option value="">{t('billing.filter.yearAll')}</option>
            {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
          </Select>
        </div>
        {yearFilter && (
          <div>
            <label htmlFor="filter-month" className="sr-only">Mes</label>
            <Select
              id="filter-month"
              value={String(monthFilter)}
              onChange={(e) => { setMonthFilter(e.target.value ? Number(e.target.value) : ''); setPage(1); }}
              className="w-auto"
            >
              <option value="">{t('billing.filter.monthAll')}</option>
              {MONTHS.map((m) => (
                <option key={m} value={m}>{MONTH_NAMES_ES[m - 1]}</option>
              ))}
            </Select>
          </div>
        )}
        {canManage && (
          <Button onClick={() => setDraftDialogOpen(true)} className="ml-auto">
            {t('billing.invoices.createDraft')}
          </Button>
        )}
      </div>

      {/* Tabla de facturas */}
      <SectionCard title={`${t('billing.invoices.title')}${total > 0 ? ` (${total})` : ''}`}>
        {invoices.isLoading ? (
          <div className="flex flex-col gap-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full rounded-xl" />
            ))}
          </div>
        ) : list.length === 0 ? (
          <EmptyState title={t('billing.invoices.empty')} />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm" role="table" aria-label={t('billing.invoices.title')}>
                <thead>
                  <tr className="border-b border-brand-100">
                    <th scope="col" className="pb-2 text-left text-xs font-semibold uppercase tracking-wide text-[#1A3A3F]/50">
                      {t('billing.invoices.number')}
                    </th>
                    <th scope="col" className="pb-2 text-left text-xs font-semibold uppercase tracking-wide text-[#1A3A3F]/50">
                      Residente
                    </th>
                    <th scope="col" className="pb-2 text-left text-xs font-semibold uppercase tracking-wide text-[#1A3A3F]/50">
                      {t('billing.invoices.period')}
                    </th>
                    <th scope="col" className="pb-2 text-right text-xs font-semibold uppercase tracking-wide text-[#1A3A3F]/50">
                      {t('billing.invoices.total')}
                    </th>
                    <th scope="col" className="pb-2 text-center text-xs font-semibold uppercase tracking-wide text-[#1A3A3F]/50">
                      {t('billing.invoices.status')}
                    </th>
                    <th scope="col" className="pb-2">
                      <span className="sr-only">Acciones</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((inv) => {
                    const numLabel = inv.invoiceNumber
                      ? `${inv.series}-${inv.invoiceYear}-${String(inv.invoiceNumber).padStart(4, '0')}`
                      : `${t('invoice.status.DRAFT')}`;
                    return (
                      <tr
                        key={inv.id}
                        className="border-b border-brand-100/50 last:border-0 hover:bg-brand-50/40 transition-smooth"
                      >
                        <td className="py-2.5">
                          <button
                            type="button"
                            className="font-mono text-xs text-brand-700 hover:underline focus-visible:underline"
                            onClick={() => setDetailId(inv.id)}
                            aria-label={`Ver factura ${numLabel}`}
                          >
                            {numLabel}
                          </button>
                        </td>
                        <td className="py-2.5 text-[#1A3A3F]">
                          {inv.resident.firstName} {inv.resident.lastName}
                        </td>
                        <td className="py-2.5 text-[#1A3A3F]/70">
                          {formatDate(locale, inv.periodStart)} – {formatDate(locale, inv.periodEnd)}
                        </td>
                        <td className="py-2.5 text-right tabular-nums font-medium text-[#1A3A3F]">
                          {formatEur(locale, Number(inv.totalAmount))}
                        </td>
                        <td className="py-2.5 text-center">
                          <InvoiceStatusBadge status={inv.status as InvoiceStatus} t={t} />
                        </td>
                        {canManage && (
                          <td className="py-2.5">
                            <div className="flex justify-end gap-1">
                              {inv.status === 'DRAFT' && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  disabled={issueInvoice.isPending}
                                  onClick={() => handleIssue(inv.id)}
                                >
                                  {t('billing.invoices.issue')}
                                </Button>
                              )}
                              {inv.status === 'ISSUED' && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  disabled={markPaid.isPending}
                                  onClick={() => handleMarkPaid(inv.id)}
                                >
                                  {t('billing.invoices.markPaid')}
                                </Button>
                              )}
                              {(inv.status === 'ISSUED' || inv.status === 'PAID') && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  disabled={voidInvoice.isPending}
                                  onClick={() => handleVoid(inv.id)}
                                >
                                  {t('billing.invoices.void')}
                                </Button>
                              )}
                            </div>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {totalPages > 1 && (
              <div className="mt-4 flex justify-center">
                <Pagination
                  page={page}
                  pageCount={totalPages}
                  onPageChange={setPage}
                  label="Paginación de facturas"
                />
              </div>
            )}
          </>
        )}
      </SectionCard>

      {/* Dialog crear borrador */}
      <Dialog open={draftDialogOpen} onOpenChange={(open) => { if (!open) { setDraftDialogOpen(false); draftForm.clearErrors(); } }}>
        <DialogContent>
          <DialogTitle>{t('billing.invoices.createDraft')}</DialogTitle>
          <form id="draft-form" noValidate onSubmit={handleDraftSubmit} className="flex flex-col gap-4 mt-2">
            <div>
              <Label htmlFor="draft-resident">{t('billing.invoices.resident')}</Label>
              <Select
                id="draft-resident"
                value={draftFields.residentId}
                aria-invalid={Boolean(draftForm.errors.residentId)}
                aria-describedby={draftForm.errors.residentId ? 'draft-resident-err' : undefined}
                onChange={(e) => setDraftFields((s) => ({ ...s, residentId: e.target.value }))}
              >
                <option value="">Selecciona un residente…</option>
                {(residents.data ?? []).map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.firstName} {r.lastName}
                  </option>
                ))}
              </Select>
              <FieldError id="draft-resident-err">{draftForm.errors.residentId}</FieldError>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="draft-year">{t('billing.invoices.year')}</Label>
                <Select
                  id="draft-year"
                  value={draftFields.periodYear}
                  onChange={(e) => setDraftFields((s) => ({ ...s, periodYear: e.target.value }))}
                >
                  {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
                </Select>
              </div>
              <div>
                <Label htmlFor="draft-month">{t('billing.invoices.month')}</Label>
                <Select
                  id="draft-month"
                  value={draftFields.periodMonth}
                  onChange={(e) => setDraftFields((s) => ({ ...s, periodMonth: e.target.value }))}
                >
                  {MONTHS.map((m) => (
                    <option key={m} value={m}>{MONTH_NAMES_ES[m - 1]}</option>
                  ))}
                </Select>
              </div>
            </div>
            <div>
              <Label htmlFor="draft-series">{t('billing.invoices.series')}</Label>
              <Input
                id="draft-series"
                value={draftFields.series}
                maxLength={10}
                onChange={(e) => setDraftFields((s) => ({ ...s, series: e.target.value }))}
              />
            </div>
          </form>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="secondary" type="button">{t('action.cancel')}</Button>
            </DialogClose>
            <Button type="submit" form="draft-form" disabled={createDraft.isPending}>
              {createDraft.isPending ? t('billing.invoices.creating') : t('billing.invoices.createDraft')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog detalle de factura */}
      <Dialog open={detailId !== null} onOpenChange={(open) => { if (!open) setDetailId(null); }}>
        <DialogContent>
          {invoiceDetail.isLoading ? (
            <div className="flex flex-col gap-2">
              <Skeleton className="h-6 w-48" />
              <Skeleton className="h-32 w-full rounded-xl" />
            </div>
          ) : detail ? (
            <>
              <DialogTitle>
                {t('billing.invoices.draft.title')}{' '}
                {detail.invoiceNumber
                  ? `${detail.series}-${detail.invoiceYear}-${String(detail.invoiceNumber).padStart(4, '0')}`
                  : `(${t('invoice.status.DRAFT')})`}
              </DialogTitle>

              <div className="flex flex-col gap-3 text-sm mt-2">
                {/* Estado y metadata */}
                <div className="flex flex-wrap items-center gap-2">
                  <InvoiceStatusBadge status={detail.status as InvoiceStatus} t={t} />
                  <span className="text-[#1A3A3F]/60">
                    {detail.resident.firstName} {detail.resident.lastName}
                  </span>
                  <span className="text-[#1A3A3F]/40">
                    {t('billing.invoices.period')}: {formatDate(locale, detail.periodStart)} – {formatDate(locale, detail.periodEnd)}
                  </span>
                </div>

                {detail.issuedAt && (
                  <p className="text-[#1A3A3F]/60">
                    {t('billing.invoices.issuedAt')}: {formatDate(locale, detail.issuedAt)}
                  </p>
                )}
                {detail.dueAt && (
                  <p className="text-[#1A3A3F]/60">
                    {t('billing.invoices.dueAt')}: {formatDate(locale, detail.dueAt)}
                  </p>
                )}
                <p className="text-[#1A3A3F]/60">
                  {t('billing.invoices.payer')} <Badge tone="neutral">{t(`payer.type.${detail.payerType}`)}</Badge>
                  {detail.payerName && <span className="ml-1">{detail.payerName}</span>}
                </p>

                {/* Líneas */}
                <div className="rounded-xl border border-brand-100 overflow-hidden">
                  <table className="w-full text-xs" aria-label="Líneas de la factura">
                    <thead>
                      <tr className="bg-brand-50">
                        <th scope="col" className="px-3 py-2 text-left font-semibold text-[#1A3A3F]/60">{t('billing.invoices.concept')}</th>
                        <th scope="col" className="px-3 py-2 text-right font-semibold text-[#1A3A3F]/60">{t('billing.invoices.base')}</th>
                        <th scope="col" className="px-3 py-2 text-right font-semibold text-[#1A3A3F]/60">{t('billing.invoices.vat')}</th>
                        <th scope="col" className="px-3 py-2 text-right font-semibold text-[#1A3A3F]/60">{t('billing.invoices.lineTotal')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.lines.map((line) => (
                        <tr key={line.id} className="border-t border-brand-100/60">
                          <td className="px-3 py-2 text-[#1A3A3F]">
                            {line.description}
                            {line.vatExempt && <span className="ml-1 text-[#1A3A3F]/40">{t('billing.invoices.exempt')}</span>}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">{formatEur(locale, Number(line.lineBase))}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{formatEur(locale, Number(line.lineVat))}</td>
                          <td className="px-3 py-2 text-right tabular-nums font-medium">{formatEur(locale, Number(line.lineTotal))}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-brand-200 bg-brand-50/50">
                        <td className="px-3 py-2 font-semibold text-[#1A3A3F]" colSpan={2}>{t('billing.invoices.grandTotal')}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-[#1A3A3F]/60">{formatEur(locale, Number(detail.vatAmount))}</td>
                        <td className="px-3 py-2 text-right tabular-nums font-bold text-[#1A3A3F]">{formatEur(locale, Number(detail.totalAmount))}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>

                {/* Acciones según estado */}
                {canManage && (
                  <div className="flex flex-wrap gap-2 pt-1">
                    {detail.status === 'DRAFT' && (
                      <Button
                        size="sm"
                        disabled={issueInvoice.isPending}
                        onClick={() => handleIssue(detail.id)}
                      >
                        {t('billing.invoices.issue')}
                      </Button>
                    )}
                    {detail.status === 'ISSUED' && (
                      <Button
                        size="sm"
                        disabled={markPaid.isPending}
                        onClick={() => handleMarkPaid(detail.id)}
                      >
                        {t('billing.invoices.markPaid')}
                      </Button>
                    )}
                    {(detail.status === 'ISSUED' || detail.status === 'PAID') && (
                      <Button
                        size="sm"
                        variant="danger"
                        disabled={voidInvoice.isPending}
                        onClick={() => handleVoid(detail.id)}
                      >
                        {t('billing.invoices.void')}
                      </Button>
                    )}
                  </div>
                )}
              </div>

              <DialogFooter>
                <DialogClose asChild>
                  <Button variant="secondary" type="button">{t('action.close')}</Button>
                </DialogClose>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Página principal de facturación
// ---------------------------------------------------------------------------

export default function FacturacionPage() {
  const { t } = useT();
  const me = api.me.useQuery();
  const canRead = me.data?.permissions.includes('billing:read') ?? false;

  if (me.isLoading) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-48 w-full rounded-2xl" />
      </div>
    );
  }

  if (!canRead) {
    return (
      <EmptyState
        title={t('billing.access.restricted')}
        description={t('billing.access.noPermission')}
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t('nav.facturacion')} accent />

      <Tabs defaultValue="facturas" className="flex flex-col gap-2">
        <TabsList>
          <TabsTrigger value="facturas">{t('billing.invoices.title')}</TabsTrigger>
          <TabsTrigger value="tarifas">{t('billing.tariffs.title')}</TabsTrigger>
        </TabsList>

        <TabsContent value="facturas">
          <FacturasTab />
        </TabsContent>

        <TabsContent value="tarifas">
          <TarifasTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
