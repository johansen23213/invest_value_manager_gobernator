import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { getT } from '@/i18n/server';
import { LoginForm } from './login-form';

export default async function LoginPage() {
  const session = await auth();
  if (session?.user) redirect('/');
  const { t } = await getT();

  return (
    <main id="contenido" className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="mb-1 text-2xl font-bold">{t('app.name')}</h1>
        <p className="mb-6 text-sm text-slate-500">{t('login.subtitle')}</p>
        <LoginForm />
      </div>
    </main>
  );
}
