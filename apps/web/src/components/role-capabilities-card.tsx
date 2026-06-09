'use client';

/**
 * RoleCapabilitiesCard (R-02)
 *
 * Muestra dinámicamente lo que un rol PUEDE y NO PUEDE hacer,
 * generado desde `permissionsFor(role)` + el mapa de etiquetas i18n.
 *
 * Accesible: icono check/cross con aria-hidden + texto visible (nunca solo color).
 * No depende de ningún dato de BD; es puro RBAC estático.
 */

import type { UserRole } from '@vetlla/db';
import { Card, CardContent, CardTitle } from '@vetlla/ui';
import { PERMISSIONS, permissionsFor, type Permission } from '@/lib/rbac';
import { useT } from '@/i18n/provider';
import { ROLE_LABELS } from '@/lib/labels';

// ── Iconos inline ─────────────────────────────────────────────────────────────

function IconCheck() {
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
      className="shrink-0 text-green-600"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function IconCross() {
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
      className="shrink-0 text-slate-400"
    >
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

// ── Componente ────────────────────────────────────────────────────────────────

interface RoleCapabilitiesCardProps {
  role: UserRole;
}

export function RoleCapabilitiesCard({ role }: RoleCapabilitiesCardProps) {
  const { t } = useT();
  const granted = new Set<Permission>(permissionsFor(role));

  // Separar todos los permisos del sistema en "puede" y "no puede"
  const can: Permission[] = [];
  const cannot: Permission[] = [];
  for (const perm of PERMISSIONS) {
    if (granted.has(perm)) {
      can.push(perm);
    } else {
      cannot.push(perm);
    }
  }

  const roleLabel = ROLE_LABELS[role] ?? role;

  return (
    <Card>
      <CardContent>
        <CardTitle className="mb-4 text-base">
          {roleLabel}
        </CardTitle>

        {/* PUEDE */}
        <section aria-label={`${roleLabel} — ${t('rbac.card.can')}`}>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-green-700">
            {t('rbac.card.can')}
          </h3>
          <ul className="flex flex-col gap-1.5">
            {can.map((perm) => (
              <li key={perm} className="flex items-start gap-2 text-sm text-slate-800">
                <IconCheck />
                <span>{t(`rbac.perm.${perm}`)}</span>
              </li>
            ))}
          </ul>
        </section>

        {/* NO PUEDE */}
        {cannot.length > 0 && (
          <section aria-label={`${roleLabel} — ${t('rbac.card.cannot')}`} className="mt-4">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
              {t('rbac.card.cannot')}
            </h3>
            <ul className="flex flex-col gap-1.5">
              {cannot.map((perm) => (
                <li key={perm} className="flex items-start gap-2 text-sm text-slate-500">
                  <IconCross />
                  <span>{t(`rbac.perm.${perm}`)}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </CardContent>
    </Card>
  );
}
