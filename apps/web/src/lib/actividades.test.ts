import { describe, expect, it } from 'vitest';
import {
  hasCapacity,
  plazasLibres,
  primeroEnEspera,
  seSolapan,
  sesionesConSolape,
  canEnroll,
  canRecord,
  estadoInscripcion,
  type SesionInfo,
  type InscripcionInfo,
} from './actividades';

// ---------------------------------------------------------------------------
// Helpers de test
// ---------------------------------------------------------------------------

function makeSesion(overrides: Partial<SesionInfo> = {}): SesionInfo {
  return {
    id: 'ses-1',
    startsAt: new Date('2026-06-20T10:00:00Z'),
    endsAt:   new Date('2026-06-20T11:00:00Z'),
    status:   'PROGRAMADA',
    maxCapacity: 5,
    ...overrides,
  };
}

function makeInscripcion(overrides: Partial<InscripcionInfo> = {}): InscripcionInfo {
  return {
    id:         'enr-1',
    residentId: 'res-1',
    status:     'INSCRITO',
    enrolledAt: new Date('2026-06-15T09:00:00Z'),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// hasCapacity — control de aforo
// ---------------------------------------------------------------------------

describe('hasCapacity', () => {
  it('devuelve true si no hay nadie inscrito', () => {
    const sesion = makeSesion({ maxCapacity: 5 });
    expect(hasCapacity(sesion, [])).toBe(true);
  });

  it('devuelve true si hay plazas disponibles', () => {
    const sesion = makeSesion({ maxCapacity: 3 });
    const inscritos = [
      makeInscripcion({ id: 'e1', residentId: 'r1', status: 'INSCRITO' }),
      makeInscripcion({ id: 'e2', residentId: 'r2', status: 'INSCRITO' }),
    ];
    expect(hasCapacity(sesion, inscritos)).toBe(true);
  });

  it('devuelve false cuando el aforo está lleno', () => {
    const sesion = makeSesion({ maxCapacity: 2 });
    const inscritos = [
      makeInscripcion({ id: 'e1', residentId: 'r1', status: 'INSCRITO' }),
      makeInscripcion({ id: 'e2', residentId: 'r2', status: 'INSCRITO' }),
    ];
    expect(hasCapacity(sesion, inscritos)).toBe(false);
  });

  it('no cuenta las inscripciones en lista de espera como plazas ocupadas', () => {
    const sesion = makeSesion({ maxCapacity: 1 });
    const inscritos = [
      makeInscripcion({ id: 'e1', residentId: 'r1', status: 'INSCRITO' }),
      makeInscripcion({ id: 'e2', residentId: 'r2', status: 'LISTA_ESPERA' }),
    ];
    // Hay 1 INSCRITO y el aforo es 1 → lleno, pero la lista de espera no cuenta
    expect(hasCapacity(sesion, inscritos)).toBe(false);
  });

  it('no cuenta las inscripciones CANCELADAS', () => {
    const sesion = makeSesion({ maxCapacity: 2 });
    const inscritos = [
      makeInscripcion({ id: 'e1', residentId: 'r1', status: 'INSCRITO' }),
      makeInscripcion({ id: 'e2', residentId: 'r2', status: 'CANCELADO' }),
    ];
    expect(hasCapacity(sesion, inscritos)).toBe(true);
  });

  it('aforo cero: nunca hay capacidad', () => {
    const sesion = makeSesion({ maxCapacity: 0 });
    expect(hasCapacity(sesion, [])).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// plazasLibres
// ---------------------------------------------------------------------------

describe('plazasLibres', () => {
  it('devuelve maxCapacity cuando no hay inscritos', () => {
    expect(plazasLibres({ maxCapacity: 10 }, [])).toBe(10);
  });

  it('descuenta solo los INSCRITO', () => {
    const inscripciones = [
      makeInscripcion({ id: 'e1', residentId: 'r1', status: 'INSCRITO' }),
      makeInscripcion({ id: 'e2', residentId: 'r2', status: 'LISTA_ESPERA' }),
      makeInscripcion({ id: 'e3', residentId: 'r3', status: 'CANCELADO' }),
    ];
    expect(plazasLibres({ maxCapacity: 5 }, inscripciones)).toBe(4);
  });

  it('puede ser negativo si el aforo se redujo', () => {
    const inscripciones = [
      makeInscripcion({ id: 'e1', residentId: 'r1', status: 'INSCRITO' }),
      makeInscripcion({ id: 'e2', residentId: 'r2', status: 'INSCRITO' }),
      makeInscripcion({ id: 'e3', residentId: 'r3', status: 'INSCRITO' }),
    ];
    expect(plazasLibres({ maxCapacity: 2 }, inscripciones)).toBe(-1);
  });
});

// ---------------------------------------------------------------------------
// primeroEnEspera — gestión de lista de espera
// ---------------------------------------------------------------------------

describe('primeroEnEspera', () => {
  it('devuelve null si no hay nadie en lista de espera', () => {
    expect(primeroEnEspera([])).toBeNull();
    expect(primeroEnEspera([makeInscripcion({ status: 'INSCRITO' })])).toBeNull();
    expect(primeroEnEspera([makeInscripcion({ status: 'CANCELADO' })])).toBeNull();
  });

  it('devuelve el residentId del primero en lista de espera (más antiguo)', () => {
    const inscripciones = [
      makeInscripcion({ id: 'e1', residentId: 'res-B', status: 'LISTA_ESPERA', enrolledAt: new Date('2026-06-15T10:00:00Z') }),
      makeInscripcion({ id: 'e2', residentId: 'res-A', status: 'LISTA_ESPERA', enrolledAt: new Date('2026-06-15T09:00:00Z') }),
    ];
    expect(primeroEnEspera(inscripciones)).toBe('res-A');
  });

  it('ignora los INSCRITO y CANCELADO al seleccionar el primero en espera', () => {
    const inscripciones = [
      makeInscripcion({ id: 'e1', residentId: 'res-inscrito', status: 'INSCRITO', enrolledAt: new Date('2026-06-15T08:00:00Z') }),
      makeInscripcion({ id: 'e2', residentId: 'res-espera',   status: 'LISTA_ESPERA', enrolledAt: new Date('2026-06-15T10:00:00Z') }),
    ];
    expect(primeroEnEspera(inscripciones)).toBe('res-espera');
  });
});

// ---------------------------------------------------------------------------
// seSolapan — detección de solape de horario
// ---------------------------------------------------------------------------

describe('seSolapan', () => {
  const base = { startsAt: new Date('2026-06-20T10:00:00Z'), endsAt: new Date('2026-06-20T11:00:00Z') };

  it('detecta solape total (misma hora)', () => {
    expect(seSolapan(base, base)).toBe(true);
  });

  it('detecta solape parcial (b empieza dentro de a)', () => {
    const b = { startsAt: new Date('2026-06-20T10:30:00Z'), endsAt: new Date('2026-06-20T11:30:00Z') };
    expect(seSolapan(base, b)).toBe(true);
  });

  it('detecta solape parcial (b contiene a)', () => {
    const b = { startsAt: new Date('2026-06-20T09:00:00Z'), endsAt: new Date('2026-06-20T12:00:00Z') };
    expect(seSolapan(base, b)).toBe(true);
  });

  it('no detecta solape cuando b es posterior (contiguo)', () => {
    const b = { startsAt: new Date('2026-06-20T11:00:00Z'), endsAt: new Date('2026-06-20T12:00:00Z') };
    expect(seSolapan(base, b)).toBe(false);
  });

  it('no detecta solape cuando b es anterior (contiguo)', () => {
    const b = { startsAt: new Date('2026-06-20T09:00:00Z'), endsAt: new Date('2026-06-20T10:00:00Z') };
    expect(seSolapan(base, b)).toBe(false);
  });

  it('no detecta solape cuando b es completamente posterior', () => {
    const b = { startsAt: new Date('2026-06-20T12:00:00Z'), endsAt: new Date('2026-06-20T13:00:00Z') };
    expect(seSolapan(base, b)).toBe(false);
  });

  it('no detecta solape en días distintos', () => {
    const b = { startsAt: new Date('2026-06-21T10:00:00Z'), endsAt: new Date('2026-06-21T11:00:00Z') };
    expect(seSolapan(base, b)).toBe(false);
  });

  it('es simétrica: seSolapan(a,b) === seSolapan(b,a)', () => {
    const b = { startsAt: new Date('2026-06-20T10:30:00Z'), endsAt: new Date('2026-06-20T11:30:00Z') };
    expect(seSolapan(base, b)).toBe(seSolapan(b, base));
  });
});

// ---------------------------------------------------------------------------
// sesionesConSolape — validación de horario de un residente
// ---------------------------------------------------------------------------

describe('sesionesConSolape', () => {
  const candidata = { startsAt: new Date('2026-06-20T10:00:00Z'), endsAt: new Date('2026-06-20T11:00:00Z') };

  it('devuelve array vacío si no hay sesiones actuales', () => {
    expect(sesionesConSolape(candidata, [])).toHaveLength(0);
  });

  it('devuelve array vacío si ninguna sesión se solapa', () => {
    const actuales = [
      { id: 's1', startsAt: new Date('2026-06-20T08:00:00Z'), endsAt: new Date('2026-06-20T09:00:00Z') },
      { id: 's2', startsAt: new Date('2026-06-20T11:00:00Z'), endsAt: new Date('2026-06-20T12:00:00Z') },
    ];
    expect(sesionesConSolape(candidata, actuales)).toHaveLength(0);
  });

  it('detecta una sesión con solape', () => {
    const actuales = [
      { id: 's1', startsAt: new Date('2026-06-20T10:30:00Z'), endsAt: new Date('2026-06-20T11:30:00Z') },
      { id: 's2', startsAt: new Date('2026-06-20T12:00:00Z'), endsAt: new Date('2026-06-20T13:00:00Z') },
    ];
    const solapadas = sesionesConSolape(candidata, actuales);
    expect(solapadas).toHaveLength(1);
    expect(solapadas[0]?.id).toBe('s1');
  });

  it('detecta múltiples sesiones con solape', () => {
    const actuales = [
      { id: 's1', startsAt: new Date('2026-06-20T09:30:00Z'), endsAt: new Date('2026-06-20T10:30:00Z') },
      { id: 's2', startsAt: new Date('2026-06-20T10:30:00Z'), endsAt: new Date('2026-06-20T11:30:00Z') },
    ];
    expect(sesionesConSolape(candidata, actuales)).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// canEnroll / canRecord — validación de estado de sesión
// ---------------------------------------------------------------------------

describe('canEnroll', () => {
  it('permite inscripción en sesión PROGRAMADA', () => {
    expect(canEnroll({ status: 'PROGRAMADA' })).toBe(true);
  });

  it('impide inscripción en sesión REALIZADA', () => {
    expect(canEnroll({ status: 'REALIZADA' })).toBe(false);
  });

  it('impide inscripción en sesión CANCELADA', () => {
    expect(canEnroll({ status: 'CANCELADA' })).toBe(false);
  });
});

describe('canRecord', () => {
  it('permite registrar asistencia en sesión PROGRAMADA', () => {
    expect(canRecord({ status: 'PROGRAMADA' })).toBe(true);
  });

  it('permite registrar asistencia en sesión REALIZADA', () => {
    expect(canRecord({ status: 'REALIZADA' })).toBe(true);
  });

  it('impide registrar asistencia en sesión CANCELADA', () => {
    expect(canRecord({ status: 'CANCELADA' })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// estadoInscripcion — estado al inscribir
// ---------------------------------------------------------------------------

describe('estadoInscripcion', () => {
  it('devuelve INSCRITO si hay plazas', () => {
    const sesion = { maxCapacity: 5 };
    expect(estadoInscripcion(sesion, [])).toBe('INSCRITO');
  });

  it('devuelve LISTA_ESPERA si el aforo está lleno', () => {
    const sesion = { maxCapacity: 1 };
    const inscritos = [makeInscripcion({ status: 'INSCRITO' })];
    expect(estadoInscripcion(sesion, inscritos)).toBe('LISTA_ESPERA');
  });

  it('devuelve INSCRITO si solo hay LISTA_ESPERA (no ocupan plaza)', () => {
    const sesion = { maxCapacity: 2 };
    const inscripciones = [
      makeInscripcion({ id: 'e1', residentId: 'r1', status: 'LISTA_ESPERA' }),
      makeInscripcion({ id: 'e2', residentId: 'r2', status: 'LISTA_ESPERA' }),
    ];
    // 0 INSCRITO, aforo 2 → hay plaza
    expect(estadoInscripcion(sesion, inscripciones)).toBe('INSCRITO');
  });
});
