'use server';

import { AuthError } from 'next-auth';
import { signIn } from '@/auth';
import { credentialsSchema } from '@/lib/auth-schema';

export type LoginStep = 'credentials' | 'totp';

export interface LoginState {
  /** Clave de traducción del error, o undefined si no hay error. */
  error?: string;
  /**
   * Siguiente paso del flujo:
   *  - 'credentials': paso normal (email+contraseña).
   *  - 'totp': contraseña OK pero MFA requerido; mostrar campo TOTP/recovery.
   */
  step?: LoginStep;
}

export async function authenticate(
  _prevState: LoginState | undefined,
  formData: FormData,
): Promise<LoginState> {
  const parsed = credentialsSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  });

  if (!parsed.success) {
    return { error: 'login.invalid', step: 'credentials' };
  }

  const totp = (formData.get('totp') as string | null) ?? '';
  const recoveryCode = (formData.get('recoveryCode') as string | null) ?? '';

  try {
    await signIn('credentials', {
      email: parsed.data.email,
      password: parsed.data.password,
      ...(totp ? { totp } : {}),
      ...(recoveryCode ? { recoveryCode } : {}),
      redirectTo: '/',
    });
  } catch (error) {
    if (error instanceof AuthError) {
      // Auth.js v5 encapsula el error del authorize() en cause.err.
      // La cadena tipada (MFA_REQUIRED, MFA_INVALID, ACCOUNT_LOCKED) está en
      // el mensaje de la causa interna.
      const cause = (error as AuthError & { cause?: { err?: Error } }).cause;
      const msg = cause?.err?.message ?? '';

      if (msg === 'MFA_REQUIRED') {
        return { step: 'totp', error: 'login.error.MFA_REQUIRED' };
      }
      if (msg === 'MFA_INVALID') {
        return { step: 'totp', error: 'login.error.MFA_INVALID' };
      }
      if (msg === 'ACCOUNT_LOCKED') {
        return { step: 'credentials', error: 'login.error.ACCOUNT_LOCKED' };
      }

      return { error: 'login.error', step: 'credentials' };
    }
    // Re-lanza el redirect de Next (NEXT_REDIRECT) y cualquier otro error.
    throw error;
  }

  return {};
}
