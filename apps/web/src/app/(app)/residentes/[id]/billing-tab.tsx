'use client';

import { useState, useEffect } from 'react';
import { z } from 'zod';
import {
  Badge,
  Button,
  FieldError,
  Input,
  Label,
  SectionCard,
  Select,
  Skeleton,
} from '@vetlla/ui';
import type { PayerType } from '@vetlla/db';
import { api } from '@/trpc/react';
import { useT } from '@/i18n/provider';
import { useToast } from '@/components/toast';
import { useZodForm } from '@/lib/form';
import { formatEur } from '@/lib/format';

// ---------------------------------------------------------------------------
// Esquema (reutiliza shape del backend, validación en cliente)
// ---------------------------------------------------------------------------

const profileSchema = z.object({
  tariffId: z.string().min(1).optional().or(z.literal('')),
  publicCopayPct: z.preprocess(
    (v) => (v === '' || v == null ? 0 : Number(v)),
    z.number().min(0, 'Mínimo 0').max(100, 'Máximo 100'),
  ),
  privatePct: z.preprocess(
    (v) => (v === '' || v == null ? 100 : Number(v)),
    z.number().min(0).max(100),
  ),
  payerType: z.enum(['RESIDENTE', 'FAMILIAR', 'ADMINISTRACION']),
  payerName: z.string().max(255).optional().or(z.literal('')),
  sepaMandate: z.string().max(35).optional().or(z.literal('')),
  notes: z.string().max(1000).optional().or(z.literal('')),
});

// ---------------------------------------------------------------------------
// Componente
// ---------------------------------------------------------------------------

interface BillingTabProps {
  residentId: string;
}

export function BillingTab({ residentId }: BillingTabProps) {
  const { t, locale } = useT();
  const toast = useToast();
  const utils = api.useUtils();

  const me = api.me.useQuery();
  const canRead = me.data?.permissions.includes('billing:read') ?? false;
  const canManage = me.data?.permissions.includes('billing:manage') ?? false;

  const profile = api.facturacion.residentBillingProfile.get.useQuery(
    { residentId },
    { enabled: canRead },
  );

  const tariffs = api.facturacion.tariffs.list.useQuery(
    { includeInactive: false },
    { enabled: canManage },
  );

  const [fields, setFields] = useState({
    tariffId: '',
    publicCopayPct: '0',
    privatePct: '100',
    payerType: 'FAMILIAR' as PayerType,
    payerName: '',
    sepaMandate: '',
    notes: '',
  });

  const [initialized, setInitialized] = useState(false);
  const form = useZodForm(profileSchema);

  // Initialize form from loaded profile
  const profileData = profile.data;
  useEffect(() => {
    if (profileData && !initialized) {
      setFields({
        tariffId: profileData.tariffId ?? '',
        publicCopayPct: String(Number(profileData.publicCopayPct)),
        privatePct: String(Number(profileData.privatePct)),
        payerType: profileData.payerType as PayerType,
        payerName: profileData.payerName ?? '',
        sepaMandate: profileData.sepaMandate ?? '',
        notes: profileData.notes ?? '',
      });
      setInitialized(true);
    }
    if (!profileData && !profile.isLoading && !initialized) {
      setInitialized(true);
    }
  }, [profileData, profile.isLoading, initialized]);

  const upsert = api.facturacion.residentBillingProfile.upsert.useMutation({
    onSuccess: async () => {
      await utils.facturacion.residentBillingProfile.get.invalidate({ residentId });
      toast.success(t('billing.profile.saved'));
    },
    onError: (e) => toast.error(e.message),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const data = form.validate({
      tariffId: fields.tariffId || undefined,
      publicCopayPct: fields.publicCopayPct,
      privatePct: fields.privatePct,
      payerType: fields.payerType,
      payerName: fields.payerName || undefined,
      sepaMandate: fields.sepaMandate || undefined,
      notes: fields.notes || undefined,
    });
    if (!data) return;
    upsert.mutate({
      residentId,
      tariffId: data.tariffId || undefined,
      publicCopayPct: data.publicCopayPct as number,
      privatePct: data.privatePct as number,
      payerType: data.payerType as PayerType,
      payerName: data.payerName as string | undefined,
      sepaMandate: data.sepaMandate as string | undefined,
      notes: data.notes as string | undefined,
    });
  }

  if (!canRead) {
    return (
      <p className="text-sm text-[#1A3A3F]/60">
        Tu rol no tiene acceso a la información de facturación.
      </p>
    );
  }

  if (profile.isLoading || !initialized) {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-3/4" />
        <Skeleton className="h-10 w-1/2" />
      </div>
    );
  }

  const tariffList = tariffs.data ?? [];
  const selectedTariff = tariffList.find((t) => t.id === fields.tariffId);

  return (
    <form noValidate onSubmit={handleSubmit} className="flex flex-col gap-4">
      <SectionCard title={t('billing.profile.title')}>
        <div className="grid gap-4 sm:grid-cols-2">
          {/* Tarifa aplicable */}
          <div className="sm:col-span-2">
            <Label htmlFor="billing-tariff">{t('billing.profile.tariff')}</Label>
            <Select
              id="billing-tariff"
              value={fields.tariffId}
              disabled={!canManage}
              onChange={(e) => setFields((s) => ({ ...s, tariffId: e.target.value }))}
            >
              <option value="">Sin tarifa asignada</option>
              {tariffList.map((tariff) => (
                <option key={tariff.id} value={tariff.id}>
                  {tariff.code} — {tariff.name} ({formatEur(locale, Number(tariff.baseAmount))}/{t(`billing.unit.${tariff.unit}`)})
                </option>
              ))}
            </Select>
            {selectedTariff && (
              <p className="mt-1 text-xs text-[#1A3A3F]/60">
                Tarifa seleccionada: {formatEur(locale, Number(selectedTariff.baseAmount))} /{' '}
                {t(`billing.unit.${selectedTariff.unit}`)}
                {selectedTariff.vatExempt && (
                  <Badge tone="neutral" className="ml-2">{t('billing.tariffs.vatExempt')}</Badge>
                )}
              </p>
            )}
          </div>

          {/* % aportación pública */}
          <div>
            <Label htmlFor="billing-public-pct">{t('billing.profile.publicCopayPct')} (%)</Label>
            <Input
              id="billing-public-pct"
              type="number"
              inputMode="decimal"
              min="0"
              max="100"
              step="0.1"
              value={fields.publicCopayPct}
              disabled={!canManage}
              aria-invalid={Boolean(form.errors.publicCopayPct)}
              aria-describedby={form.errors.publicCopayPct ? 'billing-public-pct-err' : undefined}
              onChange={(e) => setFields((s) => ({ ...s, publicCopayPct: e.target.value }))}
            />
            <FieldError id="billing-public-pct-err">{form.errors.publicCopayPct}</FieldError>
          </div>

          {/* % aportación privada */}
          <div>
            <Label htmlFor="billing-private-pct">{t('billing.profile.privatePct')} (%)</Label>
            <Input
              id="billing-private-pct"
              type="number"
              inputMode="decimal"
              min="0"
              max="100"
              step="0.1"
              value={fields.privatePct}
              disabled={!canManage}
              aria-invalid={Boolean(form.errors.privatePct)}
              aria-describedby={form.errors.privatePct ? 'billing-private-pct-err' : undefined}
              onChange={(e) => setFields((s) => ({ ...s, privatePct: e.target.value }))}
            />
            <FieldError id="billing-private-pct-err">{form.errors.privatePct}</FieldError>
          </div>

          {/* Pagador */}
          <div>
            <Label htmlFor="billing-payer-type">{t('billing.profile.payerType')}</Label>
            <Select
              id="billing-payer-type"
              value={fields.payerType}
              disabled={!canManage}
              onChange={(e) => setFields((s) => ({ ...s, payerType: e.target.value as PayerType }))}
            >
              <option value="RESIDENTE">{t('payer.type.RESIDENTE')}</option>
              <option value="FAMILIAR">{t('payer.type.FAMILIAR')}</option>
              <option value="ADMINISTRACION">{t('payer.type.ADMINISTRACION')}</option>
            </Select>
          </div>

          {/* Nombre del pagador */}
          <div>
            <Label htmlFor="billing-payer-name">{t('billing.profile.payerName')}</Label>
            <Input
              id="billing-payer-name"
              value={fields.payerName}
              disabled={!canManage}
              placeholder="Nombre del pagador responsable"
              onChange={(e) => setFields((s) => ({ ...s, payerName: e.target.value }))}
            />
          </div>

          {/* Referencia mandato SEPA */}
          <div>
            <Label htmlFor="billing-sepa">{t('billing.profile.sepaMandate')}</Label>
            <Input
              id="billing-sepa"
              value={fields.sepaMandate}
              disabled={!canManage}
              maxLength={35}
              placeholder="MAND-XXXXXXXX"
              onChange={(e) => setFields((s) => ({ ...s, sepaMandate: e.target.value }))}
            />
            <p className="mt-0.5 text-xs text-[#1A3A3F]/40">
              Referencia ISO 20022 (máx. 35 caracteres). El cobro automatizado estará disponible en Q-007.
            </p>
          </div>

          {/* Notas */}
          <div className="sm:col-span-2">
            <Label htmlFor="billing-notes">Notas</Label>
            <textarea
              id="billing-notes"
              rows={3}
              className="w-full rounded-xl border border-brand-200 bg-white px-3 py-2 text-sm text-[#1A3A3F] placeholder-[#1A3A3F]/40 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 disabled:cursor-not-allowed disabled:opacity-60"
              value={fields.notes}
              disabled={!canManage}
              placeholder="Acuerdos especiales, descuentos, observaciones…"
              maxLength={1000}
              onChange={(e) => setFields((s) => ({ ...s, notes: e.target.value }))}
            />
          </div>
        </div>

        {canManage && (
          <div className="mt-4">
            <Button type="submit" disabled={upsert.isPending}>
              {upsert.isPending ? 'Guardando…' : t('billing.profile.save')}
            </Button>
          </div>
        )}
      </SectionCard>
    </form>
  );
}
