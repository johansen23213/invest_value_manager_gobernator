'use client';

/**
 * /cuenta/seguridad — Ajustes de seguridad de la cuenta.
 *
 * Muestra la tarjeta de gestión MFA (TOTP).
 * Accesible para todos los roles autenticados (cada usuario gestiona su propia cuenta).
 */

import { PageHeader } from '@vetlla/ui';
import { useT } from '@/i18n/provider';
import { MfaCard } from './mfa-card';
import { PushCard } from './push-card';

export default function CuentaSeguridadPage() {
  const { t } = useT();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t('cuenta.seguridad.title')}
        subtitle={t('cuenta.seguridad.subtitle')}
      />

      <MfaCard />
      <PushCard />
    </div>
  );
}
