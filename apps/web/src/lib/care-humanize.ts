// Humaniza un registro de atención (CareRecord) para el portal de familias (UX-20).
// Convierte el payload estructurado en una frase cercana en castellano, en vez de
// volcar pares clave:valor técnicos. Función pura y testable.

type Payload = Record<string, unknown>;

function str(v: unknown): string | undefined {
  if (v === null || v === undefined || v === '') return undefined;
  return String(v);
}

function intakeMeal(comida: string | undefined): string {
  return comida ? comida.toLowerCase() : 'la comida';
}

/** Devuelve una descripción cercana del registro para la familia. */
export function humanizeCareRecord(type: string, payloadRaw: unknown): string {
  const p: Payload = payloadRaw && typeof payloadRaw === 'object' ? (payloadRaw as Payload) : {};

  switch (type) {
    case 'CONSTANTES': {
      const parts: string[] = [];
      const tension = str(p.tension);
      const temperatura = str(p.temperatura);
      const fc = str(p.fc);
      const sato2 = str(p.sato2);
      if (tension) parts.push(`tensión ${tension}`);
      if (temperatura) parts.push(`temperatura ${temperatura}º`);
      if (fc) parts.push(`pulso ${fc}`);
      if (sato2) parts.push(`saturación ${sato2}%`);
      const detail = parts.length > 0 ? ` (${parts.join(', ')})` : '';
      return `Se le tomaron las constantes${detail}.`;
    }
    case 'INGESTA': {
      const porcentaje = str(p.porcentaje);
      const comida = str(p.comida);
      if (porcentaje !== undefined) {
        const n = Number(porcentaje);
        if (n === 0) return `No comió en ${intakeMeal(comida)}.`;
        if (n >= 100) return `Comió todo en ${intakeMeal(comida)}.`;
        return `Comió el ${porcentaje}% en ${intakeMeal(comida)}.`;
      }
      return comida ? `Tomó ${intakeMeal(comida)}.` : 'Se registró la ingesta.';
    }
    case 'DEPOSICION': {
      const dep = str(p.deposicion);
      if (dep && /^(no|false)$/i.test(dep)) return 'Sin deposición.';
      return 'Hubo deposición con normalidad.';
    }
    case 'INCIDENCIA': {
      const desc = str(p.descripcion);
      return desc ?? 'Se registró una incidencia.';
    }
    case 'ABVD': {
      const actividad = str(p.actividad);
      const nota = str(p.nota);
      return actividad ?? nota ?? 'Se registró su actividad diaria.';
    }
    default: {
      const nota = str(p.nota) ?? str(p.notas) ?? str(p.descripcion);
      return nota ?? 'Nuevo registro de atención.';
    }
  }
}
