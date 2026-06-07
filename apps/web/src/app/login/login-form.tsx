'use client';

import { useActionState } from 'react';
import { authenticate, type LoginState } from './actions';

const initialState: LoginState = undefined;

export function LoginForm() {
  const [state, formAction, isPending] = useActionState(authenticate, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-4" aria-label="Iniciar sesión">
      <div className="flex flex-col gap-1">
        <label htmlFor="email" className="font-medium">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          className="min-h-touch rounded-md border border-slate-300 px-3 py-2 text-base focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-400"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="password" className="font-medium">
          Contraseña
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="min-h-touch rounded-md border border-slate-300 px-3 py-2 text-base focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-400"
        />
      </div>

      {state?.error ? (
        <p role="alert" className="text-sm font-medium text-red-600">
          {state.error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={isPending}
        className="min-h-touch rounded-md bg-slate-900 px-4 py-2 font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isPending ? 'Entrando…' : 'Entrar'}
      </button>
    </form>
  );
}
