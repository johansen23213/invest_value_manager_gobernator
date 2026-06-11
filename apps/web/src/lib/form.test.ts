import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { collectFieldErrors } from './form';

const schema = z.object({
  name: z.string().min(1, 'Indica el nombre.'),
  score: z.number().max(100, 'Máximo 100.'),
});

function errorsFor(value: unknown) {
  const res = schema.safeParse(value);
  if (res.success) throw new Error('se esperaba un error de validación');
  return collectFieldErrors(res.error);
}

describe('collectFieldErrors', () => {
  it('mapea cada campo a su mensaje', () => {
    const errors = errorsFor({ name: '', score: 200 });
    expect(errors).toEqual({ name: 'Indica el nombre.', score: 'Máximo 100.' });
  });

  it('solo conserva el primer error de cada campo', () => {
    const multi = z.object({
      score: z.number().min(0, 'Mínimo 0.').max(10, 'Máximo 10.'),
    });
    const res = multi.safeParse({ score: 50 });
    if (res.success) throw new Error('se esperaba error');
    const errors = collectFieldErrors(res.error);
    expect(Object.keys(errors)).toEqual(['score']);
  });

  it('usa _form para errores sin ruta de campo', () => {
    const refined = z.object({ a: z.number(), b: z.number() }).refine((v) => v.a < v.b, {
      message: 'a debe ser menor que b.',
    });
    const res = refined.safeParse({ a: 5, b: 1 });
    if (res.success) throw new Error('se esperaba error');
    expect(collectFieldErrors(res.error)._form).toBe('a debe ser menor que b.');
  });
});
