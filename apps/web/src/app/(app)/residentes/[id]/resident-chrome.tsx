'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Badge } from '@vetlla/ui';
import type { AllergySeverity } from '@vetlla/db';
import { api } from '@/trpc/react';
import { useT } from '@/i18n/provider';
import { ALLERGY_SEVERITY_LABELS, DEPENDENCY_GRADE_LABELS, RESIDENT_STATUS_LABELS } from '@/lib/labels';

/** Icono de alerta para los chips de alergia (decorativo; el texto es el canal). */
function IconAlert({ className }: { className?: string }) {
  return (
    <svg aria-hidden="true" focusable="false" className={className} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12" y2="17.01" />
    </svg>
  );
}

interface AllergyChip {
  id: string;
  substance: string;
  severity: AllergySeverity | null;
}

/** Banner de alergias siempre visible (M-01/M-03). Conserva los testids para e2e. */
function AllergyBanner({ allergies, t }: { allergies: AllergyChip[]; t: (k: string) => string }) {
  if (allergies.length === 0) {
    return <p className="text-xs italic text-slate-500">{t('med.allergies.none')}</p>;
  }
  return (
    <div className="flex flex-wrap gap-2" role="list" aria-label={t('med.allergies.label')} data-testid="allergy-banner">
      {allergies.map((al) => (
        <Badge key={al.id} tone="red" role="listitem" icon={<IconAlert />}>
          {al.substance.toUpperCase()}
          {al.severity ? ` — ${ALLERGY_SEVERITY_LABELS[al.severity] ?? al.severity}` : ''}
        </Badge>
      ))}
    </div>
  );
}

/** Una pestaña de la sub-navegación del residente. */
function SubnavTab({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={`min-h-touch inline-flex items-center border-b-2 px-3 py-2 text-sm font-medium transition ${
        active
          ? 'border-brand-600 text-brand-700'
          : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-800'
      }`}
    >
      {children}
    </Link>
  );
}

/**
 * Chrome persistente del residente (UX-11): migas de pan + cabecera sticky con
 * identidad y alergias + sub-navegación (Expediente / Medicación / PIA). Se renderiza
 * una vez en el layout de `/residentes/[id]` y queda visible en todas sus subpáginas.
 */
export function ResidentChrome({ residentId }: { residentId: string }) {
  const { t } = useT();
  const pathname = usePathname();
  const resident = api.residents.get.useQuery({ id: residentId });
  const r = resident.data;

  const base = `/residentes/${residentId}`;
  const isExpediente = pathname === base;
  const isMedicacion = pathname.startsWith(`${base}/medicacion`);
  const isPia = pathname.startsWith(`${base}/pia`);

  const fullName = r ? `${r.firstName} ${r.lastName}` : '…';
  const allergies: AllergyChip[] = r?.allergies ?? [];

  return (
    <div className="flex flex-col">
      {/* Migas de pan */}
      <nav aria-label="Migas de pan" className="mb-2 text-sm text-slate-500">
        <Link href="/residentes" className="text-brand-700 hover:underline">
          Residentes
        </Link>
        <span className="mx-1.5" aria-hidden="true">
          /
        </span>
        <span className="text-slate-700">{fullName}</span>
      </nav>

      {/* Cabecera sticky con identidad + alergias */}
      <header
        className="sticky top-0 z-20 -mx-4 border-b border-slate-200 bg-white px-4 py-3 shadow-sm"
        aria-label="Datos del residente"
        data-testid="resident-sticky-header"
      >
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h1 className="text-xl font-bold leading-tight">{fullName}</h1>
            {r && (
              <p className="mt-0.5 text-sm text-slate-500">
                {r.center.name}
                {r.bed ? ` · Plaza ${r.bed.code} (${r.bed.unit.name})` : ' · Sin plaza'}
                {` · ${DEPENDENCY_GRADE_LABELS[r.dependencyGrade]}`}{' '}
                <Badge tone={r.status === 'ACTIVO' ? 'green' : 'neutral'}>{RESIDENT_STATUS_LABELS[r.status]}</Badge>
              </p>
            )}
          </div>
        </div>
        <div className="mt-2">
          <span className="sr-only">{t('med.allergies.label')}: </span>
          <AllergyBanner allergies={allergies} t={t} />
        </div>

        {/* Sub-navegación de las secciones del residente */}
        <nav className="-mb-3 mt-2 flex gap-1 border-t border-slate-100 pt-1" aria-label="Secciones del residente">
          <SubnavTab href={base} active={isExpediente}>
            Expediente
          </SubnavTab>
          <SubnavTab href={`${base}/medicacion`} active={isMedicacion}>
            Medicación
          </SubnavTab>
          <SubnavTab href={`${base}/pia`} active={isPia}>
            PIA
          </SubnavTab>
        </nav>
      </header>
    </div>
  );
}
