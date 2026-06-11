/**
 * privacy.ts — Minimización + seudonimización de PII antes de enviar al modelo.
 *
 * Materializa el principio RGPD/AI-Act de Vetlla: "nada de PII de salud innecesaria
 * sale al modelo" (CLAUDE.md, ADR-0010). Antes de mandar texto a un proveedor de
 * inferencia, tokenizamos identificadores directos (nombre, DNI/NIE, teléfono, email,
 * dirección…) por tokens estables tipo `[[PERSONA_1]]`, `[[DNI_1]]`. El modelo razona
 * sobre los tokens; al recibir su salida, la *rehidratamos* a los valores reales.
 *
 * Diseño:
 * - Funciones PURAS y deterministas (sin estado global) → fácilmente testeables.
 * - Tokens ESTABLES: el mismo valor obtiene el mismo token dentro de una redacción
 *   (p. ej. el nombre repetido → siempre `[[PERSONA_1]]`).
 * - IDEMPOTENTE: redactar dos veces la misma entrada produce el mismo resultado.
 *
 * Nota de alcance: detección por reglas (regex + listas). Suficiente para el Slice 1 y
 * para identificadores estructurados (DNI/NIE, teléfono, email). Para nombres y
 * direcciones de texto libre, el llamante debe pasar los valores conocidos del
 * expediente (`knownNames`, `knownAddresses`) — más fiable que adivinar.
 */

/** Categorías de identificador directo que tokenizamos. */
export type PiiCategory = 'PERSONA' | 'DNI' | 'TELEFONO' | 'EMAIL' | 'DIRECCION';

/** Una entrada del mapa de seudonimización: token ↔ valor original. */
export interface PiiMapEntry {
  token: string;
  value: string;
  category: PiiCategory;
}

/** Resultado de redactar: texto seudonimizado + mapa para rehidratar. */
export interface RedactionResult {
  redacted: string;
  map: PiiMapEntry[];
}

/** Valores conocidos del expediente que el llamante quiere proteger explícitamente. */
export interface KnownIdentifiers {
  /** Nombres/apellidos conocidos del residente y contactos. */
  names?: string[];
  /** Direcciones conocidas. */
  addresses?: string[];
}

/**
 * Patrones de identificadores estructurados (España).
 * - DNI: 8 dígitos + letra. NIE: X/Y/Z + 7 dígitos + letra.
 * - Teléfono: fijos/móviles ES, con prefijo +34 opcional.
 * - Email: patrón estándar.
 *
 * El orden importa: EMAIL antes que TELEFONO (un email puede contener dígitos), y
 * DNI/NIE antes que TELEFONO (para no comerse las letras).
 */
const PATTERNS: { category: PiiCategory; regex: RegExp }[] = [
  {
    category: 'EMAIL',
    regex: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
  },
  {
    category: 'DNI',
    // NIE (XYZ + 7 dígitos + letra) o DNI (8 dígitos + letra).
    regex: /\b(?:[XYZxyz]-?\d{7}-?[A-Za-z]|\d{8}-?[A-Za-z])\b/g,
  },
  {
    category: 'TELEFONO',
    // +34 opcional, luego 9 dígitos que empiezan por 6/7/8/9, con separadores opcionales.
    regex: /(?:\+34[\s-]?)?\b[6789]\d{2}[\s-]?\d{2}[\s-]?\d{2}[\s-]?\d{2}\b/g,
  },
];

/** Escapa un string para usarlo literal dentro de un RegExp. */
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Acumulador de tokens por categoría. Garantiza estabilidad (mismo valor → mismo
 * token) y numeración incremental por categoría (`[[DNI_1]]`, `[[DNI_2]]`…).
 */
class TokenAssigner {
  private readonly counters = new Map<PiiCategory, number>();
  private readonly byValue = new Map<string, PiiMapEntry>();

  /** Devuelve (creando si hace falta) el token estable para un valor+categoría. */
  tokenFor(value: string, category: PiiCategory): string {
    const key = `${category}::${value}`;
    const existing = this.byValue.get(key);
    if (existing) return existing.token;

    const next = (this.counters.get(category) ?? 0) + 1;
    this.counters.set(category, next);
    const token = `[[${category}_${next}]]`;
    this.byValue.set(key, { token, value, category });
    return token;
  }

  /** Mapa final, en orden de aparición (estable). */
  entries(): PiiMapEntry[] {
    return [...this.byValue.values()];
  }
}

/**
 * Seudonimiza el texto: sustituye identificadores directos por tokens estables.
 *
 * Pasos:
 * 1. Identificadores conocidos del expediente (names/addresses) — más largos primero
 *    para evitar sustituciones parciales.
 * 2. Identificadores estructurados por regex (email, DNI/NIE, teléfono).
 *
 * Devuelve `{ redacted, map }`. Es idempotente: como los tokens ya no casan con los
 * patrones de PII, volver a redactar el resultado no cambia nada.
 */
export function redactPii(text: string, known: KnownIdentifiers = {}): RedactionResult {
  const assigner = new TokenAssigner();
  let redacted = text;

  // 1) Identificadores conocidos (texto libre): nombres y direcciones.
  const knownList: { value: string; category: PiiCategory }[] = [
    ...(known.names ?? []).map((value) => ({ value, category: 'PERSONA' as const })),
    ...(known.addresses ?? []).map((value) => ({ value, category: 'DIRECCION' as const })),
  ]
    .map((k) => ({ ...k, value: k.value.trim() }))
    .filter((k) => k.value.length > 0)
    // Más largos primero: evita que "Ana" reemplace dentro de "Ana María".
    .sort((a, b) => b.value.length - a.value.length);

  for (const { value, category } of knownList) {
    // Solo tokeniza si el valor aparece realmente (mantiene idempotencia: un valor ya
    // sustituido no vuelve a generar entrada de mapa).
    const matcher = new RegExp(escapeRegExp(value), 'g');
    if (!matcher.test(redacted)) continue;
    // Sustitución literal, sin \b: los nombres/direcciones pueden contener espacios.
    redacted = redacted.replace(
      new RegExp(escapeRegExp(value), 'g'),
      assigner.tokenFor(value, category),
    );
  }

  // 2) Identificadores estructurados por patrón.
  for (const { category, regex } of PATTERNS) {
    redacted = redacted.replace(new RegExp(regex.source, regex.flags), (match) =>
      assigner.tokenFor(match, category),
    );
  }

  return { redacted, map: assigner.entries() };
}

/**
 * Rehidrata la salida del modelo: sustituye los tokens por sus valores originales.
 * Reemplaza solo tokens presentes en el mapa (no inventa). Idempotente si no hay
 * tokens; seguro aunque el modelo repita un token varias veces.
 */
export function rehydrate(text: string, map: PiiMapEntry[]): string {
  let result = text;
  for (const { token, value } of map) {
    result = result.replace(new RegExp(escapeRegExp(token), 'g'), value);
  }
  return result;
}
