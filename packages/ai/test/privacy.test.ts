import { describe, expect, it } from 'vitest';
import { redactPii, rehydrate } from '../src/privacy';

describe('redactPii — identificadores estructurados', () => {
  it('tokeniza email', () => {
    const { redacted, map } = redactPii('Escribe a maria.lopez@example.com por favor');
    expect(redacted).toBe('Escribe a [[EMAIL_1]] por favor');
    expect(map).toEqual([
      { token: '[[EMAIL_1]]', value: 'maria.lopez@example.com', category: 'EMAIL' },
    ]);
  });

  it('tokeniza DNI y NIE', () => {
    const dni = redactPii('DNI 12345678Z');
    expect(dni.redacted).toBe('DNI [[DNI_1]]');
    const nie = redactPii('NIE X1234567L');
    expect(nie.redacted).toBe('NIE [[DNI_1]]');
  });

  it('tokeniza teléfono con y sin prefijo', () => {
    expect(redactPii('Llama al 612345678').redacted).toBe('Llama al [[TELEFONO_1]]');
    expect(redactPii('Llama al +34 612 34 56 78').redacted).toBe('Llama al [[TELEFONO_1]]');
  });

  it('email no se confunde con teléfono (orden de patrones)', () => {
    const { map } = redactPii('contacto: a@b.com tel 698765432');
    const categories = map.map((m) => m.category).sort();
    expect(categories).toEqual(['EMAIL', 'TELEFONO']);
  });
});

describe('redactPii — identificadores conocidos del expediente', () => {
  it('tokeniza nombre conocido', () => {
    const { redacted } = redactPii('Ana María tomó la medicación', {
      names: ['Ana María'],
    });
    expect(redacted).toBe('[[PERSONA_1]] tomó la medicación');
  });

  it('los nombres más largos se sustituyen primero (sin solapes parciales)', () => {
    const { redacted } = redactPii('Ana y Ana María salieron', {
      names: ['Ana', 'Ana María'],
    });
    // "Ana María" se tokeniza completo antes de que "Ana" toque su prefijo.
    expect(redacted).toContain('[[PERSONA_'); // ambos quedan tokenizados
    expect(redacted).not.toContain('María');
  });

  it('tokeniza direcciones conocidas', () => {
    const { redacted, map } = redactPii('Vive en Calle Mayor 1', {
      addresses: ['Calle Mayor 1'],
    });
    expect(redacted).toBe('Vive en [[DIRECCION_1]]');
    expect(map[0]?.category).toBe('DIRECCION');
  });
});

describe('redactPii — estabilidad y múltiples', () => {
  it('el mismo valor repetido recibe el mismo token', () => {
    const { redacted, map } = redactPii('Email a@b.com y de nuevo a@b.com', {});
    expect(redacted).toBe('Email [[EMAIL_1]] y de nuevo [[EMAIL_1]]');
    expect(map).toHaveLength(1);
  });

  it('valores distintos reciben tokens incrementales por categoría', () => {
    const { redacted } = redactPii('a@b.com y c@d.com');
    expect(redacted).toBe('[[EMAIL_1]] y [[EMAIL_2]]');
  });

  it('mezcla varias categorías a la vez', () => {
    const { map } = redactPii('Juan Pérez, DNI 12345678Z, tel 612345678, juan@x.com', {
      names: ['Juan Pérez'],
    });
    const cats = map.map((m) => m.category).sort();
    expect(cats).toEqual(['DNI', 'EMAIL', 'PERSONA', 'TELEFONO']);
  });
});

describe('redactPii — idempotencia', () => {
  it('redactar dos veces no cambia el resultado', () => {
    const input = 'Juan Pérez 12345678Z juan@x.com 612345678';
    const known = { names: ['Juan Pérez'] };
    const first = redactPii(input, known);
    const second = redactPii(first.redacted, known);
    expect(second.redacted).toBe(first.redacted);
    expect(second.map).toHaveLength(0); // ya no quedan PII que tokenizar
  });
});

describe('rehydrate', () => {
  it('restaura los valores originales', () => {
    const { redacted, map } = redactPii('Ana María, DNI 12345678Z', {
      names: ['Ana María'],
    });
    expect(rehydrate(redacted, map)).toBe('Ana María, DNI 12345678Z');
  });

  it('round-trip redact→rehydrate es identidad', () => {
    const input = 'Contacta a Juan Pérez (juan@x.com, 612345678, DNI 12345678Z)';
    const known = { names: ['Juan Pérez'] };
    const { redacted, map } = redactPii(input, known);
    expect(redacted).not.toContain('Juan Pérez');
    expect(rehydrate(redacted, map)).toBe(input);
  });

  it('rehidrata tokens repetidos en la salida del modelo', () => {
    const map = [{ token: '[[PERSONA_1]]', value: 'Ana', category: 'PERSONA' as const }];
    expect(rehydrate('[[PERSONA_1]] y [[PERSONA_1]]', map)).toBe('Ana y Ana');
  });

  it('sin mapa, devuelve el texto tal cual', () => {
    expect(rehydrate('texto sin tokens', [])).toBe('texto sin tokens');
  });
});
