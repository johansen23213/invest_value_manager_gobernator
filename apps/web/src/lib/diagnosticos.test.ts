import { describe, expect, it } from 'vitest';
import {
  validateDiagnosisTransition,
  canTransitionDiagnosis,
  availableTransitions,
  activeDiagnoses,
  resolvedDiagnoses,
  activeAssistiveDevices,
  summarizeDiagnoses,
  type DiagnosisStatus,
} from './diagnosticos';

// ---------------------------------------------------------------------------
// validateDiagnosisTransition
// ---------------------------------------------------------------------------

describe('validateDiagnosisTransition — transiciones válidas', () => {
  it('ACTIVO → CRONICO es válido sin fecha de resolución', () => {
    const result = validateDiagnosisTransition('ACTIVO', 'CRONICO');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.next).toBe('CRONICO');
  });

  it('ACTIVO → RESUELTO con resolvedAt es válido', () => {
    const result = validateDiagnosisTransition('ACTIVO', 'RESUELTO', new Date());
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.next).toBe('RESUELTO');
  });

  it('CRONICO → RESUELTO con resolvedAt es válido', () => {
    const result = validateDiagnosisTransition('CRONICO', 'RESUELTO', new Date());
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.next).toBe('RESUELTO');
  });
});

describe('validateDiagnosisTransition — transiciones inválidas', () => {
  it('RESUELTO → ACTIVO no está permitido (estado terminal)', () => {
    const result = validateDiagnosisTransition('RESUELTO', 'ACTIVO');
    expect(result.ok).toBe(false);
  });

  it('RESUELTO → CRONICO no está permitido (estado terminal)', () => {
    const result = validateDiagnosisTransition('RESUELTO', 'CRONICO');
    expect(result.ok).toBe(false);
  });

  it('RESUELTO → RESUELTO no está permitido (sin sentido)', () => {
    const result = validateDiagnosisTransition('RESUELTO', 'RESUELTO', new Date());
    expect(result.ok).toBe(false);
  });

  it('CRONICO → ACTIVO no está permitido', () => {
    const result = validateDiagnosisTransition('CRONICO', 'ACTIVO');
    expect(result.ok).toBe(false);
  });

  it('ACTIVO → ACTIVO no está permitido (transición al mismo estado)', () => {
    const result = validateDiagnosisTransition('ACTIVO', 'ACTIVO');
    expect(result.ok).toBe(false);
  });

  it('ACTIVO → RESUELTO sin resolvedAt falla', () => {
    const result = validateDiagnosisTransition('ACTIVO', 'RESUELTO');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('fecha de resolución');
    }
  });

  it('ACTIVO → RESUELTO con resolvedAt = null falla', () => {
    const result = validateDiagnosisTransition('ACTIVO', 'RESUELTO', null);
    expect(result.ok).toBe(false);
  });

  it('CRONICO → RESUELTO sin resolvedAt falla', () => {
    const result = validateDiagnosisTransition('CRONICO', 'RESUELTO');
    expect(result.ok).toBe(false);
  });

  it('ACTIVO → CRONICO con resolvedAt falla (no aplica fecha para no-RESUELTO)', () => {
    const result = validateDiagnosisTransition('ACTIVO', 'CRONICO', new Date());
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('fecha de resolución solo aplica');
    }
  });

  it('error incluye los estados permitidos desde el origen', () => {
    const result = validateDiagnosisTransition('RESUELTO', 'ACTIVO');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('RESUELTO → ACTIVO');
    }
  });
});

// ---------------------------------------------------------------------------
// canTransitionDiagnosis (guard rápido)
// ---------------------------------------------------------------------------

describe('canTransitionDiagnosis', () => {
  it('ACTIVO → CRONICO: true', () => {
    expect(canTransitionDiagnosis('ACTIVO', 'CRONICO')).toBe(true);
  });

  it('ACTIVO → RESUELTO: true', () => {
    expect(canTransitionDiagnosis('ACTIVO', 'RESUELTO')).toBe(true);
  });

  it('CRONICO → RESUELTO: true', () => {
    expect(canTransitionDiagnosis('CRONICO', 'RESUELTO')).toBe(true);
  });

  it('RESUELTO → ACTIVO: false', () => {
    expect(canTransitionDiagnosis('RESUELTO', 'ACTIVO')).toBe(false);
  });

  it('ACTIVO → ACTIVO: false', () => {
    expect(canTransitionDiagnosis('ACTIVO', 'ACTIVO')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// availableTransitions
// ---------------------------------------------------------------------------

describe('availableTransitions', () => {
  it('desde ACTIVO: [CRONICO, RESUELTO]', () => {
    const t = availableTransitions('ACTIVO');
    expect(t).toContain('CRONICO');
    expect(t).toContain('RESUELTO');
    expect(t).toHaveLength(2);
  });

  it('desde CRONICO: [RESUELTO]', () => {
    const t = availableTransitions('CRONICO');
    expect(t).toEqual(['RESUELTO']);
  });

  it('desde RESUELTO: [] (estado terminal)', () => {
    const t = availableTransitions('RESUELTO');
    expect(t).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// activeDiagnoses / resolvedDiagnoses
// ---------------------------------------------------------------------------

const sampleDiagnoses = [
  { status: 'ACTIVO'    as DiagnosisStatus, resolvedAt: null },
  { status: 'CRONICO'   as DiagnosisStatus, resolvedAt: null },
  { status: 'RESUELTO'  as DiagnosisStatus, resolvedAt: new Date('2025-01-15') },
  { status: 'ACTIVO'    as DiagnosisStatus, resolvedAt: null },
];

describe('activeDiagnoses', () => {
  it('devuelve ACTIVO y CRONICO, no RESUELTO', () => {
    const activos = activeDiagnoses(sampleDiagnoses);
    expect(activos).toHaveLength(3);
    expect(activos.some((d) => d.status === 'RESUELTO')).toBe(false);
  });

  it('devuelve lista vacía si no hay activos', () => {
    const todo = [{ status: 'RESUELTO' as DiagnosisStatus, resolvedAt: new Date() }];
    expect(activeDiagnoses(todo)).toHaveLength(0);
  });
});

describe('resolvedDiagnoses', () => {
  it('devuelve solo RESUELTO', () => {
    const resueltos = resolvedDiagnoses(sampleDiagnoses);
    expect(resueltos).toHaveLength(1);
    expect(resueltos[0]?.status).toBe('RESUELTO');
  });

  it('devuelve lista vacía si no hay resueltos', () => {
    const todo = [
      { status: 'ACTIVO'  as DiagnosisStatus, resolvedAt: null },
      { status: 'CRONICO' as DiagnosisStatus, resolvedAt: null },
    ];
    expect(resolvedDiagnoses(todo)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// activeAssistiveDevices
// ---------------------------------------------------------------------------

describe('activeAssistiveDevices', () => {
  it('filtra solo los ACTIVO', () => {
    const devices = [
      { status: 'ACTIVO'   as const, retiredAt: null },
      { status: 'RETIRADO' as const, retiredAt: new Date() },
      { status: 'ACTIVO'   as const, retiredAt: null },
    ];
    const activos = activeAssistiveDevices(devices);
    expect(activos).toHaveLength(2);
    expect(activos.every((d) => d.status === 'ACTIVO')).toBe(true);
  });

  it('devuelve lista vacía si todos retirados', () => {
    const devices = [
      { status: 'RETIRADO' as const, retiredAt: new Date() },
    ];
    expect(activeAssistiveDevices(devices)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// summarizeDiagnoses
// ---------------------------------------------------------------------------

describe('summarizeDiagnoses', () => {
  it('cuenta correctamente por estado', () => {
    const summary = summarizeDiagnoses(sampleDiagnoses);
    expect(summary.total).toBe(4);
    expect(summary.activo).toBe(2);
    expect(summary.cronico).toBe(1);
    expect(summary.resuelto).toBe(1);
  });

  it('lista vacía produce ceros', () => {
    const summary = summarizeDiagnoses([]);
    expect(summary.total).toBe(0);
    expect(summary.activo).toBe(0);
    expect(summary.cronico).toBe(0);
    expect(summary.resuelto).toBe(0);
  });
});
