import { describe, expect, it } from 'vitest';
import { credentialsSchema } from './auth-schema';

describe('credentialsSchema', () => {
  it('acepta credenciales válidas', () => {
    const result = credentialsSchema.safeParse({
      email: 'auxiliar@demo.vetlla.dev',
      password: 'vetlla1234',
    });
    expect(result.success).toBe(true);
  });

  it('rechaza email inválido', () => {
    const result = credentialsSchema.safeParse({ email: 'no-es-email', password: 'x' });
    expect(result.success).toBe(false);
  });

  it('rechaza contraseña vacía', () => {
    const result = credentialsSchema.safeParse({ email: 'a@b.com', password: '' });
    expect(result.success).toBe(false);
  });
});
