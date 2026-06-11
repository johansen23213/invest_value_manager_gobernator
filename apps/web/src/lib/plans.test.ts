import { describe, expect, it } from 'vitest';
import {
  estimateMonthlyCents,
  formatEuros,
  PLAN_CATALOG,
  TRIAL_DAYS,
  trialDaysLeft,
} from './plans';

describe('plans — catálogo y cálculo de consumo', () => {
  it('el TRIAL incluye todos los módulos del plan más alto', () => {
    for (const m of PLAN_CATALOG.PROFESIONAL.modules) {
      expect(PLAN_CATALOG.TRIAL.modules).toContain(m);
    }
    expect(PLAN_CATALOG.TRIAL.pricePerBedMonthCents).toBe(0);
    expect(PLAN_CATALOG.TRIAL.trialDays).toBe(TRIAL_DAYS);
  });

  it('PROFESIONAL incluye copiloto y portal; ESENCIAL no', () => {
    expect(PLAN_CATALOG.PROFESIONAL.modules).toContain('copiloto');
    expect(PLAN_CATALOG.PROFESIONAL.modules).toContain('portal');
    expect(PLAN_CATALOG.ESENCIAL.modules).not.toContain('copiloto');
    expect(PLAN_CATALOG.ESENCIAL.modules).not.toContain('portal');
  });

  it('coste mensual = plazas ocupadas × precio del plan', () => {
    expect(estimateMonthlyCents('ESENCIAL', 30)).toBe(30 * 300);
    expect(estimateMonthlyCents('PROFESIONAL', 30)).toBe(30 * 500);
    expect(estimateMonthlyCents('TRIAL', 30)).toBe(0);
    expect(estimateMonthlyCents('ESENCIAL', -5)).toBe(0); // sin negativos
  });

  it('trialDaysLeft: redondea hacia arriba, nunca negativo, null si no aplica', () => {
    const now = new Date('2026-06-11T12:00:00Z');
    expect(trialDaysLeft(new Date('2026-06-21T12:00:00Z'), now)).toBe(10);
    expect(trialDaysLeft(new Date('2026-06-12T00:00:00Z'), now)).toBe(1); // 12h -> 1 día
    expect(trialDaysLeft(new Date('2026-06-01T00:00:00Z'), now)).toBe(0); // caducó
    expect(trialDaysLeft(null, now)).toBeNull();
  });

  it('formatEuros formatea según el locale', () => {
    expect(formatEuros(500, 'es')).toContain('5');
    expect(formatEuros(500, 'es')).toContain('€');
  });
});
