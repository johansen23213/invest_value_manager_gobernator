// Ocupación — agregación de plazas/camas para el plano y los KPIs de Dirección (UX-19).
// Función pura (sin BD) para poder testearla de forma exhaustiva.
//
// La ocupación se deriva de Resident.bedId (una cama con residente está ocupada);
// BedStatus solo distingue DISPONIBLE | FUERA_SERVICIO (ver ADR-0003). El "aforo"
// (capacity) excluye las camas fuera de servicio que están vacías: una cama de baja
// temporal no cuenta como plaza ofertable, pero si (excepcionalmente) tuviera residente
// se sigue contando como ocupada para no perder a esa persona del cómputo.

/** Una cama tal como llega del árbol de Prisma (solo lo que necesitamos). */
export interface BedNode {
  status: string; // 'DISPONIBLE' | 'FUERA_SERVICIO'
  resident: { id: string } | null;
}

export interface UnitNode {
  id: string;
  name: string;
  beds: BedNode[];
}

export interface CenterNode {
  id: string;
  name: string;
  type: string;
  units: UnitNode[];
}

/** Recuento de camas en cualquier nivel (unidad, centro o global). */
export interface BedCounts {
  total: number; // todas las camas
  occupied: number; // con residente
  free: number; // disponibles y vacías (ofertables ahora)
  outOfService: number; // fuera de servicio
  capacity: number; // aforo = total - (fuera de servicio y vacías)
  /** Tasa de ocupación sobre el aforo (0–1); 0 si no hay aforo. */
  occupancyRate: number;
}

export interface UnitOccupancy extends BedCounts {
  unitId: string;
  unitName: string;
}

export interface CenterOccupancy extends BedCounts {
  centerId: string;
  centerName: string;
  centerType: string;
  units: UnitOccupancy[];
}

export interface OccupancySummary extends BedCounts {
  centers: CenterOccupancy[];
}

function rate(occupied: number, capacity: number): number {
  return capacity > 0 ? occupied / capacity : 0;
}

/** Suma dos recuentos (sin la tasa, que se recalcula al final). */
function addInto(acc: Omit<BedCounts, 'occupancyRate'>, b: Omit<BedCounts, 'occupancyRate'>): void {
  acc.total += b.total;
  acc.occupied += b.occupied;
  acc.free += b.free;
  acc.outOfService += b.outOfService;
  acc.capacity += b.capacity;
}

function countBeds(beds: BedNode[]): Omit<BedCounts, 'occupancyRate'> {
  const counts = { total: 0, occupied: 0, free: 0, outOfService: 0, capacity: 0 };
  for (const bed of beds) {
    const occupied = bed.resident != null;
    const outOfService = bed.status === 'FUERA_SERVICIO';
    counts.total += 1;
    if (occupied) counts.occupied += 1;
    if (outOfService) counts.outOfService += 1;
    // Aforo: la cama cuenta salvo que esté fuera de servicio y vacía.
    if (!outOfService || occupied) counts.capacity += 1;
    if (!outOfService && !occupied) counts.free += 1;
  }
  return counts;
}

/**
 * Agrega el árbol de centros/unidades/camas en un resumen de ocupación con
 * totales globales, por centro y por unidad. Las unidades y centros se ordenan
 * de mayor a menor tasa de ocupación (lo que más conviene mirar primero).
 */
export function summarizeOccupancy(centers: CenterNode[]): OccupancySummary {
  const global = { total: 0, occupied: 0, free: 0, outOfService: 0, capacity: 0 };

  const centerSummaries: CenterOccupancy[] = centers.map((center) => {
    const centerCounts = { total: 0, occupied: 0, free: 0, outOfService: 0, capacity: 0 };

    const units: UnitOccupancy[] = center.units.map((unit) => {
      const c = countBeds(unit.beds);
      addInto(centerCounts, c);
      return {
        unitId: unit.id,
        unitName: unit.name,
        ...c,
        occupancyRate: rate(c.occupied, c.capacity),
      };
    });

    addInto(global, centerCounts);
    units.sort((a, b) => b.occupancyRate - a.occupancyRate);

    return {
      centerId: center.id,
      centerName: center.name,
      centerType: center.type,
      ...centerCounts,
      occupancyRate: rate(centerCounts.occupied, centerCounts.capacity),
      units,
    };
  });

  centerSummaries.sort((a, b) => b.occupancyRate - a.occupancyRate);

  return {
    ...global,
    occupancyRate: rate(global.occupied, global.capacity),
    centers: centerSummaries,
  };
}
