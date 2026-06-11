import { describe, expect, it } from 'vitest';
import { mergeCareRecord } from '../src/care-sync';

const T0 = '2026-06-07T08:00:00.000Z';
const T1 = '2026-06-07T09:00:00.000Z';

describe('mergeCareRecord', () => {
  it('añade campos nuevos sin conflicto', () => {
    const res = mergeCareRecord(
      { payload: { tension: '120/80' }, fieldTimestamps: { tension: T0 } },
      { payload: { fc: 72 }, fieldTimestamps: { fc: T1 } },
    );
    expect(res.payload).toEqual({ tension: '120/80', fc: 72 });
    expect(res.conflicts).toHaveLength(0);
  });

  it('el valor más reciente gana (cliente) y registra conflicto', () => {
    const res = mergeCareRecord(
      { payload: { fc: 70 }, fieldTimestamps: { fc: T0 } },
      { payload: { fc: 90 }, fieldTimestamps: { fc: T1 } },
    );
    expect(res.payload.fc).toBe(90);
    expect(res.conflicts).toEqual([
      { field: 'fc', serverValue: 70, clientValue: 90, winner: 'CLIENT' },
    ]);
  });

  it('el servidor gana si su timestamp es más reciente', () => {
    const res = mergeCareRecord(
      { payload: { fc: 70 }, fieldTimestamps: { fc: T1 } },
      { payload: { fc: 90 }, fieldTimestamps: { fc: T0 } },
    );
    expect(res.payload.fc).toBe(70);
    expect(res.conflicts).toEqual([
      { field: 'fc', serverValue: 70, clientValue: 90, winner: 'SERVER' },
    ]);
  });

  it('mismo timestamp y mismo valor: sin conflicto', () => {
    const res = mergeCareRecord(
      { payload: { fc: 70 }, fieldTimestamps: { fc: T0 } },
      { payload: { fc: 70 }, fieldTimestamps: { fc: T0 } },
    );
    expect(res.conflicts).toHaveLength(0);
  });

  it('reaplicar el mismo registro es idempotente (sin cambios ni conflictos)', () => {
    const state = { payload: { fc: 72, tension: '120/80' }, fieldTimestamps: { fc: T0, tension: T0 } };
    const res = mergeCareRecord(state, state);
    expect(res.payload).toEqual(state.payload);
    expect(res.conflicts).toHaveLength(0);
  });
});
