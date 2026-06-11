import type { PlanTier } from '@vetlla/db';

// Catálogo de planes (pricing por plaza/módulo). El dato persistido en BD es
// solo el tier del tenant; precios y módulos viven aquí para poder iterarlos
// sin migración.
//
// HIPÓTESIS DE PRECIO (pendiente de validar con pilotos — Q-002): el único
// precio público del mercado es GdR (59 €/centro + 2 €/residente/mes);
// Vetlla se posiciona premium por cloud-native + IA. Cifras en céntimos.

export interface PlanDef {
  tier: PlanTier;
  /** Precio por plaza ocupada y mes, en céntimos de euro (0 = gratis). */
  pricePerBedMonthCents: number;
  /** Módulos incluidos (claves estables, etiquetadas vía i18n plan.module.*). */
  modules: readonly string[];
  /** Días de prueba (solo TRIAL). */
  trialDays?: number;
}

export const TRIAL_DAYS = 30;

export const PLAN_CATALOG: Record<PlanTier, PlanDef> = {
  TRIAL: {
    tier: 'TRIAL',
    pricePerBedMonthCents: 0,
    trialDays: TRIAL_DAYS,
    // La prueba incluye TODO: que el centro evalúe el producto completo.
    modules: ['gestion', 'atencion', 'mar', 'pia', 'portal', 'copiloto', 'auditoria'],
  },
  ESENCIAL: {
    tier: 'ESENCIAL',
    pricePerBedMonthCents: 300, // 3 €/plaza/mes
    modules: ['gestion', 'atencion', 'mar', 'pia', 'auditoria'],
  },
  PROFESIONAL: {
    tier: 'PROFESIONAL',
    pricePerBedMonthCents: 500, // 5 €/plaza/mes
    modules: ['gestion', 'atencion', 'mar', 'pia', 'portal', 'copiloto', 'auditoria'],
  },
};

/** Días restantes de prueba (0 si caducó; null si no aplica). */
export function trialDaysLeft(trialEndsAt: Date | string | null, now = new Date()): number | null {
  if (!trialEndsAt) return null;
  const end = new Date(trialEndsAt).getTime();
  const ms = end - now.getTime();
  return Math.max(0, Math.ceil(ms / 86_400_000));
}

/** Coste mensual estimado en céntimos: plazas ocupadas × precio del plan. */
export function estimateMonthlyCents(tier: PlanTier, occupiedBeds: number): number {
  return PLAN_CATALOG[tier].pricePerBedMonthCents * Math.max(0, occupiedBeds);
}

export function formatEuros(cents: number, locale: string): string {
  return new Intl.NumberFormat(locale === 'ca' ? 'ca-ES' : 'es-ES', {
    style: 'currency',
    currency: 'EUR',
  }).format(cents / 100);
}
