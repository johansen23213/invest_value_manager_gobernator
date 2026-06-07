import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { auth, signOut } from '@/auth';
import { ROLE_LABELS } from '@/lib/labels';
import { CareSyncProvider } from '@/offline/use-care-sync';
import { SyncStatusBadge } from '@/offline/sync-status-badge';

export default async function AppLayout({ children }: { children: ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect('/login');
  const { user } = session;

  return (
    <CareSyncProvider>
      <div className="min-h-screen">
        <header className="border-b border-slate-200 bg-white">
          <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3">
            <div className="flex items-center gap-6">
              <Link href="/" className="text-lg font-bold">
                Vetlla
              </Link>
              <nav className="flex items-center gap-1 text-sm">
                <Link href="/" className="rounded-md px-3 py-2 hover:bg-slate-100">
                  Inicio
                </Link>
                <Link href="/centros" className="rounded-md px-3 py-2 hover:bg-slate-100">
                  Centros
                </Link>
                <Link href="/residentes" className="rounded-md px-3 py-2 hover:bg-slate-100">
                  Residentes
                </Link>
                <Link href="/atencion" className="rounded-md px-3 py-2 hover:bg-slate-100">
                  Atención
                </Link>
              </nav>
            </div>
            <div className="flex items-center gap-3 text-sm">
              <SyncStatusBadge />
              <span className="hidden text-slate-500 sm:inline">
                {user.name ?? user.email} · {ROLE_LABELS[user.role] ?? user.role}
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
                  Salir
                </button>
              </form>
            </div>
          </div>
        </header>
        <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>
      </div>
    </CareSyncProvider>
  );
}
