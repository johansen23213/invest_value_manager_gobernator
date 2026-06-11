'use client';

// Onboarding self-service: alta de un centro en minutos (principio #1).
// Página PÚBLICA: crea tenant + Dirección + centro inicial y lleva a /login.

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { z } from 'zod';
import { Button, Card, CardContent, FieldError, Input, Label, Select } from '@vetlla/ui';
import { CenterType } from '@vetlla/db';
import { api } from '@/trpc/react';
import { useT } from '@/i18n/provider';
import { useZodForm } from '@/lib/form';

const CENTER_TYPES = Object.values(CenterType);

const signupSchema = z
  .object({
    organizationName: z.string().trim().min(2, 'Indica el nombre de la organización.').max(120),
    centerName: z.string().trim().min(2, 'Indica el nombre del centro.').max(120),
    adminName: z.string().trim().min(2, 'Indica tu nombre.').max(120),
    adminEmail: z.string().trim().email('Email no válido.').max(160),
    password: z.string().min(8, 'Mínimo 8 caracteres.').max(72),
    password2: z.string(),
    acceptTerms: z.boolean(),
  })
  .refine((v) => v.password === v.password2, {
    path: ['password2'],
    message: 'Las contraseñas no coinciden.',
  })
  .refine((v) => v.acceptTerms, {
    path: ['acceptTerms'],
    message: 'Debes aceptar las condiciones y el tratamiento de datos.',
  });

export default function RegistroPage() {
  const router = useRouter();
  const { t } = useT();
  const form = useZodForm(signupSchema);
  // Fuera del shell de la app no hay ToastProvider: el error del servidor se
  // muestra inline (banner accesible), no como toast.
  const [serverError, setServerError] = useState<string | null>(null);

  const [state, setState] = useState({
    organizationName: '',
    centerName: '',
    centerType: 'RESIDENCIA' as CenterType,
    adminName: '',
    adminEmail: '',
    password: '',
    password2: '',
    acceptTerms: false,
  });

  const register = api.signup.register.useMutation({
    onSuccess: () => {
      router.push('/login?registered=1');
    },
    onError: (e) => setServerError(e.message),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setServerError(null);
    const parsed = form.validate(state);
    if (!parsed) return;
    register.mutate({
      organizationName: state.organizationName,
      centerName: state.centerName,
      centerType: state.centerType,
      adminName: state.adminName,
      adminEmail: state.adminEmail,
      password: state.password,
      acceptTerms: true,
    });
  }

  return (
    <main
      id="contenido"
      className="mx-auto flex min-h-screen w-full max-w-lg flex-col justify-center gap-6 px-4 py-10"
    >
      <div className="text-center">
        <p className="text-2xl font-bold text-brand-700">Vetlla</p>
        <h1 className="mt-2 text-xl font-semibold">{t('signup.title')}</h1>
        <p className="mt-1 text-sm text-slate-600">{t('signup.subtitle')}</p>
      </div>

      <Card>
        <CardContent>
          {serverError && (
            <div
              role="alert"
              className="mb-4 rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800"
            >
              {serverError}
            </div>
          )}
          <form className="flex flex-col gap-4" onSubmit={handleSubmit} noValidate>
            <fieldset className="flex flex-col gap-3">
              <legend className="mb-1 font-semibold text-slate-700">{t('signup.org')}</legend>
              <div>
                <Label htmlFor="org-name">{t('signup.orgName')}</Label>
                <Input
                  id="org-name"
                  value={state.organizationName}
                  aria-invalid={Boolean(form.errors.organizationName)}
                  onChange={(e) => setState((s) => ({ ...s, organizationName: e.target.value }))}
                  placeholder={t('signup.orgNamePh')}
                />
                <FieldError>{form.errors.organizationName}</FieldError>
              </div>
              <div className="flex flex-wrap gap-3">
                <div className="flex-1" style={{ minWidth: '180px' }}>
                  <Label htmlFor="center-name">{t('signup.centerName')}</Label>
                  <Input
                    id="center-name"
                    value={state.centerName}
                    aria-invalid={Boolean(form.errors.centerName)}
                    onChange={(e) => setState((s) => ({ ...s, centerName: e.target.value }))}
                    placeholder={t('signup.centerNamePh')}
                  />
                  <FieldError>{form.errors.centerName}</FieldError>
                </div>
                <div style={{ minWidth: '170px' }}>
                  <Label htmlFor="center-type">{t('signup.centerType')}</Label>
                  <Select
                    id="center-type"
                    value={state.centerType}
                    onChange={(e) =>
                      setState((s) => ({ ...s, centerType: e.target.value as CenterType }))
                    }
                  >
                    {CENTER_TYPES.map((ct) => (
                      <option key={ct} value={ct}>
                        {t(`center.type.${ct}`)}
                      </option>
                    ))}
                  </Select>
                </div>
              </div>
            </fieldset>

            <fieldset className="flex flex-col gap-3">
              <legend className="mb-1 font-semibold text-slate-700">{t('signup.admin')}</legend>
              <div>
                <Label htmlFor="admin-name">{t('signup.adminName')}</Label>
                <Input
                  id="admin-name"
                  value={state.adminName}
                  autoComplete="name"
                  aria-invalid={Boolean(form.errors.adminName)}
                  onChange={(e) => setState((s) => ({ ...s, adminName: e.target.value }))}
                />
                <FieldError>{form.errors.adminName}</FieldError>
              </div>
              <div>
                <Label htmlFor="admin-email">{t('signup.adminEmail')}</Label>
                <Input
                  id="admin-email"
                  type="email"
                  value={state.adminEmail}
                  autoComplete="email"
                  aria-invalid={Boolean(form.errors.adminEmail)}
                  onChange={(e) => setState((s) => ({ ...s, adminEmail: e.target.value }))}
                />
                <FieldError>{form.errors.adminEmail}</FieldError>
              </div>
              <div className="flex flex-wrap gap-3">
                <div className="flex-1" style={{ minWidth: '160px' }}>
                  <Label htmlFor="password">{t('signup.password')}</Label>
                  <Input
                    id="password"
                    type="password"
                    value={state.password}
                    autoComplete="new-password"
                    aria-invalid={Boolean(form.errors.password)}
                    onChange={(e) => setState((s) => ({ ...s, password: e.target.value }))}
                  />
                  <FieldError>{form.errors.password}</FieldError>
                </div>
                <div className="flex-1" style={{ minWidth: '160px' }}>
                  <Label htmlFor="password2">{t('signup.password2')}</Label>
                  <Input
                    id="password2"
                    type="password"
                    value={state.password2}
                    autoComplete="new-password"
                    aria-invalid={Boolean(form.errors.password2)}
                    onChange={(e) => setState((s) => ({ ...s, password2: e.target.value }))}
                  />
                  <FieldError>{form.errors.password2}</FieldError>
                </div>
              </div>
            </fieldset>

            <div>
              <label className="flex items-start gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={state.acceptTerms}
                  onChange={(e) => setState((s) => ({ ...s, acceptTerms: e.target.checked }))}
                  className="mt-0.5 h-5 w-5 rounded border-slate-300"
                  aria-invalid={Boolean(form.errors.acceptTerms)}
                />
                <span>{t('signup.terms')}</span>
              </label>
              <FieldError>{form.errors.acceptTerms}</FieldError>
            </div>

            <Button type="submit" disabled={register.isPending} className="min-h-[48px]">
              {register.isPending ? t('signup.creating') : t('signup.submit')}
            </Button>

            <p className="text-center text-sm text-slate-600">
              {t('signup.haveAccount')}{' '}
              <Link href="/login" className="font-medium text-brand-700 hover:underline">
                {t('signup.toLogin')}
              </Link>
            </p>
          </form>
        </CardContent>
      </Card>

      <p className="text-center text-xs text-slate-500">{t('signup.gdprNote')}</p>
    </main>
  );
}
