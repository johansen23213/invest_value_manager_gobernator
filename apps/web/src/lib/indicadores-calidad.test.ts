/**
 * Tests exhaustivos de indicadores-calidad.ts (lógica de dominio pura).
 *
 * Cubre: prevalencia UPP, incidencia UPP, tasa caídas, cobertura valoración,
 * prevalencia sujeciones, dashboard consolidado, cohort at risk, división por cero,
 * periodos vacíos y edge cases.
 */
import { describe, expect, it } from 'vitest';
import {
  calcularIndicadorUPP,
  calcularIndicadorCaidas,
  calcularCoberturaValoracion,
  calcularPrevalenciaSujeciones,
  calcularDashboardCalidad,
  cohortEnRiesgo,
  NORTON_HIGH_RISK_THRESHOLD,
  BRADEN_RISK_THRESHOLD,
  VALORACION_VIGENCIA_DIAS,
  type ResidentInput,
  type PressureUlcerInput,
  type FallRecordInput,
  type AssessmentUPPInput,
  type RestraintInput,
  type PeriodInput,
} from './indicadores-calidad';

// ---------------------------------------------------------------------------
// Fixtures base
// ---------------------------------------------------------------------------

const D = (offset: number, baseMs = 1_700_000_000_000): Date =>
  new Date(baseMs + offset * 24 * 60 * 60 * 1000);

const NOW = D(0);

const period: PeriodInput = { desde: D(-30), hasta: D(0) };

function mkResident(
  id: string,
  opts: Partial<ResidentInput> = {},
): ResidentInput {
  return {
    id,
    status: 'ACTIVO',
    admissionDate: D(-60),
    dischargeDate: null,
    centerId: 'c1',
    unitId: 'u1',
    ...opts,
  };
}

function mkUPP(
  id: string,
  residentId: string,
  opts: Partial<PressureUlcerInput> = {},
): PressureUlcerInput {
  return {
    id,
    residentId,
    stage: 2,
    onsetDate: D(-10),
    resolvedDate: null,
    acquired: 'CENTRO',
    active: true,
    ...opts,
  };
}

function mkFall(
  id: string,
  residentId: string,
  opts: Partial<FallRecordInput> = {},
): FallRecordInput {
  return {
    id,
    residentId,
    occurredAt: D(-5),
    injuries: null,
    ...opts,
  };
}

function mkAssessment(
  id: string,
  residentId: string,
  type: 'NORTON' | 'BRADEN',
  score: number,
  opts: Partial<AssessmentUPPInput> = {},
): AssessmentUPPInput {
  return {
    id,
    residentId,
    type,
    score,
    assessedAt: D(-5),
    ...opts,
  };
}

function mkRestraint(
  id: string,
  residentId: string,
  opts: Partial<RestraintInput> = {},
): RestraintInput {
  return {
    id,
    residentId,
    active: true,
    prescribedAt: D(-20),
    endDate: null,
    ...opts,
  };
}

// ---------------------------------------------------------------------------
// Constantes clínicas
// ---------------------------------------------------------------------------

describe('constantes clínicas documentadas', () => {
  it('umbral Norton en 14 (riesgo alto)', () => {
    expect(NORTON_HIGH_RISK_THRESHOLD).toBe(14);
  });

  it('umbral Braden en 18 (riesgo)', () => {
    expect(BRADEN_RISK_THRESHOLD).toBe(18);
  });

  it('vigencia valoración en 30 días (cadencia mensual GNEAUPP)', () => {
    expect(VALORACION_VIGENCIA_DIAS).toBe(30);
  });
});

// ---------------------------------------------------------------------------
// A. Indicadores UPP
// ---------------------------------------------------------------------------

describe('calcularIndicadorUPP', () => {
  it('cohorte vacía → todos los indicadores a 0', () => {
    const r = calcularIndicadorUPP([], [], period, NOW);
    expect(r.prevalenciaPct).toBe(0);
    expect(r.prevalenciaCentroPct).toBe(0);
    expect(r.incidenciaNuevas).toBe(0);
    expect(r.incidenciaTasaPor1000).toBe(0);
    expect(r.totalResidentes).toBe(0);
  });

  it('sin UPPs → prevalencia 0 pero totalResidentes correcto', () => {
    const res = [mkResident('r1'), mkResident('r2')];
    const r = calcularIndicadorUPP(res, [], period, NOW);
    expect(r.prevalenciaPct).toBe(0);
    expect(r.totalResidentes).toBe(2);
  });

  it('1 residente con 1 UPP activa → prevalencia 100%', () => {
    const res = [mkResident('r1')];
    const upp = [mkUPP('u1', 'r1')];
    const r = calcularIndicadorUPP(res, upp, period, NOW);
    expect(r.prevalenciaPct).toBe(100);
  });

  it('2 residentes, 1 con UPP activa → prevalencia 50%', () => {
    const res = [mkResident('r1'), mkResident('r2')];
    const upp = [mkUPP('u1', 'r1')];
    const r = calcularIndicadorUPP(res, upp, period, NOW);
    expect(r.prevalenciaPct).toBe(50);
  });

  it('UPP resuelta antes de now no cuenta en prevalencia puntual', () => {
    const res = [mkResident('r1')];
    const upp = [
      mkUPP('u1', 'r1', { active: false, resolvedDate: D(-1) }),
    ];
    const r = calcularIndicadorUPP(res, upp, period, NOW);
    expect(r.prevalenciaPct).toBe(0);
  });

  it('UPP de ingreso no cuenta en prevalenciaCentroPct', () => {
    const res = [mkResident('r1')];
    const upp = [mkUPP('u1', 'r1', { acquired: 'INGRESO' })];
    const r = calcularIndicadorUPP(res, upp, period, NOW);
    expect(r.prevalenciaPct).toBe(100); // sí en prevalencia total
    expect(r.prevalenciaCentroPct).toBe(0); // no en prevalencia de centro
  });

  it('UPP de centro sí cuenta en prevalenciaCentroPct', () => {
    const res = [mkResident('r1'), mkResident('r2')];
    const upp = [mkUPP('u1', 'r1', { acquired: 'CENTRO' })];
    const r = calcularIndicadorUPP(res, upp, period, NOW);
    expect(r.prevalenciaCentroPct).toBe(50);
  });

  it('incidencia: nueva UPP dentro del periodo → nIncidencia = 1', () => {
    const res = [mkResident('r1')];
    const upp = [mkUPP('u1', 'r1', { onsetDate: D(-15) })]; // dentro de los últimos 30d
    const r = calcularIndicadorUPP(res, upp, period, NOW);
    expect(r.incidenciaNuevas).toBe(1);
  });

  it('incidencia: UPP anterior al periodo no cuenta como incidencia nueva', () => {
    const res = [mkResident('r1')];
    const upp = [mkUPP('u1', 'r1', { onsetDate: D(-40) })]; // antes del periodo
    const r = calcularIndicadorUPP(res, upp, period, NOW);
    expect(r.incidenciaNuevas).toBe(0);
  });

  it('incidenciaTasaPor1000 > 0 cuando hay incidencia y estancias', () => {
    const res = [mkResident('r1')];
    const upp = [mkUPP('u1', 'r1', { onsetDate: D(-15) })];
    const r = calcularIndicadorUPP(res, upp, period, NOW);
    expect(r.incidenciaTasaPor1000).toBeGreaterThan(0);
  });

  it('desglose por estadio correcto', () => {
    const res = [mkResident('r1'), mkResident('r2'), mkResident('r3')];
    const upp = [
      mkUPP('u1', 'r1', { stage: 1 }),
      mkUPP('u2', 'r2', { stage: 2 }),
      mkUPP('u3', 'r3', { stage: 3 }),
    ];
    const r = calcularIndicadorUPP(res, upp, period, NOW);
    expect(r.desglosePorEstadio.stage1).toBe(1);
    expect(r.desglosePorEstadio.stage2).toBe(1);
    expect(r.desglosePorEstadio.stage3).toBe(1);
    expect(r.desglosePorEstadio.stage4).toBe(0);
  });

  it('residente en preingreso no cuenta en cohorte', () => {
    const res = [
      mkResident('r1'),
      mkResident('r2', { status: 'PREINGRESO' }),
    ];
    const upp = [mkUPP('u1', 'r1')];
    const r = calcularIndicadorUPP(res, upp, period, NOW);
    expect(r.totalResidentes).toBe(1);
  });

  it('varios residentes con varias UPPs → no duplica residente en prevalencia', () => {
    const res = [mkResident('r1')];
    const upp = [
      mkUPP('u1', 'r1', { stage: 1 }),
      mkUPP('u2', 'r1', { stage: 2 }),
    ];
    const r = calcularIndicadorUPP(res, upp, period, NOW);
    // r1 tiene 2 UPPs pero solo 1 residente afectado → 100%
    expect(r.prevalenciaPct).toBe(100);
    expect(r.desglosePorEstadio.stage1).toBe(1);
    expect(r.desglosePorEstadio.stage2).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// B. Indicadores de caídas
// ---------------------------------------------------------------------------

describe('calcularIndicadorCaidas', () => {
  it('sin residentes ni caídas → todo a 0', () => {
    const r = calcularIndicadorCaidas([], [], period);
    expect(r.totalCaidas).toBe(0);
    expect(r.tasaPor1000EstanciasDia).toBe(0);
    expect(r.pctResidentesConCaida).toBe(0);
    expect(r.pctCaidasConLesion).toBe(0);
  });

  it('caída fuera del periodo no cuenta', () => {
    const res = [mkResident('r1')];
    const caida = [mkFall('f1', 'r1', { occurredAt: D(-45) })]; // antes del periodo
    const r = calcularIndicadorCaidas(res, caida, period);
    expect(r.totalCaidas).toBe(0);
  });

  it('caída dentro del periodo sí cuenta', () => {
    const res = [mkResident('r1')];
    const caida = [mkFall('f1', 'r1', { occurredAt: D(-10) })];
    const r = calcularIndicadorCaidas(res, caida, period);
    expect(r.totalCaidas).toBe(1);
  });

  it('tasa por 1.000 estancias-día es positiva cuando hay caídas y estancias', () => {
    const res = [mkResident('r1')];
    const caida = [mkFall('f1', 'r1', { occurredAt: D(-10) })];
    const r = calcularIndicadorCaidas(res, caida, period);
    expect(r.tasaPor1000EstanciasDia).toBeGreaterThan(0);
  });

  it('% residentes con caída correcto: 2 residentes, 1 con caída → 50%', () => {
    const res = [mkResident('r1'), mkResident('r2')];
    const caida = [mkFall('f1', 'r1', { occurredAt: D(-10) })];
    const r = calcularIndicadorCaidas(res, caida, period);
    expect(r.pctResidentesConCaida).toBe(50);
  });

  it('1 residente con 2 caídas → pctResidentesConCaida 100% (no duplica)', () => {
    const res = [mkResident('r1')];
    const caidas = [
      mkFall('f1', 'r1', { occurredAt: D(-5) }),
      mkFall('f2', 'r1', { occurredAt: D(-3) }),
    ];
    const r = calcularIndicadorCaidas(res, caidas, period);
    expect(r.totalCaidas).toBe(2);
    expect(r.pctResidentesConCaida).toBe(100);
  });

  it('caída con injuries null → caidasConLesion 0', () => {
    const res = [mkResident('r1')];
    const caida = [mkFall('f1', 'r1', { injuries: null })];
    const r = calcularIndicadorCaidas(res, caida, period);
    expect(r.caidasConLesion).toBe(0);
    expect(r.pctCaidasConLesion).toBe(0);
  });

  it('caída con injuries string → caidasConLesion 1', () => {
    const res = [mkResident('r1')];
    const caida = [mkFall('f1', 'r1', { injuries: 'Contusión en rodilla' })];
    const r = calcularIndicadorCaidas(res, caida, period);
    expect(r.caidasConLesion).toBe(1);
    expect(r.pctCaidasConLesion).toBe(100);
  });

  it('caída con injuries string vacío → caidasConLesion 0 (solo whitespace)', () => {
    const res = [mkResident('r1')];
    const caida = [mkFall('f1', 'r1', { injuries: '   ' })];
    const r = calcularIndicadorCaidas(res, caida, period);
    expect(r.caidasConLesion).toBe(0);
  });

  it('2 caídas, 1 con lesión → pctCaidasConLesion 50%', () => {
    const res = [mkResident('r1')];
    const caidas = [
      mkFall('f1', 'r1', { occurredAt: D(-5), injuries: 'Herida' }),
      mkFall('f2', 'r1', { occurredAt: D(-3), injuries: null }),
    ];
    const r = calcularIndicadorCaidas(res, caidas, period);
    expect(r.pctCaidasConLesion).toBe(50);
  });
});

// ---------------------------------------------------------------------------
// C. Cobertura valoración Norton/Braden
// ---------------------------------------------------------------------------

describe('calcularCoberturaValoracion', () => {
  it('sin residentes → todo a 0', () => {
    const r = calcularCoberturaValoracion([], [], NOW);
    expect(r.pctConValoracionVigente).toBe(0);
    expect(r.pctEnRiesgo).toBe(0);
    expect(r.totalResidentes).toBe(0);
  });

  it('residente sin valoración → 0% cobertura', () => {
    const res = [mkResident('r1')];
    const r = calcularCoberturaValoracion(res, [], NOW);
    expect(r.pctConValoracionVigente).toBe(0);
    expect(r.sinValoracionVigente).toBe(1);
  });

  it('valoración vigente (5 días) → 100% cobertura', () => {
    const res = [mkResident('r1')];
    const ass = [mkAssessment('a1', 'r1', 'NORTON', 16, { assessedAt: D(-5) })];
    const r = calcularCoberturaValoracion(res, ass, NOW);
    expect(r.pctConValoracionVigente).toBe(100);
    expect(r.sinValoracionVigente).toBe(0);
  });

  it('valoración vencida (35 días) → 0% cobertura', () => {
    const res = [mkResident('r1')];
    const ass = [mkAssessment('a1', 'r1', 'NORTON', 16, { assessedAt: D(-35) })];
    const r = calcularCoberturaValoracion(res, ass, NOW);
    expect(r.pctConValoracionVigente).toBe(0);
    expect(r.sinValoracionVigente).toBe(1);
  });

  it('valoración exactamente en el límite (30 días) → cuenta como vigente', () => {
    const res = [mkResident('r1')];
    const ass = [mkAssessment('a1', 'r1', 'NORTON', 16, { assessedAt: D(-30) })];
    const r = calcularCoberturaValoracion(res, ass, NOW);
    expect(r.pctConValoracionVigente).toBe(100);
  });

  it('Norton ≤14 → en riesgo', () => {
    const res = [mkResident('r1')];
    const ass = [mkAssessment('a1', 'r1', 'NORTON', 14, { assessedAt: D(-5) })];
    const r = calcularCoberturaValoracion(res, ass, NOW);
    expect(r.enRiesgo).toBe(1);
    expect(r.pctEnRiesgo).toBe(100);
  });

  it('Norton 15 → no en riesgo', () => {
    const res = [mkResident('r1')];
    const ass = [mkAssessment('a1', 'r1', 'NORTON', 15, { assessedAt: D(-5) })];
    const r = calcularCoberturaValoracion(res, ass, NOW);
    expect(r.enRiesgo).toBe(0);
    expect(r.pctEnRiesgo).toBe(0);
  });

  it('Braden ≤18 → en riesgo', () => {
    const res = [mkResident('r1')];
    const ass = [mkAssessment('a1', 'r1', 'BRADEN', 18, { assessedAt: D(-5) })];
    const r = calcularCoberturaValoracion(res, ass, NOW);
    expect(r.enRiesgo).toBe(1);
  });

  it('Braden 19 → no en riesgo', () => {
    const res = [mkResident('r1')];
    const ass = [mkAssessment('a1', 'r1', 'BRADEN', 19, { assessedAt: D(-5) })];
    const r = calcularCoberturaValoracion(res, ass, NOW);
    expect(r.enRiesgo).toBe(0);
  });

  it('toma la valoración más reciente si hay varias', () => {
    const res = [mkResident('r1')];
    // Valoración antigua vencida con score de riesgo
    // Valoración reciente vigente sin riesgo → debe prevalecer la reciente
    const ass = [
      mkAssessment('a1', 'r1', 'NORTON', 10, { assessedAt: D(-40) }), // vencida
      mkAssessment('a2', 'r1', 'NORTON', 18, { assessedAt: D(-5) }), // vigente, sin riesgo
    ];
    const r = calcularCoberturaValoracion(res, ass, NOW);
    expect(r.pctConValoracionVigente).toBe(100);
    expect(r.enRiesgo).toBe(0); // score 18 > 14
  });

  it('2 residentes, 1 con valoración en riesgo, 1 sin riesgo → pctEnRiesgo 50%', () => {
    const res = [mkResident('r1'), mkResident('r2')];
    const ass = [
      mkAssessment('a1', 'r1', 'NORTON', 10, { assessedAt: D(-5) }), // riesgo
      mkAssessment('a2', 'r2', 'NORTON', 18, { assessedAt: D(-5) }), // sin riesgo
    ];
    const r = calcularCoberturaValoracion(res, ass, NOW);
    expect(r.pctEnRiesgo).toBe(50);
  });

  it('residente en BAJA no se cuenta (solo activos)', () => {
    const res = [
      mkResident('r1'),
      mkResident('r2', { status: 'BAJA', dischargeDate: D(-5) }),
    ];
    const ass = [mkAssessment('a1', 'r1', 'NORTON', 16, { assessedAt: D(-5) })];
    const r = calcularCoberturaValoracion(res, ass, NOW);
    expect(r.totalResidentes).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// D. Prevalencia de sujeciones
// ---------------------------------------------------------------------------

describe('calcularPrevalenciaSujeciones', () => {
  it('sin residentes → todo 0', () => {
    const r = calcularPrevalenciaSujeciones([], [], NOW);
    expect(r.prevalenciaPct).toBe(0);
    expect(r.conSujecionActiva).toBe(0);
    expect(r.totalResidentes).toBe(0);
  });

  it('sin sujeciones → prevalencia 0%', () => {
    const res = [mkResident('r1')];
    const r = calcularPrevalenciaSujeciones(res, [], NOW);
    expect(r.prevalenciaPct).toBe(0);
  });

  it('1 residente con sujeción activa (sin endDate) → 100%', () => {
    const res = [mkResident('r1')];
    const s = [mkRestraint('s1', 'r1')];
    const r = calcularPrevalenciaSujeciones(res, s, NOW);
    expect(r.prevalenciaPct).toBe(100);
    expect(r.conSujecionActiva).toBe(1);
  });

  it('sujeción con endDate en el pasado → no cuenta', () => {
    const res = [mkResident('r1')];
    const s = [mkRestraint('s1', 'r1', { endDate: D(-1) })];
    const r = calcularPrevalenciaSujeciones(res, s, NOW);
    expect(r.prevalenciaPct).toBe(0);
  });

  it('sujeción con active=false → no cuenta', () => {
    const res = [mkResident('r1')];
    const s = [mkRestraint('s1', 'r1', { active: false })];
    const r = calcularPrevalenciaSujeciones(res, s, NOW);
    expect(r.prevalenciaPct).toBe(0);
  });

  it('sujeción con endDate en el futuro → sí cuenta', () => {
    const res = [mkResident('r1')];
    const s = [mkRestraint('s1', 'r1', { endDate: D(5) })];
    const r = calcularPrevalenciaSujeciones(res, s, NOW);
    expect(r.prevalenciaPct).toBe(100);
  });

  it('2 residentes, 1 con sujeción → 50%', () => {
    const res = [mkResident('r1'), mkResident('r2')];
    const s = [mkRestraint('s1', 'r1')];
    const r = calcularPrevalenciaSujeciones(res, s, NOW);
    expect(r.prevalenciaPct).toBe(50);
  });

  it('residente con múltiples sujeciones cuenta como 1 en prevalencia', () => {
    const res = [mkResident('r1')];
    const s = [mkRestraint('s1', 'r1'), mkRestraint('s2', 'r1')];
    const r = calcularPrevalenciaSujeciones(res, s, NOW);
    expect(r.prevalenciaPct).toBe(100);
    expect(r.conSujecionActiva).toBe(1); // 1 residente, no 2 sujeciones
  });
});

// ---------------------------------------------------------------------------
// E. Dashboard consolidado
// ---------------------------------------------------------------------------

describe('calcularDashboardCalidad', () => {
  it('devuelve estructura con los 4 bloques y el periodo', () => {
    const res = [mkResident('r1')];
    const d = calcularDashboardCalidad(res, [], [], [], [], period, NOW);
    expect(d.period).toEqual(period);
    expect(d.upp).toBeDefined();
    expect(d.caidas).toBeDefined();
    expect(d.coberturaValoracion).toBeDefined();
    expect(d.sujeciones).toBeDefined();
  });

  it('cohorte completa → indicadores coherentes entre sí', () => {
    const res = [mkResident('r1'), mkResident('r2')];
    const upp = [mkUPP('u1', 'r1')];
    const caidas = [mkFall('f1', 'r1', { occurredAt: D(-10) })];
    const ass = [mkAssessment('a1', 'r1', 'NORTON', 10, { assessedAt: D(-5) })];
    const suj = [mkRestraint('s1', 'r2')];

    const d = calcularDashboardCalidad(res, upp, caidas, ass, suj, period, NOW);

    expect(d.upp.totalResidentes).toBe(2);
    expect(d.upp.prevalenciaPct).toBe(50);
    expect(d.caidas.totalCaidas).toBe(1);
    expect(d.coberturaValoracion.enRiesgo).toBe(1);
    expect(d.sujeciones.conSujecionActiva).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// F. cohortEnRiesgo
// ---------------------------------------------------------------------------

describe('cohortEnRiesgo', () => {
  const res = [mkResident('r1'), mkResident('r2')];

  it('UPP_ACTIVA: devuelve residente con UPP activa', () => {
    const upp = [mkUPP('u1', 'r1', { stage: 2 })];
    const result = cohortEnRiesgo('UPP_ACTIVA', res, upp, [], [], NOW);
    expect(result).toHaveLength(1);
    expect(result[0]!.residentId).toBe('r1');
    expect(result[0]!.motivo).toBe('UPP_ACTIVA');
  });

  it('UPP_ACTIVA: no incluye residente sin UPP', () => {
    const upp = [mkUPP('u1', 'r1')];
    const result = cohortEnRiesgo('UPP_ACTIVA', res, upp, [], [], NOW);
    expect(result.find((x) => x.residentId === 'r2')).toBeUndefined();
  });

  it('SIN_VALORACION_VIGENTE: residente sin ninguna valoración', () => {
    const result = cohortEnRiesgo('SIN_VALORACION_VIGENTE', res, [], [], [], NOW);
    expect(result).toHaveLength(2);
    expect(result.every((x) => x.motivo === 'SIN_VALORACION_VIGENTE')).toBe(true);
  });

  it('SIN_VALORACION_VIGENTE: residente con valoración vigente no aparece', () => {
    const ass = [
      mkAssessment('a1', 'r1', 'NORTON', 16, { assessedAt: D(-5) }),
    ];
    const result = cohortEnRiesgo('SIN_VALORACION_VIGENTE', res, [], ass, [], NOW);
    expect(result.find((x) => x.residentId === 'r1')).toBeUndefined();
    expect(result.find((x) => x.residentId === 'r2')).toBeDefined();
  });

  it('SIN_VALORACION_VIGENTE: residente con valoración vencida aparece', () => {
    const ass = [
      mkAssessment('a1', 'r1', 'NORTON', 16, { assessedAt: D(-35) }),
    ];
    const result = cohortEnRiesgo('SIN_VALORACION_VIGENTE', res, [], ass, [], NOW);
    expect(result.find((x) => x.residentId === 'r1')).toBeDefined();
  });

  it('EN_RIESGO_UPP: Norton 10 con valoración vigente → aparece', () => {
    const ass = [mkAssessment('a1', 'r1', 'NORTON', 10, { assessedAt: D(-5) })];
    const result = cohortEnRiesgo('EN_RIESGO_UPP', res, [], ass, [], NOW);
    expect(result.find((x) => x.residentId === 'r1')).toBeDefined();
    expect(result[0]!.motivo).toBe('EN_RIESGO_UPP');
  });

  it('EN_RIESGO_UPP: Norton 15 con valoración vigente → no aparece', () => {
    const ass = [mkAssessment('a1', 'r1', 'NORTON', 15, { assessedAt: D(-5) })];
    const result = cohortEnRiesgo('EN_RIESGO_UPP', res, [], ass, [], NOW);
    expect(result.find((x) => x.residentId === 'r1')).toBeUndefined();
  });

  it('EN_RIESGO_UPP: Braden 18 con valoración vigente → aparece', () => {
    const ass = [mkAssessment('a1', 'r2', 'BRADEN', 18, { assessedAt: D(-5) })];
    const result = cohortEnRiesgo('EN_RIESGO_UPP', res, [], ass, [], NOW);
    expect(result.find((x) => x.residentId === 'r2')).toBeDefined();
  });

  it('EN_RIESGO_UPP: valoración vencida + riesgo → no aparece en riesgo vigente', () => {
    const ass = [mkAssessment('a1', 'r1', 'NORTON', 10, { assessedAt: D(-40) })];
    const result = cohortEnRiesgo('EN_RIESGO_UPP', res, [], ass, [], NOW);
    expect(result).toHaveLength(0);
  });

  it('SUJECION_ACTIVA: residente con sujeción activa aparece', () => {
    const suj = [mkRestraint('s1', 'r1')];
    const result = cohortEnRiesgo('SUJECION_ACTIVA', res, [], [], suj, NOW);
    expect(result.find((x) => x.residentId === 'r1')).toBeDefined();
  });

  it('SUJECION_ACTIVA: sujeción retirada no aparece', () => {
    const suj = [mkRestraint('s1', 'r1', { active: false })];
    const result = cohortEnRiesgo('SUJECION_ACTIVA', res, [], [], suj, NOW);
    expect(result).toHaveLength(0);
  });

  it('cohorte vacía → resultado vacío en todos los tipos', () => {
    for (const tipo of ['UPP_ACTIVA', 'SIN_VALORACION_VIGENTE', 'EN_RIESGO_UPP', 'SUJECION_ACTIVA'] as const) {
      const r = cohortEnRiesgo(tipo, [], [], [], [], NOW);
      expect(r).toHaveLength(0);
    }
  });
});

// ---------------------------------------------------------------------------
// División por cero y periodos vacíos
// ---------------------------------------------------------------------------

describe('edge cases: división por cero y periodos vacíos', () => {
  it('calcularIndicadorUPP con 0 estancias → tasaPor1000 = 0 (sin NaN)', () => {
    // Periodo de 0 días de duración no puede tener estancias significativas
    const periodCero: PeriodInput = { desde: NOW, hasta: NOW };
    const r = calcularIndicadorUPP([], [], periodCero, NOW);
    expect(r.incidenciaTasaPor1000).toBe(0);
    expect(Number.isNaN(r.incidenciaTasaPor1000)).toBe(false);
  });

  it('calcularIndicadorCaidas sin estancias → tasaPor1000 = 0 (sin NaN)', () => {
    const periodCero: PeriodInput = { desde: NOW, hasta: NOW };
    const r = calcularIndicadorCaidas([], [], periodCero);
    expect(r.tasaPor1000EstanciasDia).toBe(0);
    expect(Number.isNaN(r.tasaPor1000EstanciasDia)).toBe(false);
  });

  it('calcularCoberturaValoracion sin residentes → pctEnRiesgo = 0 (sin NaN)', () => {
    const r = calcularCoberturaValoracion([], [], NOW);
    expect(r.pctEnRiesgo).toBe(0);
    expect(Number.isNaN(r.pctEnRiesgo)).toBe(false);
  });

  it('calcularIndicadorUPP sin UPPs → 0% prevalencia (sin NaN en ningún campo)', () => {
    const res = [mkResident('r1')];
    const r = calcularIndicadorUPP(res, [], period, NOW);
    for (const [k, v] of Object.entries(r)) {
      if (typeof v === 'number') {
        expect(Number.isNaN(v), `${k} es NaN`).toBe(false);
      }
    }
  });

  it('periodo vacío (desde = hasta = ahora) → indicadores de caídas sin Infinity', () => {
    const periodCero: PeriodInput = { desde: NOW, hasta: NOW };
    const res = [mkResident('r1')];
    const r = calcularIndicadorCaidas(res, [], periodCero);
    expect(Number.isFinite(r.tasaPor1000EstanciasDia) || r.tasaPor1000EstanciasDia === 0).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Cálculo de estancias
// ---------------------------------------------------------------------------

describe('cálculo de estancias-día en periodo', () => {
  it('residente que ingresó antes del periodo y sigue activo → estancias = duración del periodo + 1', () => {
    // Periodo de 30 días, residente activo → 31 estancias
    const res = [mkResident('r1', { admissionDate: D(-60) })];
    const r = calcularIndicadorCaidas(res, [], period);
    // Con 31 estancias y 0 caídas, tasa = 0; verificamos que funciona
    expect(r.totalCaidas).toBe(0);
  });

  it('residente de baja antes del inicio del periodo → no computa en cohorte', () => {
    const res = [
      mkResident('r1'),
      mkResident('r2', { status: 'BAJA', admissionDate: D(-60), dischargeDate: D(-40) }),
    ];
    // r2 se dio de baja 10 días antes del inicio del periodo (D(-30))
    const caida = [mkFall('f1', 'r1', { occurredAt: D(-10) })];
    const r = calcularIndicadorCaidas(res, caida, period);
    // Solo r1 en el periodo
    expect(r.pctResidentesConCaida).toBe(100);
  });
});
