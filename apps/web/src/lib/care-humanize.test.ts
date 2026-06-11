import { describe, expect, it } from 'vitest';
import { humanizeCareRecord } from './care-humanize';

describe('humanizeCareRecord', () => {
  it('CONSTANTES con valores los enuncia de forma cercana', () => {
    const text = humanizeCareRecord('CONSTANTES', { tension: '120/80', temperatura: 36.5, sato2: 97 });
    expect(text).toContain('constantes');
    expect(text).toContain('tensión 120/80');
    expect(text).toContain('temperatura 36.5º');
    expect(text).toContain('saturación 97%');
  });

  it('INGESTA traduce el porcentaje a lenguaje natural', () => {
    expect(humanizeCareRecord('INGESTA', { comida: 'Comida', porcentaje: 50 })).toBe('Comió el 50% en comida.');
    expect(humanizeCareRecord('INGESTA', { comida: 'Cena', porcentaje: 0 })).toBe('No comió en cena.');
    expect(humanizeCareRecord('INGESTA', { comida: 'Desayuno', porcentaje: 100 })).toBe('Comió todo en desayuno.');
  });

  it('DEPOSICION distingue sí/no', () => {
    expect(humanizeCareRecord('DEPOSICION', { deposicion: 'Sí' })).toMatch(/deposición/i);
    expect(humanizeCareRecord('DEPOSICION', { deposicion: 'No' })).toBe('Sin deposición.');
  });

  it('INCIDENCIA usa la descripción tal cual', () => {
    expect(humanizeCareRecord('INCIDENCIA', { descripcion: 'Pasó buena tarde en el jardín.' })).toBe(
      'Pasó buena tarde en el jardín.',
    );
  });

  it('ABVD cae a actividad o nota, y hay un fallback seguro', () => {
    expect(humanizeCareRecord('ABVD', { actividad: 'Aseo con ayuda' })).toBe('Aseo con ayuda');
    expect(humanizeCareRecord('CONSTANTES', {})).toBe('Se le tomaron las constantes.');
    expect(humanizeCareRecord('DESCONOCIDO', {})).toBe('Nuevo registro de atención.');
  });
});
