import Link from 'next/link';
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

export default async function AppLayout({ children }: { children: ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect('/login');
  const { user } = session;
  const { t } = await getT();
  const isFamily = user.role === 'FAMILIAR';

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
          <div className="min-h-screen bg-surface">
            {/* Enlace de salto al contenido (WCAG 2.4.1) */}
            <a
              href="#contenido"
              className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-brand-700 focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-white"
            >
              {t('skip.toContent')}
            </a>

            <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur-sm">
              <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-2.5">
                {/* Marca + nav principal */}
                <div className="flex items-center gap-5">
                  <Link href={isFamily ? '/portal' : '/'} aria-label={t('app.name')}>
                    <Logo />
                  </Link>
                  <nav className="flex items-center gap-0.5 text-sm" aria-label="Principal">
                    {isFamily ? (
                      <Link
                        href="/portal"
                        className="rounded-lg px-3 py-2 font-medium text-slate-700 transition-smooth hover:bg-slate-100 hover:text-slate-900"
                      >
                        {t('nav.portal')}
                      </Link>
                    ) : (
                      <>
                        <Link href="/" className="rounded-lg px-3 py-2 font-medium text-slate-700 transition-smooth hover:bg-slate-100 hover:text-slate-900">
                          {t('nav.home')}
                        </Link>
                        <Link href="/centros" className="rounded-lg px-3 py-2 font-medium text-slate-700 transition-smooth hover:bg-slate-100 hover:text-slate-900">
                          {t('nav.centers')}
                        </Link>
                        {hasPermission(user.role, 'centers:read') && (
                          <Link href="/ocupacion" className="rounded-lg px-3 py-2 font-medium text-slate-700 transition-smooth hover:bg-slate-100 hover:text-slate-900">
                            {t('nav.occupancy')}
                          </Link>
                        )}
                        <Link href="/residentes" className="rounded-lg px-3 py-2 font-medium text-slate-700 transition-smooth hover:bg-slate-100 hover:text-slate-900">
                          {t('nav.residents')}
                        </Link>
                        <Link href="/atencion" className="rounded-lg px-3 py-2 font-medium text-slate-700 transition-smooth hover:bg-slate-100 hover:text-slate-900">
                          {t('nav.care')}
                        </Link>
                        {hasPermission(user.role, 'care:read') && (
                          <Link href="/alertas" className="rounded-lg px-3 py-2 font-medium text-slate-700 transition-smooth hover:bg-slate-100 hover:text-slate-900">
                            {t('nav.alerts')}
                          </Link>
                        )}
                        {hasPermission(user.role, 'care:read') && (
                          <Link href="/conflictos" className="rounded-lg px-3 py-2 font-medium text-slate-700 transition-smooth hover:bg-slate-100 hover:text-slate-900">
                            {t('nav.conflicts')}
                          </Link>
                        )}
                        {hasPermission(user.role, 'users:read') && (
                          <Link href="/equipo" className="rounded-lg px-3 py-2 font-medium text-slate-700 transition-smooth hover:bg-slate-100 hover:text-slate-900">
                            {t('nav.team')}
                          </Link>
                        )}
                        {hasPermission(user.role, 'audit:read') && (
                          <Link href="/auditoria" className="rounded-lg px-3 py-2 font-medium text-slate-700 transition-smooth hover:bg-slate-100 hover:text-slate-900">
                            {t('nav.audit')}
                          </Link>
                        )}
                        {hasPermission(user.role, 'users:write') && (
                          <Link href="/plan" className="rounded-lg px-3 py-2 font-medium text-slate-700 transition-smooth hover:bg-slate-100 hover:text-slate-900">
                            {t('nav.plan')}
                          </Link>
                        )}
                      </>
                    )}
                  </nav>
                </div>

                {/* Controles de usuario */}
                <div className="flex items-center gap-2 text-sm">
                  <LocaleSwitcher />
                  {!isFamily && <SyncStatusBadge />}
                  <span className="hidden rounded-lg bg-slate-100 px-3 py-1.5 text-slate-600 sm:inline">
                    {user.name ?? user.email}
                    <span className="ml-1 text-slate-400">· {t(`role.${user.role}`)}</span>
                  </span>
                  <form
                    action={async () => {
                      'use server';
                      await signOut({ redirectTo: '/login' });
                    }}
                  >
                    <button
                      type="submit"
                      className="min-h-touch rounded-lg border border-slate-200 px-3 py-1.5 font-medium text-slate-700 transition-smooth hover:border-slate-300 hover:bg-slate-100"
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
