'use client';

// Establece nueva contraseña a partir del token del enlace (reset o invitación).

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { z } from 'zod';
import { Button, Card, CardContent, FieldError, Input, Label } from '@vetlla/ui';
import { api } from '@/trpc/react';
import { useT } from '@/i18n/provider';
import { useZodForm } from '@/lib/form';

const schema = z
  .object({
    password: z.string().min(8, 'Mínimo 8 caracteres.').max(72),
    password2: z.string(),
  })
  .refine((v) => v.password === v.password2, {
    path: ['password2'],
    message: 'Las contraseñas no coinciden.',
  });

function ResetForm() {
  const { t } = useT();
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get('token') ?? '';
  const form = useZodForm(schema);
  const [state, setState] = useState({ password: '', password2: '' });
  const [error, setError] = useState<string | null>(null);

  const reset = api.account.resetPassword.useMutation({
    onSuccess: (res) => {
      if (res.ok) router.push('/login?reset=1');
      else setError(t('reset.invalidToken'));
    },
    onError: (e) => setError(e.message),
  });

  if (!token) {
    return <p className="text-sm text-red-700">{t('reset.invalidToken')}</p>;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!form.validate(state)) return;
    reset.mutate({ token, password: state.password });
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={handleSubmit} noValidate>
      {error && (
        <div role="alert" className="rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      )}
      <div>
        <Label htmlFor="password">{t('reset.newPassword')}</Label>
        <Input
          id="password"
          type="password"
          autoComplete="new-password"
          value={state.password}
          aria-invalid={Boolean(form.errors.password)}
          onChange={(e) => setState((s) => ({ ...s, password: e.target.value }))}
        />
        <FieldError>{form.errors.password}</FieldError>
      </div>
      <div>
        <Label htmlFor="password2">{t('reset.repeatPassword')}</Label>
        <Input
          id="password2"
          type="password"
          autoComplete="new-password"
          value={state.password2}
          aria-invalid={Boolean(form.errors.password2)}
          onChange={(e) => setState((s) => ({ ...s, password2: e.target.value }))}
        />
        <FieldError>{form.errors.password2}</FieldError>
      </div>
      <Button type="submit" disabled={reset.isPending} className="min-h-[48px]">
        {reset.isPending ? t('reset.saving') : t('reset.submit')}
      </Button>
      <Link href="/login" className="text-center text-sm text-brand-700 hover:underline">
        {t('reset.backToLogin')}
      </Link>
    </form>
  );
}

export default function RestablecerPage() {
  const { t } = useT();
  return (
    <main
      id="contenido"
      className="mx-auto flex min-h-screen w-full max-w-sm flex-col justify-center gap-6 px-4"
    >
      <div className="text-center">
        <p className="text-2xl font-bold text-brand-700">Vetlla</p>
        <h1 className="mt-2 text-lg font-semibold">{t('reset.title')}</h1>
      </div>
      <Card>
        <CardContent>
          <Suspense fallback={<p className="text-sm text-slate-500">…</p>}>
            <ResetForm />
          </Suspense>
        </CardContent>
      </Card>
    </main>
  );
}
