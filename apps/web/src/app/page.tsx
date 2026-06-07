import { redirect } from 'next/navigation';
import { auth, signOut } from '@/auth';

const ROLE_LABELS: Record<string, string> = {
  SUPERADMIN: 'Superadministrador de plataforma',
  DIRECTOR: 'Dirección / gestor',
  SANITARIO: 'Sanitario (médico / enfermería)',
  AUXILIAR: 'Auxiliar (atención directa)',
  FAMILIAR: 'Familiar',
};

export default async function HomePage() {
  const session = await auth();
  if (!session?.user) redirect('/login');

  const { user } = session;

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-12">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Vetlla</h1>
        <form
          action={async () => {
            'use server';
            await signOut({ redirectTo: '/login' });
          }}
        >
          <button
            type="submit"
            className="min-h-touch rounded-md border border-slate-300 px-4 py-2 font-medium hover:bg-slate-100"
          >
            Cerrar sesión
          </button>
        </form>
      </header>

      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold">Sesión iniciada</h2>
        <dl className="grid grid-cols-[auto,1fr] gap-x-4 gap-y-2 text-sm">
          <dt className="font-medium text-slate-500">Nombre</dt>
          <dd>{user.name ?? '—'}</dd>
          <dt className="font-medium text-slate-500">Email</dt>
          <dd>{user.email}</dd>
          <dt className="font-medium text-slate-500">Rol</dt>
          <dd>{ROLE_LABELS[user.role] ?? user.role}</dd>
          <dt className="font-medium text-slate-500">Tenant</dt>
          <dd>{user.tenantId ?? '— (plataforma)'}</dd>
        </dl>
      </section>

      <p className="text-sm text-slate-500">
        Andamiaje H0 operativo. Los módulos del producto se añaden en los siguientes hitos.
      </p>
    </main>
  );
}
