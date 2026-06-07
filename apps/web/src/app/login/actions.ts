'use server';

import { AuthError } from 'next-auth';
import { signIn } from '@/auth';
import { credentialsSchema } from '@/lib/auth-schema';

export type LoginState = { error: string } | undefined;

export async function authenticate(
  _prevState: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const parsed = credentialsSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  });

  if (!parsed.success) {
    return { error: 'Introduce un email y una contraseña válidos.' };
  }

  try {
    await signIn('credentials', {
      email: parsed.data.email,
      password: parsed.data.password,
      redirectTo: '/',
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return { error: 'Credenciales incorrectas.' };
    }
    // Re-lanza el redirect de Next (NEXT_REDIRECT) y cualquier otro error.
    throw error;
  }

  return undefined;
}
