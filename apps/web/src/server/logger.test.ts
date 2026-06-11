import { describe, expect, it } from 'vitest';
import { redactFields } from './logger';

// INC-6: el cinturón de seguridad anti-PII de los logs (RGPD art. 9).
describe('logger.redactFields — sin PII en logs', () => {
  it('redacta claves de identificación directa', () => {
    const out = redactFields({
      userName: 'María García',
      email: 'maria@x.es',
      residentNationalId: '123Z',
      phone: '600111222',
    });
    expect(Object.values(out)).toEqual([
      '[REDACTED]',
      '[REDACTED]',
      '[REDACTED]',
      '[REDACTED]',
    ]);
  });

  it('redacta claves clínicas y de contenido', () => {
    const out = redactFields({
      diagnosisCode: 'I10',
      allergySubstance: 'penicilina',
      notes: 'texto libre',
      payload: '{...}',
      summary: 'resumen clínico',
    });
    for (const v of Object.values(out)) expect(v).toBe('[REDACTED]');
  });

  it('redacta secretos', () => {
    const out = redactFields({ authToken: 'abc', clientSecret: 'xyz', password: 'p' });
    for (const v of Object.values(out)) expect(v).toBe('[REDACTED]');
  });

  it('deja pasar identificadores opacos y métricas', () => {
    const out = redactFields({
      tenantId: 'cltn123',
      residentId: 'clrs456',
      path: 'medications.push',
      durationMs: 42,
      code: 'FORBIDDEN',
      ok: false,
    });
    expect(out).toEqual({
      tenantId: 'cltn123',
      residentId: 'clrs456',
      path: 'medications.push',
      durationMs: 42,
      code: 'FORBIDDEN',
      ok: false,
    });
  });

  it('no redacta valores null/undefined (no hay nada que filtrar)', () => {
    const out = redactFields({ email: undefined, name: null });
    expect(out.email).toBeUndefined();
    expect(out.name).toBeNull();
  });
});
