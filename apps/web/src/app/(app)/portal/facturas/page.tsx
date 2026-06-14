'use client';

import { useState } from 'react';
import {
  Badge,
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogTitle,
  EmptyState,
  PageHeader,
  Pagination,
  SectionCard,
  Skeleton,
} from '@vetlla/ui';
import type { InvoiceStatus } from '@vetlla/db';
import { api } from '@/trpc/react';
import { useT } from '@/i18n/provider';
import { formatDate, formatEur } from '@/lib/format';

// ---------------------------------------------------------------------------
// Badge de estado (solo lectura para familias: ISSUED y PAID)
// ---------------------------------------------------------------------------

const STATUS_TONE: Record<string, 'blue' | 'green'> = {
  ISSUED: 'blue',
  PAID: 'green',
};

function InvoiceStatusBadge({ status, t }: { status: string; t: (k: string) => string }) {
  const tone = STATUS_TONE[status] ?? 'blue';
  return <Badge tone={tone}>{t(`invoice.status.${status}`)}</Badge>;
}

// ---------------------------------------------------------------------------
// Página de facturas del portal de familias
// ---------------------------------------------------------------------------

export default function PortalFacturasPage() {
  const { t, locale } = useT();
  const [detailId, setDetailId] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  // Obtener residente vinculado
  const portal = api.family.portal.useQuery();
  const residents = portal.data ?? [];
  const residentId = residents[0]?.id ?? '';

  const invoices = api.facturacion.invoices.listMine.useQuery(
    { residentId, page, pageSize: 10 },
    { enabled: Boolean(residentId) },
  );

  const detailQuery = api.facturacion.invoices.getMine.useQuery(
    { id: detailId!, residentId },
    { enabled: detailId !== null && Boolean(residentId) },
  );

  const list = invoices.data?.items ?? [];
  const totalPages = invoices.data?.totalPages ?? 1;
  const detail = detailQuery.data;

  if (portal.isLoading) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-48 w-full rounded-2xl" />
      </div>
    );
  }

  if (!residentId) {
    return (
      <div className="flex flex-col gap-4">
        <PageHeader title={t('billing.portal.myInvoices')} accent />
        <p className="text-[#1A3A3F]/60">{t('portal.noResident')}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t('billing.portal.myInvoices')}
        accent
      />

      <SectionCard title={t('billing.portal.myInvoices')}>
        {invoices.isLoading ? (
          <div className="flex flex-col gap-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full rounded-xl" />
            ))}
          </div>
        ) : list.length === 0 ? (
          <EmptyState title={t('billing.portal.empty')} />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table
                className="w-full text-sm"
                role="table"
                aria-label={t('billing.portal.myInvoices')}
              >
                <thead>
                  <tr className="border-b border-brand-100">
                    <th
                      scope="col"
                      className="pb-2 text-left text-xs font-semibold uppercase tracking-wide text-[#1A3A3F]/50"
                    >
                      {t('billing.invoices.number')}
                    </th>
                    <th
                      scope="col"
                      className="pb-2 text-left text-xs font-semibold uppercase tracking-wide text-[#1A3A3F]/50"
                    >
                      {t('billing.invoices.period')}
                    </th>
                    <th
                      scope="col"
                      className="pb-2 text-right text-xs font-semibold uppercase tracking-wide text-[#1A3A3F]/50"
                    >
                      {t('billing.invoices.total')}
                    </th>
                    <th
                      scope="col"
                      className="pb-2 text-center text-xs font-semibold uppercase tracking-wide text-[#1A3A3F]/50"
                    >
                      {t('billing.invoices.status')}
                    </th>
                    <th scope="col" className="pb-2">
                      <span className="sr-only">Ver detalle</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((inv) => {
                    const numLabel =
                      inv.invoiceNumber
                        ? `${inv.series}-${inv.invoiceYear}-${String(inv.invoiceNumber).padStart(4, '0')}`
                        : '—';
                    return (
                      <tr
                        key={inv.id}
                        className="border-b border-brand-100/50 last:border-0 hover:bg-brand-50/40 transition-smooth"
                      >
                        <td className="py-2.5 font-mono text-xs text-brand-700">{numLabel}</td>
                        <td className="py-2.5 text-[#1A3A3F]/70">
                          {formatDate(locale, inv.periodStart)} –{' '}
                          {formatDate(locale, inv.periodEnd)}
                        </td>
                        <td className="py-2.5 text-right tabular-nums font-medium text-[#1A3A3F]">
                          {formatEur(locale, Number(inv.totalAmount))}
                        </td>
                        <td className="py-2.5 text-center">
                          <InvoiceStatusBadge status={inv.status as InvoiceStatus} t={t} />
                        </td>
                        <td className="py-2.5 text-right">
                          <button
                            type="button"
                            className="min-h-[48px] min-w-[48px] rounded-lg px-2 py-1 text-sm text-brand-700 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
                            onClick={() => setDetailId(inv.id)}
                            aria-label={`Ver detalle de la factura ${numLabel}`}
                          >
                            Ver
                          </button>
                        </td>
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

      {/* Dialog detalle */}
      <Dialog
        open={detailId !== null}
        onOpenChange={(open) => {
          if (!open) setDetailId(null);
        }}
      >
        <DialogContent>
          {detailQuery.isLoading ? (
            <div className="flex flex-col gap-3">
              <Skeleton className="h-6 w-48" />
              <Skeleton className="h-32 w-full rounded-xl" />
            </div>
          ) : detail ? (
            <>
              <DialogTitle>
                {t('billing.portal.myInvoices')} —{' '}
                {detail.invoiceNumber
                  ? `${detail.series}-${detail.invoiceYear}-${String(detail.invoiceNumber).padStart(4, '0')}`
                  : '—'}
              </DialogTitle>

              <div className="flex flex-col gap-3 text-sm mt-2">
                <div className="flex flex-wrap items-center gap-2">
                  <InvoiceStatusBadge status={detail.status as InvoiceStatus} t={t} />
                  <span className="text-[#1A3A3F]/60">
                    {t('billing.invoices.period')}: {formatDate(locale, detail.periodStart)} –{' '}
                    {formatDate(locale, detail.periodEnd)}
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
                {detail.paidAt && (
                  <p className="text-[#1A3A3F]/60">
                    Fecha de cobro: {formatDate(locale, detail.paidAt)}
                  </p>
                )}

                {/* Líneas */}
                <div className="rounded-xl border border-brand-100 overflow-hidden">
                  <table className="w-full text-xs" aria-label="Líneas de la factura">
                    <thead>
                      <tr className="bg-brand-50">
                        <th
                          scope="col"
                          className="px-3 py-2 text-left font-semibold text-[#1A3A3F]/60"
                        >
                          Concepto
                        </th>
                        <th
                          scope="col"
                          className="px-3 py-2 text-right font-semibold text-[#1A3A3F]/60"
                        >
                          Base
                        </th>
                        <th
                          scope="col"
                          className="px-3 py-2 text-right font-semibold text-[#1A3A3F]/60"
                        >
                          IVA
                        </th>
                        <th
                          scope="col"
                          className="px-3 py-2 text-right font-semibold text-[#1A3A3F]/60"
                        >
                          Total
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.lines.map((line) => (
                        <tr key={line.id} className="border-t border-brand-100/60">
                          <td className="px-3 py-2 text-[#1A3A3F]">
                            {line.description}
                            {line.vatExempt && (
                              <span className="ml-1 text-[#1A3A3F]/40">(exento)</span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">
                            {formatEur(locale, Number(line.lineBase))}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">
                            {formatEur(locale, Number(line.lineVat))}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums font-medium">
                            {formatEur(locale, Number(line.lineTotal))}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-brand-200 bg-brand-50/50">
                        <td
                          className="px-3 py-2 font-semibold text-[#1A3A3F]"
                          colSpan={2}
                        >
                          TOTAL
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-[#1A3A3F]/60">
                          {formatEur(locale, Number(detail.vatAmount))}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums font-bold text-[#1A3A3F]">
                          {formatEur(locale, Number(detail.totalAmount))}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>

              <DialogFooter>
                <DialogClose asChild>
                  <Button variant="secondary" type="button">
                    Cerrar
                  </Button>
                </DialogClose>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
