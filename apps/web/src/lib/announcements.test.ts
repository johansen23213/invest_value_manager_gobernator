/**
 * Tests de la lógica pura de comunicados (lib/announcements.ts).
 * Sin BD, sin dependencias de red.
 */
import { describe, expect, it } from 'vitest';
import {
  computeRecipients,
  computeAnnouncementStats,
  validateAnnouncementAudience,
  type FamilyLinkMin,
  type ResidentMin,
} from './announcements';

// ---------------------------------------------------------------------------
// Fixtures reutilizables
// ---------------------------------------------------------------------------

/** 2 unidades, 3 residentes, 4 familiares. */
const UNIT_A = 'unit-a';
const UNIT_B = 'unit-b';

const RESIDENT_1 = 'res-1'; // cama en UNIT_A
const RESIDENT_2 = 'res-2'; // cama en UNIT_A
const RESIDENT_3 = 'res-3'; // cama en UNIT_B
const RESIDENT_4 = 'res-4'; // sin cama (bedId null)

const FAM_1 = 'user-fam-1'; // vinculado a RESIDENT_1
const FAM_2 = 'user-fam-2'; // vinculado a RESIDENT_2
const FAM_3 = 'user-fam-3'; // vinculado a RESIDENT_3
const FAM_4 = 'user-fam-4'; // vinculado a RESIDENT_1 y RESIDENT_3 (dos residentes)

const familyLinks: FamilyLinkMin[] = [
  { userId: FAM_1, residentId: RESIDENT_1 },
  { userId: FAM_2, residentId: RESIDENT_2 },
  { userId: FAM_3, residentId: RESIDENT_3 },
  { userId: FAM_4, residentId: RESIDENT_1 },
  { userId: FAM_4, residentId: RESIDENT_3 },
];

const residents: ResidentMin[] = [
  { id: RESIDENT_1, bedId: 'bed-1a', bed: { unitId: UNIT_A } },
  { id: RESIDENT_2, bedId: 'bed-2a', bed: { unitId: UNIT_A } },
  { id: RESIDENT_3, bedId: 'bed-3b', bed: { unitId: UNIT_B } },
  { id: RESIDENT_4, bedId: null, bed: null }, // sin cama → sin unidad
];

// ---------------------------------------------------------------------------
// computeRecipients — TODO_EL_CENTRO
// ---------------------------------------------------------------------------

describe('computeRecipients — TODO_EL_CENTRO', () => {
  it('devuelve todos los userId únicos del tenant', () => {
    const result = computeRecipients(
      { audience: 'TODO_EL_CENTRO' },
      familyLinks,
      residents,
    );
    // FAM_4 aparece dos veces en familyLinks pero debe deduplicarse
    expect(result.sort()).toEqual([FAM_1, FAM_2, FAM_3, FAM_4].sort());
  });

  it('devuelve array vacío si no hay familiares', () => {
    const result = computeRecipients(
      { audience: 'TODO_EL_CENTRO' },
      [],
      residents,
    );
    expect(result).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// computeRecipients — POR_UNIDAD
// ---------------------------------------------------------------------------

describe('computeRecipients — POR_UNIDAD', () => {
  it('devuelve familiares de residentes en UNIT_A', () => {
    const result = computeRecipients(
      { audience: 'POR_UNIDAD', unitId: UNIT_A },
      familyLinks,
      residents,
    );
    // RESIDENT_1 → FAM_1, FAM_4; RESIDENT_2 → FAM_2
    expect(result.sort()).toEqual([FAM_1, FAM_2, FAM_4].sort());
  });

  it('devuelve familiares de residentes en UNIT_B', () => {
    const result = computeRecipients(
      { audience: 'POR_UNIDAD', unitId: UNIT_B },
      familyLinks,
      residents,
    );
    // RESIDENT_3 → FAM_3, FAM_4
    expect(result.sort()).toEqual([FAM_3, FAM_4].sort());
  });

  it('devuelve array vacío si unitId no existe', () => {
    const result = computeRecipients(
      { audience: 'POR_UNIDAD', unitId: 'unit-inexistente' },
      familyLinks,
      residents,
    );
    expect(result).toHaveLength(0);
  });

  it('devuelve array vacío si unitId es null', () => {
    const result = computeRecipients(
      { audience: 'POR_UNIDAD', unitId: null },
      familyLinks,
      residents,
    );
    expect(result).toHaveLength(0);
  });

  it('no incluye familiares de residentes sin cama (bedId null)', () => {
    // RESIDENT_4 no tiene cama: no debe aparecer en ninguna unidad
    const specialLinks: FamilyLinkMin[] = [
      ...familyLinks,
      { userId: 'fam-sin-cama', residentId: RESIDENT_4 },
    ];
    const result = computeRecipients(
      { audience: 'POR_UNIDAD', unitId: UNIT_A },
      specialLinks,
      residents,
    );
    expect(result).not.toContain('fam-sin-cama');
  });

  it('deduplica si un familiar está en múltiples residentes de la misma unidad', () => {
    // FAM_4 vinculado a RESIDENT_1 y RESIDENT_3 pero ambos en UNIT_A
    const extraLinks: FamilyLinkMin[] = [
      { userId: FAM_4, residentId: RESIDENT_1 }, // UNIT_A
      { userId: FAM_4, residentId: RESIDENT_2 }, // UNIT_A también
    ];
    const result = computeRecipients(
      { audience: 'POR_UNIDAD', unitId: UNIT_A },
      extraLinks,
      residents,
    );
    // FAM_4 debe aparecer solo una vez
    expect(result.filter((u) => u === FAM_4)).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// computeRecipients — RESIDENTE
// ---------------------------------------------------------------------------

describe('computeRecipients — RESIDENTE', () => {
  it('devuelve todos los familiares vinculados a ese residente', () => {
    // RESIDENT_1 tiene FAM_1 y FAM_4
    const result = computeRecipients(
      { audience: 'RESIDENTE', residentId: RESIDENT_1 },
      familyLinks,
      residents,
    );
    expect(result.sort()).toEqual([FAM_1, FAM_4].sort());
  });

  it('devuelve solo el familiar directo de RESIDENT_2', () => {
    const result = computeRecipients(
      { audience: 'RESIDENTE', residentId: RESIDENT_2 },
      familyLinks,
      residents,
    );
    expect(result).toEqual([FAM_2]);
  });

  it('devuelve array vacío si residentId no tiene familiares', () => {
    const result = computeRecipients(
      { audience: 'RESIDENTE', residentId: 'res-sin-familiar' },
      familyLinks,
      residents,
    );
    expect(result).toHaveLength(0);
  });

  it('devuelve array vacío si residentId es null', () => {
    const result = computeRecipients(
      { audience: 'RESIDENTE', residentId: null },
      familyLinks,
      residents,
    );
    expect(result).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// validateAnnouncementAudience
// ---------------------------------------------------------------------------

describe('validateAnnouncementAudience', () => {
  it('TODO_EL_CENTRO sin unitId ni residentId → válido', () => {
    expect(validateAnnouncementAudience('TODO_EL_CENTRO', null, null)).toBeNull();
  });

  it('POR_UNIDAD con unitId → válido', () => {
    expect(validateAnnouncementAudience('POR_UNIDAD', UNIT_A, null)).toBeNull();
  });

  it('POR_UNIDAD sin unitId → error', () => {
    const err = validateAnnouncementAudience('POR_UNIDAD', null, null);
    expect(err).not.toBeNull();
    expect(err).toContain('unitId');
  });

  it('RESIDENTE con residentId → válido', () => {
    expect(validateAnnouncementAudience('RESIDENTE', null, RESIDENT_1)).toBeNull();
  });

  it('RESIDENTE sin residentId → error', () => {
    const err = validateAnnouncementAudience('RESIDENTE', null, null);
    expect(err).not.toBeNull();
    expect(err).toContain('residentId');
  });
});

// ---------------------------------------------------------------------------
// computeAnnouncementStats
// ---------------------------------------------------------------------------

describe('computeAnnouncementStats', () => {
  const now = new Date();

  it('0 destinatarios → readPct y ackPct null', () => {
    const stats = computeAnnouncementStats(0, []);
    expect(stats.readPct).toBeNull();
    expect(stats.ackPct).toBeNull();
    expect(stats.totalRecipients).toBe(0);
  });

  it('todos leídos → readPct = 100', () => {
    const stats = computeAnnouncementStats(2, [
      { readAt: now, acknowledgedAt: null },
      { readAt: now, acknowledgedAt: null },
    ]);
    expect(stats.totalRead).toBe(2);
    expect(stats.readPct).toBe(100);
  });

  it('ninguno leído → readPct = 0', () => {
    const stats = computeAnnouncementStats(3, [
      { readAt: null, acknowledgedAt: null },
    ]);
    expect(stats.readPct).toBe(0);
    expect(stats.totalRead).toBe(0);
  });

  it('calcula correctamente con lectura parcial y acuses', () => {
    const stats = computeAnnouncementStats(4, [
      { readAt: now, acknowledgedAt: now },
      { readAt: now, acknowledgedAt: null },
      { readAt: null, acknowledgedAt: null },
    ]);
    expect(stats.totalRecipients).toBe(4);
    expect(stats.totalRead).toBe(2);
    expect(stats.totalAcknowledged).toBe(1);
    expect(stats.readPct).toBe(50); // 2/4 = 50%
    expect(stats.ackPct).toBe(25);  // 1/4 = 25%
  });

  it('redondea correctamente el porcentaje', () => {
    // 1 de 3 leídos → 33%
    const stats = computeAnnouncementStats(3, [
      { readAt: now, acknowledgedAt: null },
    ]);
    expect(stats.readPct).toBe(33);
  });
});
