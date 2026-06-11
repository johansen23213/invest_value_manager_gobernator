'use client';

import { useActionState } from 'react';
import { authenticate, type LoginState } from './actions';
import { useT } from '@/i18n/provider';

const initialState: LoginState = undefined;

export function LoginForm() {
  const { t } = useT();
  const [state, formAction, isPending] = useActionState(authenticate, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-4" aria-label={t('action.login')}>
      <div className="flex flex-col gap-1">
        {/* ATENCIÓN: label "Email" es aserción de smoke.spec.ts y auth helpers — no cambiar. */}
        <label htmlFor="email" className="text-sm font-semibold text-[#1A3A3F]">
          {t('login.email')}
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          className="min-h-touch rounded-2xl border border-brand-200 bg-white px-4 py-2 text-base text-[#1A3A3F] placeholder:text-brand-300 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
        />
      </div>

      <div className="flex flex-col gap-1">
        {/* ATENCIÓN: label "Contraseña" es aserción de auth helpers — no cambiar. */}
        <label htmlFor="password" className="text-sm font-semibold text-[#1A3A3F]">
          {t('login.password')}
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="min-h-touch rounded-2xl border border-brand-200 bg-white px-4 py-2 text-base text-[#1A3A3F] placeholder:text-brand-300 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
        />
      </div>

      {state?.error ? (
        <p role="alert" className="text-sm font-medium text-red-600">
          {t(state.error)}
        </p>
      ) : null}

      {/* ATENCIÓN: botón con texto "Entrar" (t('login.submit')) — aserción /entrar/i en e2e. */}
      <button
        type="submit"
        disabled={isPending}
        className="min-h-touch rounded-full bg-brand-700 px-5 py-2 font-semibold text-white transition hover:bg-brand-800 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isPending ? t('login.loading') : t('login.submit')}
      </button>
    </form>
  );
}
