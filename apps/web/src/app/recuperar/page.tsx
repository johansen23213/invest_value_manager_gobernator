'use client';

// Solicitud de reset de contraseña (pública). Respuesta uniforme: no revela si
// el email existe (anti-enumeración).
// Layout Lifecare Ola 1: fondo crema, tarjeta con radio redondeado.

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
      className="flex min-h-screen flex-col items-center justify-center bg-[#FAF7F2] px-4"
    >
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="mb-8 flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-brand-700 text-sm font-extrabold text-white">V</span>
          <span className="text-lg font-extrabold tracking-tight text-[#1A3A3F]">Vetlla</span>
        </div>

        <h1 className="mb-1 text-2xl font-extrabold tracking-tight text-[#1A3A3F]">
          {t('reset.requestTitle')}
        </h1>
        <p className="mb-6 text-sm text-[#1A3A3F]/70">{t('reset.requestHint')}</p>

        <Card>
          <CardContent>
            {sent ? (
              <div role="status" className="text-sm text-[#1A3A3F]">
                <p>{t('reset.requestSent')}</p>
                <Link href="/login" className="mt-3 inline-block font-semibold text-brand-600 hover:underline">
                  {t('reset.backToLogin')}
                </Link>
              </div>
            ) : (
              <form className="flex flex-col gap-4" onSubmit={handleSubmit} noValidate>
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
                <Link href="/login" className="text-center text-sm text-brand-600 hover:underline">
                  {t('reset.backToLogin')}
                </Link>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
