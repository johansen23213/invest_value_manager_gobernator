'use client';

import { useActionState, useState } from 'react';
import { authenticate, type LoginState } from './actions';
import { useT } from '@/i18n/provider';

const initialState: LoginState = { step: 'credentials' };

export function LoginForm() {
  const { t } = useT();
  const [state, formAction, isPending] = useActionState(authenticate, initialState);

  /**
   * Credenciales del primer paso conservadas en memoria del componente.
   * Nunca van a localStorage ni a ningún almacenamiento persistente.
   * Se usan como campos ocultos al re-enviar el formulario en el paso TOTP.
   */
  const [savedEmail, setSavedEmail] = useState('');
  const [savedPassword, setSavedPassword] = useState('');

  /** Modo de segundo factor: 'totp' o 'recovery'. */
  const [mfaMode, setMfaMode] = useState<'totp' | 'recovery'>('totp');

  const step = state?.step ?? 'credentials';

  /**
   * Intercepta el submit del paso de credenciales para capturar email+password
   * antes de que la acción del servidor los consuma.
   */
  function handleCredentialsSubmit(e: React.FormEvent<HTMLFormElement>) {
    const fd = new FormData(e.currentTarget);
    setSavedEmail((fd.get('email') as string) ?? '');
    setSavedPassword((fd.get('password') as string) ?? '');
    // No llamamos e.preventDefault(): el formulario seguirá hacia la acción del servidor.
  }

  // ── Paso TOTP / recovery ───────────────────────────────────────────────────
  if (step === 'totp') {
    return (
      <form
        action={formAction}
        className="flex flex-col gap-4"
        aria-label={t('mfa.totp.label')}
      >
        {/* Campos ocultos: reenviamos las credenciales del paso anterior */}
        <input type="hidden" name="email" value={savedEmail} />
        <input type="hidden" name="password" value={savedPassword} />

        {/* Mensaje informativo o de error */}
        <div
          role="status"
          className={`rounded-2xl px-4 py-3 text-sm ${
            state?.error === 'login.error.MFA_INVALID'
              ? 'border border-red-200 bg-red-50 text-red-700'
              : 'border border-brand-100 bg-brand-50 text-[#1A3A3F]/70'
          }`}
          aria-live="polite"
        >
          {state?.error
            ? t(state.error)
            : t('login.error.MFA_REQUIRED')}
        </div>

        {mfaMode === 'totp' ? (
          /* ── Campo TOTP ───────────────────────────────────────────────── */
          <div className="flex flex-col gap-1">
            <label htmlFor="totp" className="text-sm font-semibold text-[#1A3A3F]">
              {t('mfa.totp.label')}
            </label>
            <input
              id="totp"
              name="totp"
              type="text"
              inputMode="numeric"
              pattern="[0-9]{6}"
              maxLength={6}
              autoComplete="one-time-code"
              placeholder={t('mfa.totp.ph')}
              autoFocus
              aria-describedby={state?.error === 'login.error.MFA_INVALID' ? 'totp-err' : undefined}
              aria-invalid={state?.error === 'login.error.MFA_INVALID'}
              className="min-h-touch rounded-2xl border border-brand-200 bg-white px-4 py-2 text-base text-[#1A3A3F] placeholder:text-brand-300 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30 max-w-[200px]"
            />
            {state?.error === 'login.error.MFA_INVALID' && (
              <p id="totp-err" role="alert" className="text-sm font-medium text-red-600">
                {t('login.error.MFA_INVALID')}
              </p>
            )}

            <button
              type="button"
              className="mt-1 self-start text-sm text-brand-600 hover:text-brand-700 hover:underline"
              onClick={() => setMfaMode('recovery')}
            >
              {t('mfa.totp.useRecovery')}
            </button>
          </div>
        ) : (
          /* ── Campo Recovery Code ──────────────────────────────────────── */
          <div className="flex flex-col gap-1">
            <label htmlFor="recoveryCode" className="text-sm font-semibold text-[#1A3A3F]">
              {t('mfa.recovery.label')}
            </label>
            <input
              id="recoveryCode"
              name="recoveryCode"
              type="text"
              maxLength={8}
              autoComplete="off"
              placeholder={t('mfa.recovery.ph')}
              autoFocus
              aria-describedby={state?.error === 'login.error.MFA_INVALID' ? 'recovery-err' : undefined}
              aria-invalid={state?.error === 'login.error.MFA_INVALID'}
              className="min-h-touch rounded-2xl border border-brand-200 bg-white px-4 py-2 text-base text-[#1A3A3F] placeholder:text-brand-300 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30 max-w-[220px]"
            />
            {state?.error === 'login.error.MFA_INVALID' && (
              <p id="recovery-err" role="alert" className="text-sm font-medium text-red-600">
                {t('login.error.MFA_INVALID')}
              </p>
            )}

            <button
              type="button"
              className="mt-1 self-start text-sm text-brand-600 hover:text-brand-700 hover:underline"
              onClick={() => setMfaMode('totp')}
            >
              Usar código TOTP en su lugar
            </button>
          </div>
        )}

        {/* ATENCIÓN: botón con texto "Entrar" (t('login.submit')) — aserción /entrar/i en e2e. */}
        <button
          type="submit"
          disabled={isPending}
          className="min-h-touch rounded-full bg-brand-700 px-5 py-2 font-semibold text-white transition hover:bg-brand-800 disabled:cursor-not-allowed disabled:opacity-60 self-start"
        >
          {isPending ? t('mfa.totp.submitting') : t('mfa.totp.submit')}
        </button>
      </form>
    );
  }

  // ── Paso de credenciales (paso inicial, flujo normal) ──────────────────────
  return (
    <form
      action={formAction}
      onSubmit={handleCredentialsSubmit}
      className="flex flex-col gap-4"
      aria-label={t('action.login')}
    >
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
