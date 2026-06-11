'use client';

// Solicitud de reset de contraseña (pública). Respuesta uniforme: no revela si
// el email existe (anti-enumeración).

import Link from 'next/link';
import { useState } from 'react';
import { z } from 'zod';
import { Button, Card, CardContent, FieldError, Input, Label } from '@vetlla/ui';
import { api } from '@/trpc/react';
import { useT } from '@/i18n/provider';
import { useZodForm } from '@/lib/form';

const schema = z.object({ email: z.string().trim().email('Email no válido.').max(160) });

export default function RecuperarPage() {
  const { t } = useT();
  const form = useZodForm(schema);
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);

  const request = api.account.requestPasswordReset.useMutation({
    onSuccess: () => setSent(true),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.validate({ email })) return;
    request.mutate({ email: email.trim() });
  }

  return (
    <main
      id="contenido"
      className="mx-auto flex min-h-screen w-full max-w-sm flex-col justify-center gap-6 px-4"
    >
      <div className="text-center">
        <p className="text-2xl font-bold text-brand-700">Vetlla</p>
        <h1 className="mt-2 text-lg font-semibold">{t('reset.requestTitle')}</h1>
      </div>
      <Card>
        <CardContent>
          {sent ? (
            <div role="status" className="text-sm text-slate-700">
              <p>{t('reset.requestSent')}</p>
              <Link href="/login" className="mt-3 inline-block font-medium text-brand-700 hover:underline">
                {t('reset.backToLogin')}
              </Link>
            </div>
          ) : (
            <form className="flex flex-col gap-4" onSubmit={handleSubmit} noValidate>
              <p className="text-sm text-slate-600">{t('reset.requestHint')}</p>
              <div>
                <Label htmlFor="email">{t('reset.email')}</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  aria-invalid={Boolean(form.errors.email)}
                  onChange={(e) => setEmail(e.target.value)}
                />
                <FieldError>{form.errors.email}</FieldError>
              </div>
              <Button type="submit" disabled={request.isPending} className="min-h-[48px]">
                {request.isPending ? t('reset.sending') : t('reset.requestSubmit')}
              </Button>
              <Link href="/login" className="text-center text-sm text-brand-700 hover:underline">
                {t('reset.backToLogin')}
              </Link>
            </form>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
