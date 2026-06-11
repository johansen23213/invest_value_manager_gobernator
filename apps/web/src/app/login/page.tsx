import Link from 'next/link';
import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { getT } from '@/i18n/server';
import { Logo } from '@/components/logo';
import { LoginForm } from './login-form';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ registered?: string; reset?: string }>;
}) {
  const session = await auth();
  if (session?.user) redirect('/');
  const { t } = await getT();
  const { registered, reset } = await searchParams;

  return (
    <main id="contenido" className="flex min-h-screen items-center justify-center bg-gradient-to-b from-brand-50 to-slate-50 px-4">
      <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
        <Logo className="mb-4" />
        <p className="mb-6 text-sm text-slate-500">{t('login.subtitle')}</p>
        {registered && (
          <div
            role="status"
            className="mb-4 rounded-md border border-green-300 bg-green-50 px-4 py-3 text-sm text-green-800"
          >
            {t('login.registered')}
          </div>
        )}
        {reset && (
          <div
            role="status"
            className="mb-4 rounded-md border border-green-300 bg-green-50 px-4 py-3 text-sm text-green-800"
          >
            {t('login.resetDone')}
          </div>
        )}
        <LoginForm />
        <div className="mt-4 flex flex-col gap-1 text-center text-sm">
          <Link href="/recuperar" className="text-brand-700 hover:underline">
            {t('login.forgot')}
          </Link>
          <p className="text-slate-600">
            {t('login.noAccount')}{' '}
            <Link href="/registro" className="font-medium text-brand-700 hover:underline">
              {t('login.tryFree')}
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}
