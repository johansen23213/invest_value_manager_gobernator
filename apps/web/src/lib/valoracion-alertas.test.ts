import { describe, expect, it } from 'vitest';
import {
  SCALE_CADENCE_DAYS,
  ALERT_AHEAD_DAYS,
  getScaleCadenceDays,
  isAssessmentOverdue,
  getAssessmentStatus,
  computeOverdueAlerts,
  type ScaleType,
  type AssessmentEntry,
} from './valoracion-alertas';

// ---------------------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------------------

describe('SCALE_CADENCE_DAYS — cadencias por defecto', () => {
  it('cubre las 11 escalas definidas en AssessmentType', () => {
    const escalas: ScaleType[] = [
      'BARTHEL', 'TINETTI', 'PFEIFFER', 'MEC_LOBO', 'GDS_REISBERG',
      'NORTON', 'BRADEN', 'MNA', 'PAINAD', 'DOWNTON', 'LAWTON_BRODY',
    ];
    for (const e of escalas) {
      expect(SCALE_CADENCE_DAYS[e], `falta cadencia para ${e}`).toBeGreaterThan(0);
    }
  });

  it('NORTON y BRADEN tienen cadencia mensual (30 días) — riesgo UPP', () => {
    expect(SCALE_CADENCE_DAYS.NORTON).toBe(30);
    expect(SCALE_CADENCE_DAYS.BRADEN).toBe(30);
  });

  it('PAINAD tiene cadencia mensual (30 días) — dolor en demencia avanzada', () => {
    expect(SCALE_CADENCE_DAYS.PAINAD).toBe(30);
  });

  it('BARTHEL y TINETTI tienen cadencia semestral (180 días)', () => {
    expect(SCALE_CADENCE_DAYS.BARTHEL).toBe(180);
    expect(SCALE_CADENCE_DAYS.TINETTI).toBe(180);
  });

  it('PFEIFFER, MNA, DOWNTON tienen cadencia trimestral (90 días)', () => {
    expect(SCALE_CADENCE_DAYS.PFEIFFER).toBe(90);
    expect(SCALE_CADENCE_DAYS.MNA).toBe(90);
    expect(SCALE_CADENCE_DAYS.DOWNTON).toBe(90);
  });

  it('GDS_REISBERG y LAWTON_BRODY tienen cadencia semestral (180 días)', () => {
    expect(SCALE_CADENCE_DAYS.GDS_REISBERG).toBe(180);
    expect(SCALE_CADENCE_DAYS.LAWTON_BRODY).toBe(180);
  });
});

describe('ALERT_AHEAD_DAYS', () => {
  it('la ventana de alerta anticipada es de 15 días', () => {
    expect(ALERT_AHEAD_DAYS).toBe(15);
  });
});

// ---------------------------------------------------------------------------
// getScaleCadenceDays
// ---------------------------------------------------------------------------

describe('getScaleCadenceDays', () => {
  it('devuelve la cadencia por defecto si no hay override', () => {
    expect(getScaleCadenceDays('BARTHEL')).toBe(180);
    expect(getScaleCadenceDays('NORTON')).toBe(30);
  });

  it('aplica el override si es un entero positivo', () => {
    expect(getScaleCadenceDays('BARTHEL', 60)).toBe(60);
    expect(getScaleCadenceDays('NORTON', 14)).toBe(14);
  });

  it('ignora el override si es 0', () => {
    expect(getScaleCadenceDays('BARTHEL', 0)).toBe(180);
  });

  it('ignora el override si es negativo', () => {
    expect(getScaleCadenceDays('BARTHEL', -10)).toBe(180);
  });

  it('ignora el override si no es entero', () => {
    expect(getScaleCadenceDays('BARTHEL', 30.5)).toBe(180);
  });

  it('ignora el override si es undefined', () => {
    expect(getScaleCadenceDays('NORTON', undefined)).toBe(30);
  });
});

// ---------------------------------------------------------------------------
// isAssessmentOverdue
// ---------------------------------------------------------------------------

describe('isAssessmentOverdue', () => {
  const now = new Date('2026-06-14T12:00:00Z');

  it('no vencida si lastDate es hoy (cadencia 30 días)', () => {
    expect(isAssessmentOverdue(now, 30, now)).toBe(false);
  });

  it('no vencida si han pasado exactamente cadenceDays días', () => {
    const lastDate = new Date('2026-05-15T12:00:00Z'); // 30 días exactos antes
    expect(isAssessmentOverdue(lastDate, 30, now)).toBe(false);
  });

  it('vencida si han pasado cadenceDays + 1 días', () => {
    const lastDate = new Date('2026-05-14T12:00:00Z'); // 31 días antes
    expect(isAssessmentOverdue(lastDate, 30, now)).toBe(true);
  });

  it('vencida con mucho margen (6 meses, cadencia 30 días)', () => {
    const lastDate = new Date('2025-12-14T12:00:00Z'); // ~182 días antes
    expect(isAssessmentOverdue(lastDate, 30, now)).toBe(true);
  });

  it('no vencida con cadencia semestral si fue hace 3 meses', () => {
    const lastDate = new Date('2026-03-14T12:00:00Z'); // 92 días antes
    expect(isAssessmentOverdue(lastDate, 180, now)).toBe(false);
  });

  it('vencida con cadencia semestral si fue hace 7 meses', () => {
    const lastDate = new Date('2025-11-14T12:00:00Z'); // ~212 días antes
    expect(isAssessmentOverdue(lastDate, 180, now)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// getAssessmentStatus
// ---------------------------------------------------------------------------

describe('getAssessmentStatus', () => {
  const now = new Date('2026-06-14T00:00:00Z');

  describe('estado al_dia', () => {
    it('devuelve al_dia si quedan más de 15 días (>ALERT_AHEAD_DAYS)', () => {
      const lastDate = new Date('2026-06-01T00:00:00Z'); // 13 días atrás, cadencia 30 → vence en 17 días
      const result = getAssessmentStatus(lastDate, 30, now);
      expect(result.status).toBe('al_dia');
      expect(result.daysUntilDue).toBe(17);
      expect(result.daysOverdue).toBe(-17);
    });

    it('al_dia con cadencia semestral si fue hace 1 semana', () => {
      const lastDate = new Date('2026-06-07T00:00:00Z');
      const result = getAssessmentStatus(lastDate, 180, now);
      expect(result.status).toBe('al_dia');
      expect(result.daysUntilDue).toBeGreaterThan(ALERT_AHEAD_DAYS);
    });
  });

  describe('estado proxima', () => {
    it('devuelve proxima si quedan exactamente 15 días (igual a ALERT_AHEAD_DAYS)', () => {
      // lastDate: 15 días atrás con cadencia 30 → dueDate = en 15 días
      const lastDate = new Date('2026-05-30T00:00:00Z'); // 15 días atrás
      const result = getAssessmentStatus(lastDate, 30, now);
      expect(result.status).toBe('proxima');
      expect(result.daysUntilDue).toBe(15);
    });

    it('devuelve proxima si quedan 1 día', () => {
      const lastDate = new Date('2026-05-16T00:00:00Z'); // 29 días atrás, cadencia 30 → 1 día restante
      const result = getAssessmentStatus(lastDate, 30, now);
      expect(result.status).toBe('proxima');
      expect(result.daysUntilDue).toBe(1);
    });

    it('devuelve proxima si quedan 0 días (vence hoy)', () => {
      const lastDate = new Date('2026-05-15T00:00:00Z'); // 30 días atrás, cadencia 30 → dueDate = hoy
      const result = getAssessmentStatus(lastDate, 30, now);
      expect(result.status).toBe('proxima');
      expect(result.daysUntilDue).toBe(0);
    });
  });

  describe('estado vencida', () => {
    it('devuelve vencida si venció hace 1 día', () => {
      const lastDate = new Date('2026-05-14T00:00:00Z'); // 31 días atrás, cadencia 30
      const result = getAssessmentStatus(lastDate, 30, now);
      expect(result.status).toBe('vencida');
      expect(result.daysOverdue).toBe(1);
      expect(result.daysUntilDue).toBe(-1);
    });

    it('devuelve vencida con muchos días de retraso', () => {
      const lastDate = new Date('2025-12-01T00:00:00Z'); // mucho tiempo atrás
      const result = getAssessmentStatus(lastDate, 30, now);
      expect(result.status).toBe('vencida');
      expect(result.daysOverdue).toBeGreaterThan(100);
    });

    it('dueDate es consistente con lastDate + cadenceDays', () => {
      const lastDate = new Date('2026-01-14T00:00:00Z');
      const result = getAssessmentStatus(lastDate, 30, now);
      const expectedDue = new Date('2026-02-13T00:00:00Z');
      expect(result.dueDate.toDateString()).toBe(expectedDue.toDateString());
    });
  });
});

// ---------------------------------------------------------------------------
// computeOverdueAlerts
// ---------------------------------------------------------------------------

describe('computeOverdueAlerts', () => {
  const now = new Date('2026-06-14T00:00:00Z');

  it('filtra solo vencidas y próximas, no las al_dia', () => {
    const assessments: AssessmentEntry[] = [
      { scaleType: 'BARTHEL', lastDate: new Date('2026-06-01T00:00:00Z') }, // al_dia (13 días atrás, cadencia 180)
      { scaleType: 'NORTON',  lastDate: new Date('2026-05-10T00:00:00Z') }, // vencida (35 días atrás, cadencia 30)
    ];
    const alerts = computeOverdueAlerts(assessments, now);
    expect(alerts).toHaveLength(1);
    expect(alerts[0]!.scaleType).toBe('NORTON');
    expect(alerts[0]!.status).toBe('vencida');
  });

  it('devuelve lista vacía si todas al_dia', () => {
    const assessments: AssessmentEntry[] = [
      { scaleType: 'BARTHEL', lastDate: new Date('2026-06-01T00:00:00Z') }, // 13 días, cadencia 180
      { scaleType: 'TINETTI', lastDate: new Date('2026-05-01T00:00:00Z') }, // 44 días, cadencia 180
    ];
    const alerts = computeOverdueAlerts(assessments, now);
    expect(alerts).toHaveLength(0);
  });

  it('ordena vencidas antes que próximas y por días de retraso descendente', () => {
    // TINETTI cadencia 180. Fecha: 2025-12-26 → dueDate = 2026-06-24 → 10 días → proxima
    // NORTON cadencia 30. Fecha: 2026-04-01 → dueDate = 2026-05-01 → 44 días vencida
    // BRADEN cadencia 30. Fecha: 2026-05-10 → dueDate = 2026-06-09 → 5 días vencida
    const assessments: AssessmentEntry[] = [
      { scaleType: 'TINETTI', lastDate: new Date('2025-12-26T00:00:00Z') }, // proxima: vence en ~10 días
      { scaleType: 'NORTON',  lastDate: new Date('2026-04-01T00:00:00Z') }, // muy vencida: 44 días de retraso
      { scaleType: 'BRADEN',  lastDate: new Date('2026-05-10T00:00:00Z') }, // vencida: 5 días de retraso
    ];
    const alerts = computeOverdueAlerts(assessments, now);
    // NORTON más vencida > BRADEN vencida > TINETTI próxima
    expect(alerts).toHaveLength(3);
    expect(alerts[0]!.scaleType).toBe('NORTON');
    expect(alerts[0]!.status).toBe('vencida');
    expect(alerts[1]!.scaleType).toBe('BRADEN');
    expect(alerts[1]!.status).toBe('vencida');
    expect(alerts[2]!.scaleType).toBe('TINETTI');
    expect(alerts[2]!.status).toBe('proxima');
  });

  it('respeta el override de cadencia', () => {
    const assessments: AssessmentEntry[] = [
      // Con cadencia default (180), no habría vencido; con override 10, sí
      { scaleType: 'BARTHEL', lastDate: new Date('2026-06-01T00:00:00Z'), overrideDays: 10 },
    ];
    const alerts = computeOverdueAlerts(assessments, now);
    expect(alerts).toHaveLength(1);
    expect(alerts[0]!.cadenceDays).toBe(10);
    expect(alerts[0]!.status).toBe('vencida');
  });

  it('lista vacía si assessments es un array vacío', () => {
    expect(computeOverdueAlerts([], now)).toHaveLength(0);
  });

  it('incluye cadenceDays en cada alerta', () => {
    const assessments: AssessmentEntry[] = [
      { scaleType: 'NORTON', lastDate: new Date('2026-05-01T00:00:00Z') },
    ];
    const alerts = computeOverdueAlerts(assessments, now);
    expect(alerts[0]!.cadenceDays).toBe(30);
  });
});
