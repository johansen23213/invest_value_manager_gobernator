/**
 * prompts/ — Plantillas de prompt versionadas (es-ES / ca-ES) para las 2 features
 * estrella del copiloto. ESQUELETOS del Slice 1: el `system` está redactado, pero la
 * composición con datos reales/herramientas se afina al cablear las features.
 *
 * Principio transversal en TODAS las plantillas: "propones, el humano confirma". El
 * modelo extrae/redacta borradores; nunca decide ni persiste (CLAUDE.md, ADR-0010).
 *
 * Versionado: cada plantilla lleva `id` con versión (p. ej. `careRecordExtraction.v1`)
 * para trazar en `AuditLog` qué prompt generó cada propuesta y poder evolucionarlas.
 */

/** Locales soportados por el producto. */
export type Locale = 'es-ES' | 'ca-ES';

export const SUPPORTED_LOCALES: Locale[] = ['es-ES', 'ca-ES'];
export const DEFAULT_LOCALE: Locale = 'es-ES';

/** Una plantilla de prompt: id versionado + system por locale. */
export interface PromptTemplate {
  id: string;
  /** Texto de sistema por locale. */
  system: Record<Locale, string>;
}

/** Cláusula común "humano en el bucle" por locale, reutilizada en las plantillas. */
const HUMAN_IN_THE_LOOP: Record<Locale, string> = {
  'es-ES':
    'IMPORTANTE: solo PROPONES un borrador. No decides ni guardas nada; un profesional ' +
    'humano revisa y confirma antes de persistir. No inventes datos: si falta información, ' +
    'márcala como pendiente.',
  'ca-ES':
    'IMPORTANT: només PROPOSES un esborrany. No decideixes ni deses res; un professional ' +
    'humà revisa i confirma abans de persistir. No inventis dades: si falta informació, ' +
    'marca-la com a pendent.',
};

/**
 * Feature 1 — Lenguaje natural → `CareRecord` estructurado.
 * Extracción barata (tier `extraction`).
 */
export const careRecordExtractionV1: PromptTemplate = {
  id: 'careRecordExtraction.v1',
  system: {
    'es-ES':
      'Eres un asistente que convierte notas de atención (voz/texto) de auxiliares de ' +
      'una residencia en un registro de atención (CareRecord) estructurado. Identifica el ' +
      'tipo (CONSTANTES, ABVD, DEPOSICION, INGESTA, INCIDENCIA) y extrae los valores ' +
      'medibles. Usa las herramientas tipadas para proponer el registro. ' +
      HUMAN_IN_THE_LOOP['es-ES'],
    'ca-ES':
      "Ets un assistent que converteix notes d'atenció (veu/text) d'auxiliars d'una " +
      "residència en un registre d'atenció (CareRecord) estructurat. Identifica el tipus " +
      '(CONSTANTES, ABVD, DEPOSICION, INGESTA, INCIDENCIA) i extreu els valors mesurables. ' +
      'Fes servir les eines tipades per proposar el registre. ' +
      HUMAN_IN_THE_LOOP['ca-ES'],
  },
};

/**
 * Feature 2 — Borrador de PIA/PAI.
 * Razonamiento (tier `reasoning`).
 */
export const carePlanDraftV1: PromptTemplate = {
  id: 'carePlanDraft.v1',
  system: {
    'es-ES':
      'Eres un asistente que redacta un borrador de Plan Individualizado de Atención ' +
      '(PIA/PAI) a partir del expediente del residente (datos, dependencia, escalas, ' +
      'diagnósticos). Propón un título y objetivos concretos, medibles y centrados en la ' +
      'persona. Usa las herramientas tipadas para proponer el plan. ' +
      HUMAN_IN_THE_LOOP['es-ES'],
    'ca-ES':
      "Ets un assistent que redacta un esborrany de Pla Individualitzat d'Atenció " +
      "(PIA/PAI) a partir de l'expedient del resident (dades, dependència, escales, " +
      'diagnòstics). Proposa un títol i objectius concrets, mesurables i centrats en la ' +
      'persona. Fes servir les eines tipades per proposar el pla. ' +
      HUMAN_IN_THE_LOOP['ca-ES'],
  },
};

/** Todas las plantillas versionadas, indexadas por id. */
export const PROMPT_TEMPLATES = {
  [careRecordExtractionV1.id]: careRecordExtractionV1,
  [carePlanDraftV1.id]: carePlanDraftV1,
} as const;

/** Normaliza un locale arbitrario al soportado más cercano (cae a `DEFAULT_LOCALE`). */
export function resolveLocale(locale: string | undefined): Locale {
  if (!locale) return DEFAULT_LOCALE;
  const lower = locale.toLowerCase();
  if (lower.startsWith('ca')) return 'ca-ES';
  if (lower.startsWith('es')) return 'es-ES';
  return DEFAULT_LOCALE;
}

/**
 * Devuelve el texto de sistema de una plantilla para un locale dado. Función para
 * seleccionar plantilla por locale (la pide la consigna del Slice 1).
 */
export function getSystemPrompt(template: PromptTemplate, locale: string | undefined): string {
  return template.system[resolveLocale(locale)];
}
