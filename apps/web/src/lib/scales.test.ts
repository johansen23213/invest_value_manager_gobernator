import { describe, expect, it } from 'vitest';
import { interpretBarthel, interpretTinetti, isValidScore } from './scales';

describe('isValidScore', () => {
  it('valida el rango de Barthel (0–100)', () => {
    expect(isValidScore('BARTHEL', 0)).toBe(true);
    expect(isValidScore('BARTHEL', 100)).toBe(true);
    expect(isValidScore('BARTHEL', 101)).toBe(false);
    expect(isValidScore('BARTHEL', -1)).toBe(false);
  });

  it('valida el rango de Tinetti (0–28)', () => {
    expect(isValidScore('TINETTI', 28)).toBe(true);
    expect(isValidScore('TINETTI', 29)).toBe(false);
  });

  it('rechaza valores no enteros', () => {
    expect(isValidScore('BARTHEL', 50.5)).toBe(false);
  });
});

describe('interpretBarthel', () => {
  it('clasifica el grado de dependencia', () => {
    expect(interpretBarthel(100)).toBe('Independiente');
    expect(interpretBarthel(75)).toBe('Dependencia leve');
    expect(interpretBarthel(45)).toBe('Dependencia moderada');
    expect(interpretBarthel(25)).toBe('Dependencia grave');
    expect(interpretBarthel(10)).toBe('Dependencia total');
  });
});

describe('interpretTinetti', () => {
  it('clasifica el riesgo de caída', () => {
    expect(interpretTinetti(26)).toBe('Riesgo de caída bajo');
    expect(interpretTinetti(20)).toBe('Riesgo de caída moderado');
    expect(interpretTinetti(12)).toBe('Riesgo de caída alto');
  });
});
