'use client';

/**
 * /equipo/roles (R-02)
 *
 * Vista de tarjetas de rol legibles ("PUEDE / NO PUEDE") para el DIRECTOR.
 * Muestra los 4 roles operativos del sistema (excluye SUPERADMIN, que es de plataforma).
 * Generado dinámicamente desde permissionsFor + etiquetas i18n — no es una tabla estática.
 *
 * Acceso: restringido a DIRECTOR (hasPermission 'users:read').
 * Si el usuario no tiene el permiso, redirige a '/'.
 */

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import type { UserRole } from '@vetlla/db';
import { api } from '@/trpc/react';
import { useT } from '@/i18n/provider';
import { RoleCapabilitiesCard } from '@/components/role-capabilities-card';

// Roles que se muestran en esta página (excluye SUPERADMIN, que es de plataforma
// y no pertenece a ningún centro).
const OPERATIONAL_ROLES: UserRole[] = ['DIRECTOR', 'SANITARIO', 'AUXILIAR', 'FAMILIAR'];

export default function RolesPage() {
  const { t } = useT();
  const router = useRouter();
  const me = api.me.useQuery();

  // Protección client-side: solo usuarios con users:read (DIRECTOR y superiores).
  const canViewUsers = me.data?.permissions.includes('users:read') ?? null;

  useEffect(() => {
    if (canViewUsers === false) {
      router.replace('/');
    }
  }, [canViewUsers, router]);

  if (me.isLoading || canViewUsers === null) {
    return <p className="text-[#1A3A3F]/60">Cargando…</p>;
  }
  if (!canViewUsers) {
    return null; // el useEffect redirige
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-[#1A3A3F]">{t('rbac.roles.title')}</h1>
        <p className="mt-1 text-sm text-[#1A3A3F]/60">{t('rbac.roles.subtitle')}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {OPERATIONAL_ROLES.map((role) => (
          <RoleCapabilitiesCard key={role} role={role} />
        ))}
      </div>
    </div>
  );
}
