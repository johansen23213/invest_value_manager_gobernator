'use client';

// Onboarding self-service: alta de un centro en minutos (principio #1).
// Página PÚBLICA: crea tenant + Dirección + centro inicial y lleva a /login.
// Layout Lifecare Ola 1: panel teal decorativo en desktop, crema en móvil.

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

// Panel decorativo compartido con login (componente local para no añadir dependencias).
function AuthPanelDecoration({ claim, sub }: { claim: string; sub: string }) {
  return (
    <div
      aria-hidden="true"
      className="relative hidden overflow-hidden bg-brand-700 lg:flex lg:w-[45%] lg:flex-col lg:justify-between lg:p-12"
    >
      {/* Blob decorativo */}
      <svg viewBox="0 0 300 300" className="absolute -right-16 -top-16 h-64 w-64 opacity-10">
        <path d="M150,20 C200,20 260,60 270,120 C280,180 240,250 180,265 C120,280 50,240 30,175 C10,110 50,30 150,20 Z" fill="white" />
      </svg>

      {/* Logo blanco */}
      <span className="relative z-10 inline-flex items-center gap-2">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/15 text-sm font-extrabold text-white">V</span>
        <span className="text-xl font-extrabold tracking-tight text-white">Vetlla</span>
      </span>

      {/* Claim */}
      <div className="relative z-10 flex flex-col gap-3">
        <p className="font-display text-display-2xl whitespace-pre-line leading-tight text-white">{claim}</p>
        <p className="max-w-xs text-base font-medium text-brand-100/80">{sub}</p>
        <ul className="mt-4 flex flex-col gap-2 text-sm text-brand-100/70">
          <li className="flex items-center gap-2">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-warm-500/30 text-warm-300 text-xs">✓</span>
            30 días de prueba completa
          </li>
          <li className="flex items-center gap-2">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-warm-500/30 text-warm-300 text-xs">✓</span>
            Sin tarjeta, sin instalación
          </li>
          <li className="flex items-center gap-2">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-warm-500/30 text-warm-300 text-xs">✓</span>
            Datos en la Unión Europea (RGPD)
          </li>
        </ul>
      </div>

      {/* Ola inferior */}
      <svg aria-hidden="true" viewBox="0 0 400 80" preserveAspectRatio="none" className="absolute bottom-0 left-0 w-full">
        <path d="M0,40 C80,80 160,0 240,40 C320,80 370,20 400,40 L400,80 L0,80 Z" fill="rgb(231 111 81 / 0.18)" />
        <path d="M0,55 C100,20 200,70 320,45 C360,35 385,55 400,50 L400,80 L0,80 Z" fill="rgb(231 111 81 / 0.10)" />
      </svg>
    </div>
  );
}

export default function RegistroPage() {
  const router = useRouter();
  const { t } = useT();
  const form = useZodForm(signupSchema);
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
    <main id="contenido" className="flex min-h-screen bg-[#FAF7F2]">
      <AuthPanelDecoration claim={t('auth.panel.claim')} sub={t('auth.panel.sub')} />

      {/* ── Panel del formulario ────────────────────────────────────────────── */}
      <div className="flex w-full flex-col items-center justify-center px-5 py-10 lg:w-[55%] lg:px-10">
        {/* Logo visible solo en móvil */}
        <div className="mb-6 self-start lg:hidden">
          <span className="inline-flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-brand-700 text-sm font-extrabold text-white">V</span>
            <span className="text-lg font-extrabold tracking-tight text-[#1A3A3F]">Vetlla</span>
          </span>
        </div>

        <div className="w-full max-w-lg">
          <h1 className="mb-1 text-2xl font-extrabold tracking-tight text-[#1A3A3F]">
            {t('signup.title')}
          </h1>
          <p className="mb-6 text-sm text-[#1A3A3F]/70">{t('signup.subtitle')}</p>

          <Card>
            <CardContent>
              {serverError && (
                <div
                  role="alert"
                  className="mb-4 rounded-2xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800"
                >
                  {serverError}
                </div>
              )}
              <form className="flex flex-col gap-4" onSubmit={handleSubmit} noValidate>
                <fieldset className="flex flex-col gap-3">
                  <legend className="mb-1 font-semibold text-[#1A3A3F]">{t('signup.org')}</legend>
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
                  <legend className="mb-1 font-semibold text-[#1A3A3F]">{t('signup.admin')}</legend>
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
                  <label className="flex items-start gap-2 text-sm text-[#1A3A3F]/80">
                    <input
                      type="checkbox"
                      checked={state.acceptTerms}
                      onChange={(e) => setState((s) => ({ ...s, acceptTerms: e.target.checked }))}
                      className="mt-0.5 h-5 w-5 rounded border-brand-300"
                      aria-invalid={Boolean(form.errors.acceptTerms)}
                    />
                    <span>{t('signup.terms')}</span>
                  </label>
                  <FieldError>{form.errors.acceptTerms}</FieldError>
                </div>

                <Button type="submit" disabled={register.isPending} className="min-h-[48px]">
                  {register.isPending ? t('signup.creating') : t('signup.submit')}
                </Button>

                <p className="text-center text-sm text-[#1A3A3F]/70">
                  {t('signup.haveAccount')}{' '}
                  <Link href="/login" className="font-semibold text-brand-600 hover:text-brand-700 hover:underline">
                    {t('signup.toLogin')}
                  </Link>
                </p>
              </form>
            </CardContent>
          </Card>

          <p className="mt-4 text-center text-xs text-[#1A3A3F]/60">{t('signup.gdprNote')}</p>
        </div>
      </div>
    </main>
  );
}
