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

export default async function AppLayout({ children }: { children: ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect('/login');
  const { user } = session;
  const { t } = await getT();
  const isFamily = user.role === 'FAMILIAR';

  return (
    <CareSyncProvider>
      <ToastProvider>
        <ConfirmProvider>
      <div className="min-h-screen">
        <header className="border-b border-slate-200 bg-white">
          <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3">
            <div className="flex items-center gap-6">
              <Link href={isFamily ? '/portal' : '/'} aria-label={t('app.name')}>
                <Logo />
              </Link>
              <nav className="flex items-center gap-1 text-sm" aria-label="Principal">
                {isFamily ? (
                  <Link href="/portal" className="rounded-md px-3 py-2 hover:bg-slate-100">
                    {t('nav.portal')}
                  </Link>
                ) : (
                  <>
                    <Link href="/" className="rounded-md px-3 py-2 hover:bg-slate-100">
                      {t('nav.home')}
                    </Link>
                    <Link href="/centros" className="rounded-md px-3 py-2 hover:bg-slate-100">
                      {t('nav.centers')}
                    </Link>
                    <Link href="/residentes" className="rounded-md px-3 py-2 hover:bg-slate-100">
                      {t('nav.residents')}
                    </Link>
                    <Link href="/atencion" className="rounded-md px-3 py-2 hover:bg-slate-100">
                      {t('nav.care')}
                    </Link>
                  </>
                )}
              </nav>
            </div>
            <div className="flex items-center gap-3 text-sm">
              <LocaleSwitcher />
              {!isFamily && <SyncStatusBadge />}
              <span className="hidden text-slate-500 sm:inline">
                {user.name ?? user.email} · {t(`role.${user.role}`)}
              </span>
              <form
                action={async () => {
                  'use server';
                  await signOut({ redirectTo: '/login' });
                }}
              >
                <button
                  type="submit"
                  className="min-h-touch rounded-md border border-slate-300 px-3 py-2 font-medium hover:bg-slate-100"
                >
                  {t('action.logout')}
                </button>
              </form>
            </div>
          </div>
        </header>
          <main id="contenido" className="mx-auto max-w-5xl px-4 py-8">
            {children}
          </main>
        </div>
        </ConfirmProvider>
      </ToastProvider>
    </CareSyncProvider>
  );
}
