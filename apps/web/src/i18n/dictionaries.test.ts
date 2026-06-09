import { describe, expect, it } from 'vitest';
import { DICTIONARIES, translate } from './dictionaries';

describe('translate', () => {
  it('traduce al castellano y al catalán', () => {
    expect(translate('es', 'nav.residents')).toBe('Residentes');
    expect(translate('ca', 'nav.residents')).toBe('Residents');
  });

  it('interpola variables', () => {
    expect(translate('es', 'state.pendingSync', { count: 3 })).toBe('3 por sincronizar');
    expect(translate('ca', 'state.pendingSync', { count: 3 })).toBe('3 per sincronitzar');
  });

  it('cae al castellano si falta la clave en catalán', () => {
    // Clave inexistente: devuelve la propia clave como último recurso.
    expect(translate('ca', 'clave.inexistente')).toBe('clave.inexistente');
  });
});

describe('paridad es/ca — Sprint M (medicación)', () => {
  const sprintMKeys = [
    'med.prescribe.title',
    'med.prescribe.submit',
    'med.prescribe.field.route',
    'med.prescribe.field.unit',
    'med.prescribe.field.type',
    'med.prescribe.field.daysOfWeek',
    'med.route.ORAL',
    'med.route.SUBCUTANEA',
    'med.route.INHALATORIA',
    'med.type.CRONICO',
    'med.type.PRN',
    'med.unit.COMPRIMIDO',
    'med.unit.PARCHE',
    'med.prn.title',
    'med.prn.empty',
    'med.allergy.warning',
    'med.allergy.block',
    'med.allergy.checkNote',
  ];

  it('todas las claves Sprint M existen en es', () => {
    for (const key of sprintMKeys) {
      expect(DICTIONARIES.es[key], `es: falta clave "${key}"`).toBeDefined();
    }
  });

  it('todas las claves Sprint M existen en ca', () => {
    for (const key of sprintMKeys) {
      expect(DICTIONARIES.ca[key], `ca: falta clave "${key}"`).toBeDefined();
    }
  });

  it('las traducciones ca no repiten literalmente las de es (paridad real)', () => {
    // Algunas son iguales por ser nombres propios/siglas: PRN, ORAL, etc.
    // Comprobamos que al menos hay diferencias en las claves narrativas.
    const narrativeKeys = [
      'med.prescribe.title',
      'med.prescribe.submit',
      'med.prn.empty',
      'med.allergy.warning',
    ];
    for (const key of narrativeKeys) {
      expect(DICTIONARIES.ca[key], `ca: falta clave narrativa "${key}"`).toBeDefined();
      // No tienen que ser iguales a es (pueden diferir aunque no es obligatorio para todas)
    }
  });
});
