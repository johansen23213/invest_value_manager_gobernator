import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { LoginForm } from './login-form';

export default async function LoginPage() {
  const session = await auth();
  if (session?.user) redirect('/');

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="mb-1 text-2xl font-bold">Vetlla</h1>
        <p className="mb-6 text-sm text-slate-500">Gestión sociosanitaria. Inicia sesión.</p>
        <LoginForm />
      </div>
    </main>
  );
}
