import { describe, expect, it } from 'vitest';
import { summarizeOccupancy, type CenterNode } from './occupancy';

const r = (id: string) => ({ id });

function fixture(): CenterNode[] {
  return [
    {
      id: 'c1',
      name: 'Residencia Los Olivos',
      type: 'RESIDENCIA',
      units: [
        {
          id: 'u-a',
          name: 'Unidad A',
          beds: [
            { status: 'DISPONIBLE', resident: r('p1') },
            { status: 'DISPONIBLE', resident: r('p2') },
            { status: 'DISPONIBLE', resident: null }, // libre
          ],
        },
        {
          id: 'u-b',
          name: 'Unidad B',
          beds: [
            { status: 'DISPONIBLE', resident: r('p3') },
            { status: 'FUERA_SERVICIO', resident: null }, // fuera de servicio y vacía
          ],
        },
      ],
    },
  ];
}

describe('summarizeOccupancy', () => {
  it('cuenta total/ocupadas/libres/fuera-de-servicio y aforo a nivel global', () => {
    const s = summarizeOccupancy(fixture());
    expect(s.total).toBe(5);
    expect(s.occupied).toBe(3);
    expect(s.free).toBe(1);
    expect(s.outOfService).toBe(1);
    // Aforo excluye la cama fuera de servicio vacía: 5 - 1 = 4.
    expect(s.capacity).toBe(4);
    expect(s.occupancyRate).toBeCloseTo(3 / 4);
  });

  it('calcula la ocupación por unidad', () => {
    const s = summarizeOccupancy(fixture());
    const unitA = s.centers[0]!.units.find((u) => u.unitId === 'u-a')!;
    const unitB = s.centers[0]!.units.find((u) => u.unitId === 'u-b')!;

    expect(unitA).toMatchObject({ total: 3, occupied: 2, free: 1, outOfService: 0, capacity: 3 });
    expect(unitA.occupancyRate).toBeCloseTo(2 / 3);

    expect(unitB).toMatchObject({ total: 2, occupied: 1, free: 0, outOfService: 1, capacity: 1 });
    expect(unitB.occupancyRate).toBe(1);
  });

  it('ordena las unidades de mayor a menor ocupación', () => {
    const s = summarizeOccupancy(fixture());
    const rates = s.centers[0]!.units.map((u) => u.occupancyRate);
    expect(rates).toEqual([...rates].sort((a, b) => b - a));
    expect(s.centers[0]!.units[0]!.unitId).toBe('u-b'); // 100% antes que 67%
  });

  it('una cama fuera de servicio CON residente cuenta como ocupada y en el aforo', () => {
    const s = summarizeOccupancy([
      {
        id: 'c',
        name: 'C',
        type: 'RESIDENCIA',
        units: [{ id: 'u', name: 'U', beds: [{ status: 'FUERA_SERVICIO', resident: r('x') }] }],
      },
    ]);
    expect(s.occupied).toBe(1);
    expect(s.outOfService).toBe(1);
    expect(s.capacity).toBe(1);
    expect(s.occupancyRate).toBe(1);
  });

  it('un centro sin unidades/camas tiene tasa 0 y no rompe', () => {
    const s = summarizeOccupancy([{ id: 'c', name: 'Vacío', type: 'CENTRO_DIA', units: [] }]);
    expect(s.total).toBe(0);
    expect(s.capacity).toBe(0);
    expect(s.occupancyRate).toBe(0);
    expect(s.centers[0]!.occupancyRate).toBe(0);
  });

  it('ordena los centros de mayor a menor ocupación', () => {
    const s = summarizeOccupancy([
      { id: 'low', name: 'Bajo', type: 'RESIDENCIA', units: [{ id: 'u1', name: 'U', beds: [{ status: 'DISPONIBLE', resident: null }] }] },
      { id: 'full', name: 'Lleno', type: 'RESIDENCIA', units: [{ id: 'u2', name: 'U', beds: [{ status: 'DISPONIBLE', resident: r('p') }] }] },
    ]);
    expect(s.centers.map((c) => c.centerId)).toEqual(['full', 'low']);
  });
});
