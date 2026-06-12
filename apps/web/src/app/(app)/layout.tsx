import Link from 'next/link';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { auth, signOut } from '@/auth';
import { getT } from '@/i18n/server';
import { CareSyncProvider } from '@/offline/use-care-sync';
import { SyncStatusBadge } from '@/offline/sync-status-badge';
import { LocaleSwitcher } from '@/i18n/locale-switcher';
import { ToastProvider } from '@/components/toast';
import { ConfirmProvider } from '@/components/confirm';
import { Logo } from '@/components/logo';
import { hasPermission } from '@/lib/rbac';
import { forTenant } from '@vetlla/db';
import { trialDaysLeft } from '@/lib/plans';

// Componente de enlace de navegación con indicador de página activa.
// aria-current="page" para accesibilidad (WCAG 2.4.4) + estilo visual petróleo.
async function NavLink({ href, label, pathname }: { href: string; label: string; pathname: string }) {
  const isActive = pathname === href || (href !== '/' && pathname.startsWith(href));
  return (
    <Link
      href={href}
      aria-current={isActive ? 'page' : undefined}
      className={
        isActive
          ? 'rounded-full px-3.5 py-1.5 text-sm font-semibold bg-brand-700 text-white transition-smooth'
          : 'rounded-full px-3.5 py-1.5 text-sm font-medium text-[#1A3A3F]/70 transition-smooth hover:bg-brand-50 hover:text-brand-700'
      }
    >
      {label}
    </Link>
  );
}

export default async function AppLayout({ children }: { children: ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect('/login');
  const { user } = session;
  const { t } = await getT();
  const isFamily = user.role === 'FAMILIAR';

  // Pathname actual para el indicador de página activa.
  const headersList = await headers();
  const pathname = headersList.get('x-pathname') ?? '/';

  // Banner de prueba: días restantes del TRIAL (visible para todo el equipo).
  let trialDays: number | null = null;
  if (user.tenantId) {
    const db = forTenant({ tenantId: user.tenantId, bypassRls: user.role === 'SUPERADMIN' });
    const tenant = await db.tenant.findFirst({ select: { plan: true, trialEndsAt: true } });
    if (tenant?.plan === 'TRIAL') trialDays = trialDaysLeft(tenant.trialEndsAt);
  }

  return (
    <CareSyncProvider>
      <ToastProvider>
        <ConfirmProvider>
          <div className="min-h-screen bg-[#FAF7F2]">
            {/* Enlace de salto al contenido (WCAG 2.4.1) */}
            <a
              href="#contenido"
              className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-brand-700 focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-white"
            >
              {t('skip.toContent')}
            </a>

            {/* Header con fondo blanco/crema y borde inferior petróleo sutil */}
            <header className="sticky top-0 z-30 border-b border-brand-100/60 bg-white/95 backdrop-blur-sm">
              <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-2.5">
                {/* Marca + nav principal */}
                <div className="flex items-center gap-4">
                  <Link href={isFamily ? '/portal' : '/'} aria-label={t('app.name')}>
                    <Logo />
                  </Link>
                  <nav className="flex items-center gap-0.5 text-sm" aria-label="Principal">
                    {isFamily ? (
                      <>
                        <NavLink href="/portal" label={t('nav.portal')} pathname={pathname} />
                      </>
                    ) : (
                      <>
                        <NavLink href="/" label={t('nav.home')} pathname={pathname} />
                        <NavLink href="/centros" label={t('nav.centers')} pathname={pathname} />
                        {hasPermission(user.role, 'centers:read') && (
                          <NavLink href="/ocupacion" label={t('nav.occupancy')} pathname={pathname} />
                        )}
                        <NavLink href="/residentes" label={t('nav.residents')} pathname={pathname} />
                        <NavLink href="/atencion" label={t('nav.care')} pathname={pathname} />
                        {hasPermission(user.role, 'care:read') && (
                          <NavLink href="/alertas" label={t('nav.alerts')} pathname={pathname} />
                        )}
                        {hasPermission(user.role, 'care:read') && (
                          <NavLink href="/conflictos" label={t('nav.conflicts')} pathname={pathname} />
                        )}
                        {hasPermission(user.role, 'requests:manage') && (
                          <NavLink href="/solicitudes" label={t('nav.requests')} pathname={pathname} />
                        )}
                        {hasPermission(user.role, 'users:read') && (
                          <NavLink href="/equipo" label={t('nav.team')} pathname={pathname} />
                        )}
                        {hasPermission(user.role, 'audit:read') && (
                          <NavLink href="/auditoria" label={t('nav.audit')} pathname={pathname} />
                        )}
                        {hasPermission(user.role, 'users:write') && (
                          <NavLink href="/plan" label={t('nav.plan')} pathname={pathname} />
                        )}
                      </>
                    )}
                  </nav>
                </div>

                {/* Controles de usuario */}
                <div className="flex items-center gap-2 text-sm">
                  <LocaleSwitcher />
                  {!isFamily && <SyncStatusBadge />}
                  <span className="hidden rounded-full bg-brand-50 px-3 py-1.5 text-[#1A3A3F]/70 sm:inline">
                    {user.name ?? user.email}
                    <span className="ml-1 text-[#1A3A3F]/70">· {t(`role.${user.role}`)}</span>
                  </span>
                  <form
                    action={async () => {
                      'use server';
                      await signOut({ redirectTo: '/login' });
                    }}
                  >
                    <button
                      type="submit"
                      className="min-h-touch rounded-full border border-brand-200 px-3 py-1.5 text-sm font-medium text-[#1A3A3F]/70 transition-smooth hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700"
                    >
                      {t('action.logout')}
                    </button>
                  </form>
                </div>
              </div>
            </header>

            {/* Banner de TRIAL */}
            {trialDays !== null && (
              <div
                role="status"
                className={`border-b px-4 py-2 text-center text-sm font-medium ${
                  trialDays > 5
                    ? 'border-amber-200 bg-amber-50 text-amber-800'
                    : 'border-red-200 bg-red-50 text-red-800'
                }`}
              >
                {trialDays > 0 ? t('plan.trialLeft', { days: trialDays }) : t('plan.trialEnded')}
                {hasPermission(user.role, 'users:write') && (
                  <>
                    {' · '}
                    <Link href="/plan" className="underline">
                      {t('nav.plan')}
                    </Link>
                  </>
                )}
              </div>
            )}

            <main id="contenido" className="mx-auto max-w-6xl px-4 py-8">
              {children}
            </main>
          </div>
        </ConfirmProvider>
      </ToastProvider>
    </CareSyncProvider>
  );
}
