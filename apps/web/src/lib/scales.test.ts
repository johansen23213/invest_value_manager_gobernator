import { describe, expect, it } from 'vitest';
import {
  interpretBarthel,
  interpretBraden,
  interpretDownton,
  interpretGdsReisberg,
  interpretLawtonBrody,
  interpretMecLobo,
  interpretMna,
  interpretNorton,
  interpretPainad,
  interpretPfeiffer,
  interpretTinetti,
  interpretScale,
  isBradenRisk,
  isNortonHighRisk,
  isValidScore,
  calculateBmi,
} from './scales';

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

  // Fase 1 — nuevas escalas
  it('valida rango de Pfeiffer (0–10)', () => {
    expect(isValidScore('PFEIFFER', 0)).toBe(true);
    expect(isValidScore('PFEIFFER', 10)).toBe(true);
    expect(isValidScore('PFEIFFER', 11)).toBe(false);
  });

  it('valida rango de MEC_LOBO (0–35)', () => {
    expect(isValidScore('MEC_LOBO', 0)).toBe(true);
    expect(isValidScore('MEC_LOBO', 35)).toBe(true);
    expect(isValidScore('MEC_LOBO', 36)).toBe(false);
  });

  it('valida rango de GDS_REISBERG (1–7)', () => {
    expect(isValidScore('GDS_REISBERG', 1)).toBe(true);
    expect(isValidScore('GDS_REISBERG', 7)).toBe(true);
    expect(isValidScore('GDS_REISBERG', 0)).toBe(false);
    expect(isValidScore('GDS_REISBERG', 8)).toBe(false);
  });

  it('valida rango de Norton (5–20)', () => {
    expect(isValidScore('NORTON', 5)).toBe(true);
    expect(isValidScore('NORTON', 20)).toBe(true);
    expect(isValidScore('NORTON', 4)).toBe(false);
    expect(isValidScore('NORTON', 21)).toBe(false);
  });

  it('valida rango de Braden (6–23)', () => {
    expect(isValidScore('BRADEN', 6)).toBe(true);
    expect(isValidScore('BRADEN', 23)).toBe(true);
    expect(isValidScore('BRADEN', 5)).toBe(false);
  });

  it('valida rango de MNA (0–30)', () => {
    expect(isValidScore('MNA', 0)).toBe(true);
    expect(isValidScore('MNA', 30)).toBe(true);
    expect(isValidScore('MNA', 31)).toBe(false);
  });

  it('valida rango de PAINAD (0–10)', () => {
    expect(isValidScore('PAINAD', 0)).toBe(true);
    expect(isValidScore('PAINAD', 10)).toBe(true);
    expect(isValidScore('PAINAD', 11)).toBe(false);
  });

  it('valida rango de DOWNTON (0–12)', () => {
    expect(isValidScore('DOWNTON', 0)).toBe(true);
    expect(isValidScore('DOWNTON', 12)).toBe(true);
    expect(isValidScore('DOWNTON', 13)).toBe(false);
  });

  it('valida rango de LAWTON_BRODY (0–8)', () => {
    expect(isValidScore('LAWTON_BRODY', 0)).toBe(true);
    expect(isValidScore('LAWTON_BRODY', 8)).toBe(true);
    expect(isValidScore('LAWTON_BRODY', 9)).toBe(false);
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

describe('interpretPfeiffer', () => {
  it('clasifica el deterioro cognitivo', () => {
    expect(interpretPfeiffer(0)).toBe('Sin deterioro cognitivo');
    expect(interpretPfeiffer(2)).toBe('Sin deterioro cognitivo');
    expect(interpretPfeiffer(3)).toBe('Deterioro leve');
    expect(interpretPfeiffer(5)).toBe('Deterioro moderado');
    expect(interpretPfeiffer(8)).toBe('Deterioro grave');
  });
});

describe('interpretMecLobo', () => {
  it('clasifica el deterioro cognitivo', () => {
    expect(interpretMecLobo(35)).toBe('Sin deterioro cognitivo');
    expect(interpretMecLobo(24)).toBe('Sin deterioro cognitivo');
    expect(interpretMecLobo(23)).toBe('Deterioro leve-moderado');
    expect(interpretMecLobo(15)).toBe('Deterioro grave');
  });
});

describe('interpretGdsReisberg', () => {
  it('mapea estadios correctamente', () => {
    expect(interpretGdsReisberg(1)).toBe('Sin deterioro (normal)');
    expect(interpretGdsReisberg(4)).toBe('Deterioro moderado (demencia leve)');
    expect(interpretGdsReisberg(7)).toBe('Deterioro muy grave (demencia grave)');
  });
});

describe('Norton — protocolo UPP', () => {
  it('interpreta el riesgo de UPP', () => {
    expect(interpretNorton(14)).toBe('Riesgo alto de UPP');
    expect(interpretNorton(15)).toBe('Riesgo medio de UPP');
    expect(interpretNorton(18)).toBe('Riesgo bajo de UPP');
  });

  it('isNortonHighRisk: ≤14 es riesgo alto (umbral clínico de protocolo)', () => {
    expect(isNortonHighRisk(14)).toBe(true);
    expect(isNortonHighRisk(13)).toBe(true);
    expect(isNortonHighRisk(5)).toBe(true);
    expect(isNortonHighRisk(15)).toBe(false);
    expect(isNortonHighRisk(20)).toBe(false);
  });
});

describe('Braden — protocolo UPP', () => {
  it('interpreta el riesgo de UPP', () => {
    expect(interpretBraden(9)).toBe('Riesgo muy alto de UPP');
    expect(interpretBraden(12)).toBe('Riesgo alto de UPP');
    expect(interpretBraden(14)).toBe('Riesgo moderado de UPP');
    expect(interpretBraden(18)).toBe('Riesgo leve de UPP');
    expect(interpretBraden(23)).toBe('Sin riesgo significativo de UPP');
  });

  it('isBradenRisk: ≤18 es riesgo', () => {
    expect(isBradenRisk(18)).toBe(true);
    expect(isBradenRisk(6)).toBe(true);
    expect(isBradenRisk(19)).toBe(false);
  });
});

describe('interpretMna', () => {
  it('clasifica el estado nutricional', () => {
    expect(interpretMna(30)).toBe('Estado nutricional normal');
    expect(interpretMna(24)).toBe('Estado nutricional normal');
    expect(interpretMna(20)).toBe('Riesgo de desnutrición');
    expect(interpretMna(16)).toBe('Desnutrición');
  });
});

describe('interpretPainad', () => {
  it('clasifica el dolor', () => {
    expect(interpretPainad(0)).toBe('Dolor leve o ausente');
    expect(interpretPainad(3)).toBe('Dolor leve o ausente');
    expect(interpretPainad(5)).toBe('Dolor moderado');
    expect(interpretPainad(8)).toBe('Dolor intenso');
  });
});

describe('interpretDownton', () => {
  it('umbral ≥3 es riesgo alto', () => {
    expect(interpretDownton(3)).toBe('Riesgo alto de caídas');
    expect(interpretDownton(0)).toBe('Riesgo bajo de caídas');
    expect(interpretDownton(2)).toBe('Riesgo bajo de caídas');
  });
});

describe('interpretLawtonBrody', () => {
  it('clasifica la independencia en AIVD', () => {
    expect(interpretLawtonBrody(8)).toBe('Independencia alta en AIVD');
    expect(interpretLawtonBrody(4)).toBe('Independencia parcial en AIVD');
    expect(interpretLawtonBrody(1)).toBe('Dependencia en AIVD');
  });
});

describe('interpretScale (dispatch)', () => {
  it('delega correctamente a cada interpretador', () => {
    expect(interpretScale('BARTHEL', 100)).toBe('Independiente');
    expect(interpretScale('NORTON', 12)).toBe('Riesgo alto de UPP');
    expect(interpretScale('DOWNTON', 5)).toBe('Riesgo alto de caídas');
  });
});

describe('calculateBmi', () => {
  it('calcula BMI con redondeo a 1 decimal', () => {
    expect(calculateBmi(70, 175)).toBe(22.9);
    expect(calculateBmi(90, 180)).toBe(27.8);
  });

  it('BMI bajo peso', () => {
    expect(calculateBmi(45, 170)).toBe(15.6);
  });
});
