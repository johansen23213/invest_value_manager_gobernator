import { describe, expect, it } from 'vitest';
import { doseStatusLabel, doseTone } from './mar-ui';

// Función de traducción stub para los tests (evita dependencia del contexto React).
function t(key: string): string {
  const map: Record<string, string> = {
    'med.status.PENDIENTE': 'Pendiente',
    'med.status.RETRASADA': 'Retrasada',
    'med.status.ADMINISTRADO': 'Administrada',
    'med.status.NO_ADMINISTRADO': 'No administrada',
    'med.status.RECHAZADO': 'Rechazada',
  };
  return map[key] ?? key;
}

describe('doseStatusLabel', () => {
  it('PENDIENTE sin overdue devuelve "Pendiente"', () => {
    expect(doseStatusLabel('PENDIENTE', false, t)).toBe('Pendiente');
  });

  it('PENDIENTE con overdue devuelve "Retrasada" (canal no-color)', () => {
    expect(doseStatusLabel('PENDIENTE', true, t)).toBe('Retrasada');
  });

  it('ADMINISTRADO devuelve "Administrada"', () => {
    expect(doseStatusLabel('ADMINISTRADO', false, t)).toBe('Administrada');
    expect(doseStatusLabel('ADMINISTRADO', true, t)).toBe('Administrada'); // overdue irrelevante
  });

  it('NO_ADMINISTRADO devuelve "No administrada"', () => {
    expect(doseStatusLabel('NO_ADMINISTRADO', false, t)).toBe('No administrada');
  });

  it('RECHAZADO devuelve "Rechazada"', () => {
    expect(doseStatusLabel('RECHAZADO', false, t)).toBe('Rechazada');
  });
});

describe('doseTone', () => {
  it('PENDIENTE sin overdue es neutral', () => {
    expect(doseTone('PENDIENTE', false)).toBe('neutral');
  });

  it('PENDIENTE con overdue es amber (alerta visual)', () => {
    expect(doseTone('PENDIENTE', true)).toBe('amber');
  });

  it('ADMINISTRADO es green', () => {
    expect(doseTone('ADMINISTRADO', false)).toBe('green');
  });

  it('NO_ADMINISTRADO es red', () => {
    expect(doseTone('NO_ADMINISTRADO', false)).toBe('red');
  });

  it('RECHAZADO es amber', () => {
    expect(doseTone('RECHAZADO', false)).toBe('amber');
  });
});
