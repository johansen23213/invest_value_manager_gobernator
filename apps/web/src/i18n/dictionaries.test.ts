import { describe, expect, it } from 'vitest';
import { translate } from './dictionaries';

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
