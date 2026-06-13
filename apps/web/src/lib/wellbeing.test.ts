/**
 * Tests de lib/wellbeing.ts — funciones puras, sin BD.
 *
 * RF-SOC-007: alerta de revisión del perfil de bienestar ACP vencida.
 */

import { describe, expect, it } from 'vitest';
import { daysUntilReview, getReviewStatus, isReviewOverdue } from './wellbeing';

const NOW = new Date('2026-06-13T10:00:00.000Z');

// ---------------------------------------------------------------------------
// isReviewOverdue
// ---------------------------------------------------------------------------

describe('isReviewOverdue', () => {
  it('devuelve false si nextReviewDate es null', () => {
    expect(isReviewOverdue(null, NOW)).toBe(false);
  });

  it('devuelve false si nextReviewDate es undefined', () => {
    expect(isReviewOverdue(undefined, NOW)).toBe(false);
  });

  it('devuelve false si la revisión es en el futuro', () => {
    const future = new Date('2026-07-01T00:00:00.000Z');
    expect(isReviewOverdue(future, NOW)).toBe(false);
  });

  it('devuelve true si la revisión es hoy (mismo día, hora anterior)', () => {
    // La revisión se pone a las 00:00 del día; now es las 10:00 → vencida.
    const today = new Date('2026-06-13T00:00:00.000Z');
    expect(isReviewOverdue(today, NOW)).toBe(true);
  });

  it('devuelve true si la revisión es hoy (exactamente igual a now)', () => {
    expect(isReviewOverdue(NOW, NOW)).toBe(true);
  });

  it('devuelve true si la revisión fue ayer', () => {
    const yesterday = new Date('2026-06-12T00:00:00.000Z');
    expect(isReviewOverdue(yesterday, NOW)).toBe(true);
  });

  it('devuelve true si la revisión fue hace 6 meses', () => {
    const old = new Date('2025-12-13T00:00:00.000Z');
    expect(isReviewOverdue(old, NOW)).toBe(true);
  });

  it('devuelve false si la revisión es mañana', () => {
    const tomorrow = new Date('2026-06-14T00:00:00.000Z');
    expect(isReviewOverdue(tomorrow, NOW)).toBe(false);
  });

  it('usa new Date() como fallback si no se pasa now', () => {
    // Una revisión hace 10 años siempre está vencida.
    const veryOld = new Date('2010-01-01T00:00:00.000Z');
    expect(isReviewOverdue(veryOld)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// daysUntilReview
// ---------------------------------------------------------------------------

describe('daysUntilReview', () => {
  it('devuelve null si nextReviewDate es null', () => {
    expect(daysUntilReview(null, NOW)).toBeNull();
  });

  it('devuelve null si nextReviewDate es undefined', () => {
    expect(daysUntilReview(undefined, NOW)).toBeNull();
  });

  it('devuelve 0 si la revisión es hoy (cualquier hora del día)', () => {
    const todayMidnight = new Date('2026-06-13T00:00:00.000Z');
    expect(daysUntilReview(todayMidnight, NOW)).toBe(0);
  });

  it('devuelve 0 exactamente cuando now === nextReviewDate', () => {
    expect(daysUntilReview(NOW, NOW)).toBe(0);
  });

  it('devuelve -1 si la revisión fue ayer', () => {
    const yesterday = new Date('2026-06-12T00:00:00.000Z');
    expect(daysUntilReview(yesterday, NOW)).toBe(-1);
  });

  it('devuelve -7 si la revisión fue hace 7 días', () => {
    const sevenDaysAgo = new Date('2026-06-06T00:00:00.000Z');
    expect(daysUntilReview(sevenDaysAgo, NOW)).toBe(-7);
  });

  it('devuelve 1 si la revisión es mañana', () => {
    const tomorrow = new Date('2026-06-14T00:00:00.000Z');
    expect(daysUntilReview(tomorrow, NOW)).toBe(1);
  });

  it('devuelve 30 si la revisión es en 30 días', () => {
    const in30 = new Date('2026-07-13T00:00:00.000Z');
    expect(daysUntilReview(in30, NOW)).toBe(30);
  });

  it('devuelve valor positivo correcto para revisión en 6 meses', () => {
    const in6m = new Date('2026-12-13T00:00:00.000Z');
    const days = daysUntilReview(in6m, NOW);
    expect(days).toBe(183); // 2026 no es bisiesto; jun(17)+jul(31)+ago(31)+sep(30)+oct(31)+nov(30)+dic(13)
  });
});

// ---------------------------------------------------------------------------
// getReviewStatus
// ---------------------------------------------------------------------------

describe('getReviewStatus', () => {
  it('devuelve NOT_SET si no hay fecha', () => {
    expect(getReviewStatus(null, NOW)).toBe('NOT_SET');
    expect(getReviewStatus(undefined, NOW)).toBe('NOT_SET');
  });

  it('devuelve OVERDUE si la revisión es hoy', () => {
    const today = new Date('2026-06-13T00:00:00.000Z');
    expect(getReviewStatus(today, NOW)).toBe('OVERDUE');
  });

  it('devuelve OVERDUE si la revisión fue ayer', () => {
    const yesterday = new Date('2026-06-12T00:00:00.000Z');
    expect(getReviewStatus(yesterday, NOW)).toBe('OVERDUE');
  });

  it('devuelve DUE_SOON si la revisión es en 15 días (dentro del umbral de 30)', () => {
    const in15 = new Date('2026-06-28T00:00:00.000Z');
    expect(getReviewStatus(in15, NOW)).toBe('DUE_SOON');
  });

  it('devuelve DUE_SOON si la revisión es en exactamente 30 días (umbral default)', () => {
    const in30 = new Date('2026-07-13T00:00:00.000Z');
    expect(getReviewStatus(in30, NOW)).toBe('DUE_SOON');
  });

  it('devuelve OK si la revisión es en 31 días', () => {
    const in31 = new Date('2026-07-14T00:00:00.000Z');
    expect(getReviewStatus(in31, NOW)).toBe('OK');
  });

  it('devuelve OK si la revisión es en 6 meses', () => {
    const in6m = new Date('2026-12-13T00:00:00.000Z');
    expect(getReviewStatus(in6m, NOW)).toBe('OK');
  });

  it('respeta el warningDays personalizado (60 días)', () => {
    const in45 = new Date('2026-07-28T00:00:00.000Z');
    // Con warningDays=30 → OK. Con warningDays=60 → DUE_SOON.
    expect(getReviewStatus(in45, NOW, 30)).toBe('OK');
    expect(getReviewStatus(in45, NOW, 60)).toBe('DUE_SOON');
  });

  it('devuelve OVERDUE con warningDays=0 si la revisión es hoy', () => {
    const today = new Date('2026-06-13T00:00:00.000Z');
    expect(getReviewStatus(today, NOW, 0)).toBe('OVERDUE');
  });
});
