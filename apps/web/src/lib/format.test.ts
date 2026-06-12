/**
 * Tests de lib/format.ts — funciones de formateo de fechas localizadas.
 *
 * Las funciones son puras (solo usan Intl): testables sin dependencias de red/BD.
 * Se comprueba:
 *   - Que retornan '—' para valores nulos/undefined/vacíos.
 *   - Que retornan strings no vacíos para fechas válidas.
 *   - Que el formato incluye el año correcto (invariante independiente del locale).
 *   - Que formatDateTime incluye la hora además de la fecha.
 *   - Que formatTime retorna solo la hora (sin fecha).
 */

import { describe, expect, it } from 'vitest';
import { formatDate, formatDateTime, formatTime } from './format';

// Fecha de referencia: 2026-06-12 08:30 UTC
const REF_DATE = new Date('2026-06-12T08:30:00.000Z');

// Locales disponibles en el sistema
const LOCALES = ['es', 'ca'] as const;

// ---------------------------------------------------------------------------
// Valores nulos / vacíos → '—'
// ---------------------------------------------------------------------------

describe('formatDate — valores nulos', () => {
  it.each([null, undefined, ''] as const)('null/undefined/"" → "—"', (v) => {
    expect(formatDate('es', v)).toBe('—');
  });
});

describe('formatDateTime — valores nulos', () => {
  it.each([null, undefined, ''] as const)('null/undefined/"" → "—"', (v) => {
    expect(formatDateTime('es', v)).toBe('—');
  });
});

describe('formatTime — valores nulos', () => {
  it.each([null, undefined, ''] as const)('null/undefined/"" → "—"', (v) => {
    expect(formatTime('es', v)).toBe('—');
  });
});

// ---------------------------------------------------------------------------
// formatDate — fecha válida
// ---------------------------------------------------------------------------

describe('formatDate — fecha válida', () => {
  it.each(LOCALES)('retorna string no vacío para locale %s', (locale) => {
    const result = formatDate(locale, REF_DATE);
    expect(result).not.toBe('—');
    expect(result.length).toBeGreaterThan(0);
  });

  it('incluye el año 2026 en la salida es', () => {
    expect(formatDate('es', REF_DATE)).toContain('2026');
  });

  it('incluye el año 2026 en la salida ca', () => {
    expect(formatDate('ca', REF_DATE)).toContain('2026');
  });

  it('acepta string ISO como entrada', () => {
    const result = formatDate('es', '2026-06-12T08:30:00.000Z');
    expect(result).not.toBe('—');
    expect(result).toContain('2026');
  });

  it('acepta timestamp numérico como entrada', () => {
    const result = formatDate('es', REF_DATE.getTime());
    expect(result).not.toBe('—');
    expect(result).toContain('2026');
  });

  it('es pura: misma entrada, misma salida', () => {
    expect(formatDate('es', REF_DATE)).toBe(formatDate('es', REF_DATE));
  });
});

// ---------------------------------------------------------------------------
// formatDateTime — fecha+hora válida
// ---------------------------------------------------------------------------

describe('formatDateTime — fecha+hora válida', () => {
  it.each(LOCALES)('retorna string no vacío para locale %s', (locale) => {
    const result = formatDateTime(locale, REF_DATE);
    expect(result).not.toBe('—');
    expect(result.length).toBeGreaterThan(0);
  });

  it('incluye el año 2026', () => {
    expect(formatDateTime('es', REF_DATE)).toContain('2026');
  });

  it('la salida de formatDateTime es más larga que la de formatDate (incluye hora)', () => {
    const date   = formatDate('es', REF_DATE);
    const dateTime = formatDateTime('es', REF_DATE);
    // datetime tiene al menos una parte más (la hora)
    expect(dateTime.length).toBeGreaterThan(date.length);
  });

  it('es pura: misma entrada, misma salida', () => {
    expect(formatDateTime('es', REF_DATE)).toBe(formatDateTime('es', REF_DATE));
  });
});

// ---------------------------------------------------------------------------
// formatTime — solo hora
// ---------------------------------------------------------------------------

describe('formatTime — solo hora', () => {
  it.each(LOCALES)('retorna string no vacío para locale %s', (locale) => {
    const result = formatTime(locale, REF_DATE);
    expect(result).not.toBe('—');
    expect(result.length).toBeGreaterThan(0);
  });

  it('la salida NO incluye el año (es solo hora)', () => {
    // La hora '08:30' nunca debería incluir '2026'
    expect(formatTime('es', REF_DATE)).not.toContain('2026');
  });

  it('es pura: misma entrada, misma salida', () => {
    expect(formatTime('es', REF_DATE)).toBe(formatTime('es', REF_DATE));
  });
});
