// Observabilidad mínima viable (INC-6): logs estructurados JSON, SIN PII.
//
// Regla de oro (RGPD art. 9, datos de salud): a los logs NUNCA van nombres,
// emails, diagnósticos ni contenido clínico. Se loguean identificadores
// internos (ids opacos), rutas, códigos y duraciones. Además de la disciplina
// en el punto de llamada, `redactFields` actúa de cinturón de seguridad:
// cualquier clave sospechosa se sustituye por [REDACTED].
//
// Correlation ID (OPS-A10, auditoría 2026-06-14):
//   Cada request recibe un `x-request-id` (generado en el middleware si el
//   cliente no lo envía). El ID se propaga al contexto tRPC y se incluye en
//   cada línea de log, lo que permite reconstruir la cadena de eventos de una
//   petición concreta durante un incidente. NUNCA contiene PII.

type LogLevel = 'info' | 'warn' | 'error';

export type LogFields = Record<string, string | number | boolean | null | undefined>;

/** Claves que jamás deben aparecer en un log con su valor en claro. */
const FORBIDDEN_KEY_PATTERN =
  /(name|email|password|phone|address|birth|national|dni|nie|diagnos|allergy|notes|summary|payload|token|secret)/i;

export function redactFields(fields: LogFields): LogFields {
  const out: LogFields = {};
  for (const [key, value] of Object.entries(fields)) {
    out[key] = FORBIDDEN_KEY_PATTERN.test(key) && value != null ? '[REDACTED]' : value;
  }
  return out;
}

function emit(
  level: LogLevel,
  event: string,
  fields: LogFields = {},
  requestId?: string,
): void {
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    event,
    // requestId es el correlation ID de la petición HTTP. Nunca contiene PII.
    ...(requestId != null ? { requestId } : {}),
    ...redactFields(fields),
  });
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

/** Logger base — sin contexto de request. Útil en workers, scripts y módulos
 *  que no tienen acceso al request. Para requests HTTP prefiere `requestLogger`. */
export const logger = {
  info: (event: string, fields?: LogFields) => emit('info', event, fields),
  warn: (event: string, fields?: LogFields) => emit('warn', event, fields),
  error: (event: string, fields?: LogFields) => emit('error', event, fields),
};

/**
 * Crea un logger vinculado a un requestId (correlation ID).
 * Todas las llamadas incluyen el ID en el JSON, lo que permite correlacionar
 * las líneas de log de una misma petición HTTP.
 *
 * Uso típico en el contexto tRPC:
 *   const log = requestLogger(requestId);
 *   log.warn('trpc.slow', { path, durationMs });
 */
export function requestLogger(requestId: string) {
  return {
    info: (event: string, fields?: LogFields) => emit('info', event, fields, requestId),
    warn: (event: string, fields?: LogFields) => emit('warn', event, fields, requestId),
    error: (event: string, fields?: LogFields) => emit('error', event, fields, requestId),
  };
}

/**
 * Genera un UUID v4 simple usando Web Crypto (disponible en Edge Runtime y
 * Node.js 18+). Usado por el middleware para crear un `x-request-id` cuando
 * el cliente no lo proporciona.
 */
export function generateRequestId(): string {
  // crypto.randomUUID() es isomórfico: disponible en Node ≥18 y en browsers/Edge.
  return crypto.randomUUID();
}
