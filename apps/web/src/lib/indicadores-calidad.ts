/**
 * Indicadores de calidad asistencial — lógica de dominio pura.
 *
 * Funciones PURAS sin acceso a BD. Reciben datos ya cargados y devuelven
 * indicadores calculados para el panel de calidad del centro.
 *
 * Fuentes / definiciones de referencia:
 *   - Prevalencia e incidencia de UPP: EPUAP/NPUAP/PPPIA Guía de práctica clínica
 *     para la prevención y el tratamiento de las úlceras/lesiones por presión (2019).
 *     Tasa por 1.000 estancias-día: adaptación para centros sociosanitarios España.
 *   - Tasa de caídas: indicador estándar SEGG / ACSA (Agencia de Calidad Sanitaria
 *     de Andalucía). Tasa: nCaídas / estancias-día × 1.000.
 *   - Cobertura Norton/Braden: criterio del Plan de Cuidados UPP del GNEAUPP (2020).
 *     Umbral Norton ≤14 (alto riesgo); Braden ≤18 (riesgo).
 *   - Prevalencia de sujeciones: indicador de modelo de centros libres de sujeciones
 *     (CEOMA / IMSERSO). Tendencia esperada: decrecer hasta 0.
 *
 * Notas de diseño:
 *   - División por cero → 0 (no NaN ni Infinity). Siempre bien para la UI.
 *   - `now` es inyectable para hacer las funciones deterministas en tests.
 *   - "Periodo": [desde, hasta] cerrado; fechas UTC.
 *   - "Estancias-día": cálculo simplificado por residente activo en el periodo
 *     (ingreso ≤ hasta AND (baja > desde OR activo)).
 */

// ---------------------------------------------------------------------------
// Tipos de entrada (plain objects; no dependen de Prisma)
// ---------------------------------------------------------------------------

/** Datos mínimos de un residente para los cálculos del cohorte. */
export interface ResidentInput {
  id: string;
  status: 'ACTIVO' | 'BAJA' | 'PREINGRESO';
  admissionDate: Date | null;
  dischargeDate: Date | null;
  centerId: string;
  unitId: string | null; // id de la unidad donde tiene la cama
}

/** Registro de UPP para un residente. */
export interface PressureUlcerInput {
  id: string;
  residentId: string;
  stage: number;               // 1–4 (NPUAP/EPUAP)
  onsetDate: Date;
  resolvedDate: Date | null;
  acquired: 'INGRESO' | 'CENTRO';
  active: boolean;
}

/** Registro de caída. */
export interface FallRecordInput {
  id: string;
  residentId: string;
  occurredAt: Date;
  injuries: string | null;     // null = sin lesión; cualquier texto = con lesión
}

/** Valoración de escala de riesgo UPP. */
export interface AssessmentUPPInput {
  id: string;
  residentId: string;
  type: 'NORTON' | 'BRADEN';
  score: number;
  assessedAt: Date;
}

/** Registro de sujeción mecánica. */
export interface RestraintInput {
  id: string;
  residentId: string;
  active: boolean;
  prescribedAt: Date;
  endDate: Date | null;
}

/** Periodo de consulta [desde, hasta] — fechas UTC. */
export interface PeriodInput {
  desde: Date;
  hasta: Date;
}

// ---------------------------------------------------------------------------
// Umbrales clínicos (constantes puras, documentadas)
// ---------------------------------------------------------------------------

/**
 * Umbral de riesgo alto en la escala Norton (5–20).
 * Fuente: Norton D, McLaren R, Exton-Smith AN (1962); GNEAUPP 2020.
 * ≤14 = riesgo alto → activa protocolo de prevención.
 */
export const NORTON_HIGH_RISK_THRESHOLD = 14;

/**
 * Umbral de riesgo en la escala Braden (6–23).
 * Fuente: Braden & Bergstrom (1987); EPUAP/NPUAP 2019.
 * ≤18 = riesgo de UPP (a menor puntuación, mayor riesgo).
 */
export const BRADEN_RISK_THRESHOLD = 18;

/**
 * Tiempo máximo de vigencia de una valoración Norton/Braden para
 * considerarse "vigente" (30 días — cadencia mensual del GNEAUPP).
 */
export const VALORACION_VIGENCIA_DIAS = 30;

// ---------------------------------------------------------------------------
// Helpers internos (privados, testeados indirectamente)
// ---------------------------------------------------------------------------

/** Número de días entre dos fechas (absoluto, redondeado al entero más próximo). */
function diasEntreFechas(a: Date, b: Date): number {
  return Math.round(Math.abs(b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}

/**
 * Filtra los residentes activos durante el periodo dado (incluye residentes de baja
 * cuya fecha de baja cae dentro del periodo, es decir, que estuvieron activos en
 * algún momento del intervalo).
 *
 * Lógica:
 *   - ACTIVO sin dischargeDate → sigue en el centro.
 *   - BAJA con dischargeDate ≤ hasta  → estuvo durante el periodo.
 *   - PREINGRESO → no computado como estancia.
 *   - admissionDate null → se trata como si fuera antes del inicio del periodo.
 */
function residentesEnPeriodo(
  residents: ResidentInput[],
  period: PeriodInput,
): ResidentInput[] {
  return residents.filter((r) => {
    if (r.status === 'PREINGRESO') return false;
    const admision = r.admissionDate ?? new Date(0); // sin fecha = muy antiguo
    const alta = r.dischargeDate;
    // El residente debe haber ingresado antes del final del periodo
    if (admision > period.hasta) return false;
    // Y no haberse dado de alta antes del inicio del periodo
    if (alta !== null && alta < period.desde) return false;
    return true;
  });
}

/**
 * Calcula las estancias-día de un residente en el periodo dado.
 * Estancia-día = cada día en que el residente estuvo en el centro.
 *
 * Simplificación: usamos la longitud en días del intervalo efectivo
 * [max(admisionDate, desde), min(altaDate ?? hasta, hasta)] + 1.
 */
function estanciasDiasResidente(r: ResidentInput, period: PeriodInput): number {
  const inicio = r.admissionDate
    ? new Date(Math.max(r.admissionDate.getTime(), period.desde.getTime()))
    : period.desde;
  const fin = r.dischargeDate
    ? new Date(Math.min(r.dischargeDate.getTime(), period.hasta.getTime()))
    : period.hasta;
  if (fin < inicio) return 0;
  return diasEntreFechas(inicio, fin) + 1;
}

/** Suma total de estancias-día de una cohorte. */
function totalEstanciasDias(
  residents: ResidentInput[],
  period: PeriodInput,
): number {
  return residents.reduce((acc, r) => acc + estanciasDiasResidente(r, period), 0);
}

/** División segura: retorna 0 si el denominador es 0. */
function safeDivide(numerador: number, denominador: number): number {
  if (denominador === 0) return 0;
  return numerador / denominador;
}

/** Redondea a 2 decimales. */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ---------------------------------------------------------------------------
// A. Prevalencia e incidencia de UPP
// ---------------------------------------------------------------------------

export interface UPPStageCount {
  stage1: number;
  stage2: number;
  stage3: number;
  stage4: number;
}

export interface IndicadorUPP {
  /**
   * Prevalencia puntual: % de residentes activos (en el momento de consulta,
   * i.e. `now`) con al menos una UPP activa.
   * Fuente: EPUAP/NPUAP 2019 — prevalencia = (nConUPP / nTotal) × 100.
   */
  prevalenciaPct: number;

  /**
   * Prevalencia de UPP adquiridas EN EL CENTRO (%):
   * solo las UPPs marcadas como acquired='CENTRO' y activas en `now`.
   * Este es el indicador de calidad real (las de ingreso no son imputables).
   */
  prevalenciaCentroPct: number;

  /**
   * Incidencia en el periodo: nuevas UPPs aparecidas durante [desde, hasta]
   * (onsetDate dentro del periodo, acquired='CENTRO').
   * Expresado como nº absoluto y tasa por 1.000 estancias-día.
   */
  incidenciaNuevas: number;
  incidenciaTasaPor1000: number;

  /** Desglose de UPPs activas en `now` por estadio (incluye las de ingreso). */
  desglosePorEstadio: UPPStageCount;

  /** Número total de residentes activos en `now` en la cohorte. */
  totalResidentes: number;
}

/**
 * Calcula los indicadores de prevalencia e incidencia de UPP para una cohorte.
 *
 * @param residents  Lista completa de residentes del cohorte.
 * @param ulceras    Todas las UPPs del cohorte.
 * @param period     Periodo para el cálculo de incidencia y estancias.
 * @param now        Momento de referencia para prevalencia puntual.
 */
export function calcularIndicadorUPP(
  residents: ResidentInput[],
  ulceras: PressureUlcerInput[],
  period: PeriodInput,
  now: Date = new Date(),
): IndicadorUPP {
  // Residentes activos en `now` (para prevalencia puntual)
  const activosAhora = residents.filter(
    (r) => r.status === 'ACTIVO' || (r.dischargeDate !== null && r.dischargeDate > now),
  );
  const totalResidentes = activosAhora.length;

  // UPPs activas en `now` (resueltas no cuentan en prevalencia puntual)
  const uppActivasAhora = ulceras.filter(
    (u) => u.active || (u.resolvedDate !== null && u.resolvedDate > now),
  );

  // Residentes con ≥1 UPP activa
  const conUPPIds = new Set(uppActivasAhora.map((u) => u.residentId));
  const nConUPP = activosAhora.filter((r) => conUPPIds.has(r.id)).length;

  // Solo UPPs adquiridas EN el centro y activas ahora
  const uppCentroAhora = uppActivasAhora.filter((u) => u.acquired === 'CENTRO');
  const conUPPCentroIds = new Set(uppCentroAhora.map((u) => u.residentId));
  const nConUPPCentro = activosAhora.filter((r) => conUPPCentroIds.has(r.id)).length;

  // Incidencia en el periodo: nuevas UPPs adquiridas en el centro durante [desde, hasta]
  const nuevasEnPeriodo = ulceras.filter(
    (u) =>
      u.acquired === 'CENTRO' &&
      u.onsetDate >= period.desde &&
      u.onsetDate <= period.hasta,
  );

  // Estancias-día del periodo para la tasa de incidencia
  const enPeriodo = residentesEnPeriodo(residents, period);
  const estancias = totalEstanciasDias(enPeriodo, period);

  // Desglose por estadio (UPPs activas en `now`, todos los orígenes)
  const desglose: UPPStageCount = { stage1: 0, stage2: 0, stage3: 0, stage4: 0 };
  for (const u of uppActivasAhora) {
    if (u.stage === 1) desglose.stage1++;
    else if (u.stage === 2) desglose.stage2++;
    else if (u.stage === 3) desglose.stage3++;
    else if (u.stage === 4) desglose.stage4++;
  }

  return {
    prevalenciaPct: round2(safeDivide(nConUPP, totalResidentes) * 100),
    prevalenciaCentroPct: round2(safeDivide(nConUPPCentro, totalResidentes) * 100),
    incidenciaNuevas: nuevasEnPeriodo.length,
    incidenciaTasaPor1000: round2(safeDivide(nuevasEnPeriodo.length, estancias) * 1000),
    desglosePorEstadio: desglose,
    totalResidentes,
  };
}

// ---------------------------------------------------------------------------
// B. Tasa de caídas
// ---------------------------------------------------------------------------

export interface IndicadorCaidas {
  /**
   * Número absoluto de caídas en el periodo.
   */
  totalCaidas: number;

  /**
   * Caídas por 1.000 estancias-día en el periodo.
   * Indicador estándar SEGG / ACSA.
   */
  tasaPor1000EstanciasDia: number;

  /**
   * % de residentes activos en el periodo que sufrieron ≥1 caída.
   */
  pctResidentesConCaida: number;

  /**
   * Número de caídas con lesión documentada (injuries != null).
   */
  caidasConLesion: number;

  /**
   * % de caídas que resultaron en lesión.
   */
  pctCaidasConLesion: number;
}

/**
 * Calcula los indicadores de caídas para una cohorte en un periodo dado.
 *
 * @param residents  Lista completa de residentes del cohorte.
 * @param caidas     Todos los registros de caída del cohorte.
 * @param period     Periodo de análisis.
 */
export function calcularIndicadorCaidas(
  residents: ResidentInput[],
  caidas: FallRecordInput[],
  period: PeriodInput,
): IndicadorCaidas {
  const enPeriodo = residentesEnPeriodo(residents, period);
  const estancias = totalEstanciasDias(enPeriodo, period);

  // Caídas ocurridas dentro del periodo
  const caidasEnPeriodo = caidas.filter(
    (c) => c.occurredAt >= period.desde && c.occurredAt <= period.hasta,
  );

  const totalCaidas = caidasEnPeriodo.length;

  // Residentes únicos con ≥1 caída en el periodo
  const residConCaidaIds = new Set(caidasEnPeriodo.map((c) => c.residentId));
  const nConCaida = enPeriodo.filter((r) => residConCaidaIds.has(r.id)).length;

  // Caídas con lesión (injuries != null y no vacío)
  const conLesion = caidasEnPeriodo.filter(
    (c) => c.injuries !== null && c.injuries.trim().length > 0,
  );

  return {
    totalCaidas,
    tasaPor1000EstanciasDia: round2(safeDivide(totalCaidas, estancias) * 1000),
    pctResidentesConCaida: round2(safeDivide(nConCaida, enPeriodo.length) * 100),
    caidasConLesion: conLesion.length,
    pctCaidasConLesion: round2(safeDivide(conLesion.length, totalCaidas) * 100),
  };
}

// ---------------------------------------------------------------------------
// C. Cobertura de valoración de riesgo UPP (Norton / Braden)
// ---------------------------------------------------------------------------

export interface IndicadorCoberturaNortonBraden {
  /**
   * % de residentes activos en `now` con valoración Norton o Braden
   * vigente (assessedAt dentro de los últimos VALORACION_VIGENCIA_DIAS días).
   */
  pctConValoracionVigente: number;

  /**
   * % de residentes con valoración vigente que están EN RIESGO
   * (Norton ≤ NORTON_HIGH_RISK_THRESHOLD o Braden ≤ BRADEN_RISK_THRESHOLD).
   */
  pctEnRiesgo: number;

  /**
   * Número absoluto de residentes sin valoración vigente.
   */
  sinValoracionVigente: number;

  /**
   * Número absoluto de residentes en riesgo (de los que tienen valoración vigente).
   */
  enRiesgo: number;

  /** Total de residentes activos en `now` en la cohorte. */
  totalResidentes: number;
}

/**
 * Calcula la cobertura de valoración de riesgo Norton/Braden.
 *
 * "Vigente" = la valoración más reciente del residente (Norton o Braden,
 * tomando la más reciente de ambas) fue realizada hace ≤ VALORACION_VIGENCIA_DIAS días.
 *
 * @param residents    Lista de residentes del cohorte.
 * @param assessments  Todas las valoraciones Norton/Braden del cohorte.
 * @param now          Momento de referencia.
 */
export function calcularCoberturaValoracion(
  residents: ResidentInput[],
  assessments: AssessmentUPPInput[],
  now: Date = new Date(),
): IndicadorCoberturaNortonBraden {
  // Solo residentes activos ahora
  const activos = residents.filter((r) => r.status === 'ACTIVO');
  const total = activos.length;

  // Por cada residente, obtener la valoración más reciente (Norton o Braden)
  const ultimaValoracion = new Map<
    string,
    { score: number; type: 'NORTON' | 'BRADEN'; assessedAt: Date }
  >();

  for (const a of assessments) {
    const existing = ultimaValoracion.get(a.residentId);
    if (!existing || a.assessedAt > existing.assessedAt) {
      ultimaValoracion.set(a.residentId, {
        score: a.score,
        type: a.type,
        assessedAt: a.assessedAt,
      });
    }
  }

  let conVigente = 0;
  let enRiesgoCount = 0;

  for (const r of activos) {
    const val = ultimaValoracion.get(r.id);
    if (!val) continue;

    const diasDesde = diasEntreFechas(val.assessedAt, now);
    if (diasDesde > VALORACION_VIGENCIA_DIAS) continue;

    conVigente++;

    // Determinar si está en riesgo según la escala
    const esRiesgo =
      val.type === 'NORTON'
        ? val.score <= NORTON_HIGH_RISK_THRESHOLD
        : val.score <= BRADEN_RISK_THRESHOLD;

    if (esRiesgo) enRiesgoCount++;
  }

  return {
    pctConValoracionVigente: round2(safeDivide(conVigente, total) * 100),
    pctEnRiesgo: round2(safeDivide(enRiesgoCount, conVigente) * 100),
    sinValoracionVigente: total - conVigente,
    enRiesgo: enRiesgoCount,
    totalResidentes: total,
  };
}

// ---------------------------------------------------------------------------
// D. Prevalencia de sujeciones
// ---------------------------------------------------------------------------

export interface IndicadorSujeciones {
  /**
   * % de residentes activos en `now` con sujeción activa.
   * Indicador de calidad: el objetivo es acercarse a 0
   * (modelo de centros libres de sujeciones — CEOMA/IMSERSO).
   */
  prevalenciaPct: number;

  /** Número absoluto de residentes con sujeción activa. */
  conSujecionActiva: number;

  /** Total de residentes activos en `now`. */
  totalResidentes: number;
}

/**
 * Calcula la prevalencia de sujeciones mecánicas activas.
 *
 * "Activa" = restraint.active = true y (endDate null o endDate > now).
 *
 * @param residents   Lista de residentes del cohorte.
 * @param restraints  Todos los registros de sujeción del cohorte.
 * @param now         Momento de referencia.
 */
export function calcularPrevalenciaSujeciones(
  residents: ResidentInput[],
  restraints: RestraintInput[],
  now: Date = new Date(),
): IndicadorSujeciones {
  const activos = residents.filter((r) => r.status === 'ACTIVO');
  const total = activos.length;

  // Sujeciones activas en `now`
  const sujecionesActivas = restraints.filter(
    (s) => s.active && (s.endDate === null || s.endDate > now),
  );

  const conSujecionIds = new Set(sujecionesActivas.map((s) => s.residentId));
  const nConSujecion = activos.filter((r) => conSujecionIds.has(r.id)).length;

  return {
    prevalenciaPct: round2(safeDivide(nConSujecion, total) * 100),
    conSujecionActiva: nConSujecion,
    totalResidentes: total,
  };
}

// ---------------------------------------------------------------------------
// E. Dashboard consolidado (todos los indicadores)
// ---------------------------------------------------------------------------

export interface DashboardCalidad {
  /** Periodo consultado. */
  period: PeriodInput;

  /** Indicadores de UPP. */
  upp: IndicadorUPP;

  /** Indicadores de caídas. */
  caidas: IndicadorCaidas;

  /** Cobertura de valoración de riesgo UPP. */
  coberturaValoracion: IndicadorCoberturaNortonBraden;

  /** Prevalencia de sujeciones. */
  sujeciones: IndicadorSujeciones;
}

/**
 * Calcula todos los indicadores de calidad asistencial de una cohorte.
 * Función de orquestación pura (sin BD): llama a cada calculadora individual.
 */
export function calcularDashboardCalidad(
  residents: ResidentInput[],
  ulceras: PressureUlcerInput[],
  caidas: FallRecordInput[],
  assessments: AssessmentUPPInput[],
  restraints: RestraintInput[],
  period: PeriodInput,
  now: Date = new Date(),
): DashboardCalidad {
  return {
    period,
    upp: calcularIndicadorUPP(residents, ulceras, period, now),
    caidas: calcularIndicadorCaidas(residents, caidas, period),
    coberturaValoracion: calcularCoberturaValoracion(residents, assessments, now),
    sujeciones: calcularPrevalenciaSujeciones(residents, restraints, now),
  };
}

// ---------------------------------------------------------------------------
// F. Cohort at risk — lista de residentes que disparan un indicador
// ---------------------------------------------------------------------------

export type IndicadorTipo = 'UPP_ACTIVA' | 'SIN_VALORACION_VIGENTE' | 'EN_RIESGO_UPP' | 'SUJECION_ACTIVA';

export interface ResidenteEnRiesgo {
  residentId: string;
  motivo: IndicadorTipo;
  detalle: string; // descripción legible del motivo
}

/**
 * Devuelve la lista de residentes que activan un indicador concreto.
 * Usada por el endpoint cohortAtRisk para acción directa desde el panel.
 *
 * @param tipo       Indicador a verificar.
 * @param residents  Lista de residentes.
 * @param ulceras    UPPs (para UPP_ACTIVA).
 * @param assessments Valoraciones Norton/Braden (para SIN_VALORACION_VIGENTE, EN_RIESGO_UPP).
 * @param restraints Sujeciones (para SUJECION_ACTIVA).
 * @param now        Momento de referencia.
 */
export function cohortEnRiesgo(
  tipo: IndicadorTipo,
  residents: ResidentInput[],
  ulceras: PressureUlcerInput[],
  assessments: AssessmentUPPInput[],
  restraints: RestraintInput[],
  now: Date = new Date(),
): ResidenteEnRiesgo[] {
  const activos = residents.filter((r) => r.status === 'ACTIVO');
  const result: ResidenteEnRiesgo[] = [];

  if (tipo === 'UPP_ACTIVA') {
    const uppActivas = ulceras.filter(
      (u) => u.active || (u.resolvedDate !== null && u.resolvedDate > now),
    );
    const porResidente = new Map<string, number[]>();
    for (const u of uppActivas) {
      const stages = porResidente.get(u.residentId) ?? [];
      stages.push(u.stage);
      porResidente.set(u.residentId, stages);
    }
    for (const r of activos) {
      const stages = porResidente.get(r.id);
      if (stages && stages.length > 0) {
        result.push({
          residentId: r.id,
          motivo: 'UPP_ACTIVA',
          detalle: `${stages.length} UPP activa(s) — estadios: ${stages.sort().join(', ')}`,
        });
      }
    }
  }

  if (tipo === 'SIN_VALORACION_VIGENTE') {
    const ultimaVal = new Map<string, Date>();
    for (const a of assessments) {
      const existing = ultimaVal.get(a.residentId);
      if (!existing || a.assessedAt > existing) {
        ultimaVal.set(a.residentId, a.assessedAt);
      }
    }
    for (const r of activos) {
      const ultima = ultimaVal.get(r.id);
      if (!ultima) {
        result.push({
          residentId: r.id,
          motivo: 'SIN_VALORACION_VIGENTE',
          detalle: 'Sin valoración Norton/Braden registrada',
        });
      } else {
        const dias = diasEntreFechas(ultima, now);
        if (dias > VALORACION_VIGENCIA_DIAS) {
          result.push({
            residentId: r.id,
            motivo: 'SIN_VALORACION_VIGENTE',
            detalle: `Valoración vencida hace ${dias - VALORACION_VIGENCIA_DIAS} días`,
          });
        }
      }
    }
  }

  if (tipo === 'EN_RIESGO_UPP') {
    const ultimaValDetalle = new Map<
      string,
      { score: number; type: 'NORTON' | 'BRADEN'; assessedAt: Date }
    >();
    for (const a of assessments) {
      const existing = ultimaValDetalle.get(a.residentId);
      if (!existing || a.assessedAt > existing.assessedAt) {
        ultimaValDetalle.set(a.residentId, {
          score: a.score,
          type: a.type,
          assessedAt: a.assessedAt,
        });
      }
    }
    for (const r of activos) {
      const val = ultimaValDetalle.get(r.id);
      if (!val) continue;
      const dias = diasEntreFechas(val.assessedAt, now);
      if (dias > VALORACION_VIGENCIA_DIAS) continue; // vencida, no cuenta en riesgo vigente

      const esRiesgo =
        val.type === 'NORTON'
          ? val.score <= NORTON_HIGH_RISK_THRESHOLD
          : val.score <= BRADEN_RISK_THRESHOLD;

      if (esRiesgo) {
        result.push({
          residentId: r.id,
          motivo: 'EN_RIESGO_UPP',
          detalle: `${val.type} ${val.score} — riesgo ${val.type === 'NORTON' ? `≤${NORTON_HIGH_RISK_THRESHOLD}` : `≤${BRADEN_RISK_THRESHOLD}`}`,
        });
      }
    }
  }

  if (tipo === 'SUJECION_ACTIVA') {
    const sujecionesActivas = restraints.filter(
      (s) => s.active && (s.endDate === null || s.endDate > now),
    );
    const porResidente = new Map<string, number>();
    for (const s of sujecionesActivas) {
      porResidente.set(s.residentId, (porResidente.get(s.residentId) ?? 0) + 1);
    }
    for (const r of activos) {
      const n = porResidente.get(r.id);
      if (n && n > 0) {
        result.push({
          residentId: r.id,
          motivo: 'SUJECION_ACTIVA',
          detalle: `${n} sujeción(es) mecánica(s) activa(s)`,
        });
      }
    }
  }

  return result;
}
