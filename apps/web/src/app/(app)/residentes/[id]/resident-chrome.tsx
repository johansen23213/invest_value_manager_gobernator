'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Badge } from '@vetlla/ui';
import type { AllergySeverity } from '@vetlla/db';
import { api } from '@/trpc/react';
import { useT } from '@/i18n/provider';
import { formatDate } from '@/lib/format';
import { ALLERGY_SEVERITY_LABELS, DEPENDENCY_GRADE_LABELS, RESIDENT_STATUS_LABELS } from '@/lib/labels';

// ---------------------------------------------------------------------------
// Avatar con iniciales y color estable derivado del nombre
// ---------------------------------------------------------------------------

/** Genera un índice de color (0–7) estable a partir del nombre del residente. */
function nameColorIndex(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash << 5) - hash + name.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash) % 8;
}

const AVATAR_PALETTES = [
  { bg: 'bg-brand-100', text: 'text-brand-800', border: 'border-brand-200' },
  { bg: 'bg-warm-100', text: 'text-warm-800', border: 'border-warm-200' },
  { bg: 'bg-violet-100', text: 'text-violet-800', border: 'border-violet-200' },
  { bg: 'bg-sky-100', text: 'text-sky-800', border: 'border-sky-200' },
  { bg: 'bg-emerald-100', text: 'text-emerald-800', border: 'border-emerald-200' },
  { bg: 'bg-rose-100', text: 'text-rose-800', border: 'border-rose-200' },
  { bg: 'bg-amber-100', text: 'text-amber-800', border: 'border-amber-200' },
  { bg: 'bg-indigo-100', text: 'text-indigo-800', border: 'border-indigo-200' },
];

function ResidentAvatar({ firstName, lastName }: { firstName: string; lastName: string }) {
  const initials = `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
  const idx = nameColorIndex(`${firstName}${lastName}`);
  const palette = AVATAR_PALETTES[idx] ?? AVATAR_PALETTES[0]!;
  return (
    <div
      aria-hidden="true"
      className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full border-2 text-base font-bold ${palette.bg} ${palette.text} ${palette.border}`}
    >
      {initials}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Cálculo de edad
// ---------------------------------------------------------------------------
function calcAge(birthDate: Date | string | null | undefined): number | null {
  if (!birthDate) return null;
  const birth = new Date(birthDate);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age -= 1;
  return age;
}

// ---------------------------------------------------------------------------
// Icono de alerta (decorativo)
// ---------------------------------------------------------------------------
function IconAlert({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      className={className}
      width="12"
      height="12"
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

// ---------------------------------------------------------------------------
// Banner de alergias
// ---------------------------------------------------------------------------
interface AllergyChip {
  id: string;
  substance: string;
  severity: AllergySeverity | null;
}

/**
 * Banner de alergias con jerarquía visual clara (M-01/M-03).
 * - GRAVE: banner rojo prominente ancho con texto destacado.
 * - Resto: chips inline en rojo suave.
 * Conserva los testids para e2e.
 */
function AllergyBanner({
  allergies,
  t,
}: {
  allergies: AllergyChip[];
  t: (k: string) => string;
}) {
  if (allergies.length === 0) {
    return <p className="text-xs italic text-[#1A3A3F]/40">{t('med.allergies.none')}</p>;
  }

  const graveAllergies = allergies.filter((a) => a.severity === 'GRAVE');
  const otherAllergies = allergies.filter((a) => a.severity !== 'GRAVE');

  return (
    <div role="list" aria-label={t('med.allergies.label')} data-testid="allergy-banner">
      {/* Alergias GRAVE: banner prominente */}
      {graveAllergies.map((al) => (
        <div
          key={al.id}
          role="listitem"
          className="mb-1.5 flex items-center gap-2 rounded-lg border border-warm-300 bg-warm-600 px-3 py-2 text-white"
          aria-label={`${t('resident.allergyBannerGrave')}: ${al.substance}`}
        >
          <IconAlert className="h-4 w-4 shrink-0 text-warm-100" />
          <span className="text-xs font-bold uppercase tracking-wide">{t('resident.allergyBannerGrave')}:</span>
          <span className="text-sm font-semibold">
            {al.substance.toUpperCase()}
            {al.severity ? ` — ${ALLERGY_SEVERITY_LABELS[al.severity] ?? al.severity}` : ''}
          </span>
        </div>
      ))}
      {/* Alergias no-GRAVE: chips compactos */}
      {otherAllergies.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {otherAllergies.map((al) => (
            <Badge key={al.id} tone="red" role="listitem" icon={<IconAlert />}>
              {al.substance.toUpperCase()}
              {al.severity ? ` — ${ALLERGY_SEVERITY_LABELS[al.severity] ?? al.severity}` : ''}
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pestaña de subnav
// ---------------------------------------------------------------------------
function SubnavTab({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={`min-h-touch inline-flex items-center border-b-2 px-3 py-2 text-sm font-medium transition-smooth ${
        active
          ? 'border-brand-600 text-brand-700'
          : 'border-transparent text-[#1A3A3F]/60 hover:border-brand-100 hover:text-[#1A3A3F]'
      }`}
    >
      {children}
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Chrome principal del residente
// ---------------------------------------------------------------------------

/**
 * Chrome persistente del residente (UX-11): migas de pan + cabecera sticky con
 * avatar, identidad, edad, dependencia, alergias + sub-navegación.
 * Rediseño 2026-06-11: avatar con iniciales, edad calculada, banner GRAVE prominente.
 */
export function ResidentChrome({ residentId }: { residentId: string }) {
  const { t, locale } = useT();
  const pathname = usePathname();
  const resident = api.residents.get.useQuery({ id: residentId });
  const r = resident.data;

  const base = `/residentes/${residentId}`;
  const isResumen = pathname === `${base}/resumen`;
  const isExpediente = pathname === base;
  const isMedicacion = pathname.startsWith(`${base}/medicacion`);
  const isPia = pathname.startsWith(`${base}/pia`);

  const fullName = r ? `${r.firstName} ${r.lastName}` : '…';
  const allergies: AllergyChip[] = r?.allergies ?? [];
  const age = calcAge(r?.birthDate);

  return (
    <div className="flex flex-col">
      {/* Migas de pan */}
      <nav aria-label="Migas de pan" className="mb-2 text-sm text-[#1A3A3F]/60">
        <Link href="/residentes" className="text-brand-700 hover:underline focus-visible:underline">
          Residentes
        </Link>
        <span className="mx-1.5" aria-hidden="true">
          /
        </span>
        <span className="text-[#1A3A3F]/70">{fullName}</span>
      </nav>

      {/* Cabecera sticky */}
      <header
        className="sticky top-0 z-20 -mx-4 border-b border-brand-100 bg-white px-4 py-3 shadow-sm"
        aria-label="Datos del residente"
        data-testid="resident-sticky-header"
      >
        {/* Identidad: avatar + nombre + metadatos */}
        <div className="flex flex-wrap items-start gap-3">
          {r && (
            <ResidentAvatar firstName={r.firstName} lastName={r.lastName} />
          )}
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-bold leading-tight text-[#1A3A3F]">{fullName}</h1>
              {r && (
                <Badge tone={r.status === 'ACTIVO' ? 'green' : 'neutral'}>
                  {RESIDENT_STATUS_LABELS[r.status]}
                </Badge>
              )}
            </div>
            {r && (
              <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm text-[#1A3A3F]/60">
                {/* Edad */}
                {age !== null ? (
                  <span>
                    {t('resident.ageBirthDate', {
                      age,
                      date: formatDate(locale, r.birthDate),
                    })}
                  </span>
                ) : (
                  <span>{t('resident.noBirthDate')}</span>
                )}
                <span aria-hidden="true">·</span>
                {/* Grado de dependencia */}
                <span>{DEPENDENCY_GRADE_LABELS[r.dependencyGrade]}</span>
                <span aria-hidden="true">·</span>
                {/* Centro y plaza */}
                <span>
                  {r.center.name}
                  {r.bed ? ` — Plaza ${r.bed.code} (${r.bed.unit.name})` : ' — Sin plaza'}
                </span>
              </p>
            )}
          </div>
        </div>

        {/* Banner de alergias */}
        <div className="mt-2">
          <span className="sr-only">{t('med.allergies.label')}: </span>
          <AllergyBanner allergies={allergies} t={t} />
        </div>

        {/* Sub-navegación */}
        <nav
          className="-mb-3 mt-2 flex gap-1 border-t border-brand-100/60 pt-1"
          aria-label="Secciones del residente"
        >
          <SubnavTab href={`${base}/resumen`} active={isResumen}>
            Resumen
          </SubnavTab>
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
