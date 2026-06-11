// Centro de alertas priorizado (UX-18). Función pura (sin BD) para testearla.
//
// Unifica en un único feed las señales accionables del día y las ordena por prioridad:
//  - Medicación NO administrada (riesgo clínico, sensible al tiempo) → severidad alta.
//  - Incidencias de atención directa: alta si el texto sugiere caída/lesión, si no media.
// Orden: severidad (alta antes que media) y, dentro de la misma, lo más reciente primero.

export type AlertKind = 'MEDICATION' | 'INCIDENT';
export type AlertSeverity = 'high' | 'medium';

export interface AlertItem {
  /** Clave estable para React y deduplicación. */
  id: string;
  kind: AlertKind;
  severity: AlertSeverity;
  residentId?: string;
  residentName?: string;
  /** Titular corto (qué pasa). */
  title: string;
  /** Detalle opcional (medicamento, descripción de la incidencia…). */
  detail?: string;
  /** Momento del evento en ISO (hora pautada para medicación, registro para incidencia). */
  at: string;
}

/** Dosis no administrada que entra al feed. */
export interface MedicationAlertInput {
  medicationId: string;
  medicationName: string;
  dose: string;
  scheduledAt: string; // ISO
  residentId?: string;
  residentName?: string;
}

/** Incidencia (CareRecord tipo INCIDENCIA) que entra al feed. */
export interface IncidentInput {
  id: string;
  description: string;
  recordedAt: string; // ISO
  residentId?: string;
  residentName?: string;
}

// Palabras que elevan una incidencia a severidad alta (caída/lesión/urgencia).
const HIGH_INCIDENT = /ca[ií]d|golpe|herida|fractur|sangr|convuls|asfixia|quemadura|desmay/i;

/** ¿La descripción de la incidencia sugiere un evento de severidad alta? */
export function isHighSeverityIncident(description: string): boolean {
  return HIGH_INCIDENT.test(description);
}

const SEVERITY_RANK: Record<AlertSeverity, number> = { high: 0, medium: 1 };

export interface BuildAlertFeedInput {
  medicationAlerts: MedicationAlertInput[];
  incidents: IncidentInput[];
}

/**
 * Construye el feed de alertas priorizado. No accede a BD: recibe las señales ya
 * leídas (con RLS/permisos aplicados en el router) y solo las normaliza y ordena.
 */
export function buildAlertFeed(input: BuildAlertFeedInput): AlertItem[] {
  const med: AlertItem[] = input.medicationAlerts.map((m) => ({
    id: `med:${m.medicationId}:${m.scheduledAt}`,
    kind: 'MEDICATION',
    severity: 'high',
    residentId: m.residentId,
    residentName: m.residentName,
    title: 'Dosis no administrada',
    detail: `${m.medicationName} · ${m.dose}`,
    at: m.scheduledAt,
  }));

  const incidents: AlertItem[] = input.incidents.map((i) => ({
    id: `inc:${i.id}`,
    kind: 'INCIDENT',
    severity: isHighSeverityIncident(i.description) ? 'high' : 'medium',
    residentId: i.residentId,
    residentName: i.residentName,
    title: 'Incidencia',
    detail: i.description,
    at: i.recordedAt,
  }));

  return [...med, ...incidents].sort((a, b) => {
    const bySeverity = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
    if (bySeverity !== 0) return bySeverity;
    return b.at.localeCompare(a.at); // más reciente primero
  });
}

/** Recuento por severidad, para la cabecera del centro de alertas. */
export function countBySeverity(items: AlertItem[]): { high: number; medium: number; total: number } {
  let high = 0;
  let medium = 0;
  for (const it of items) {
    if (it.severity === 'high') high += 1;
    else medium += 1;
  }
  return { high, medium, total: items.length };
}
