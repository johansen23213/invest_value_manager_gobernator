// Observabilidad mínima viable (INC-6): logs estructurados JSON, SIN PII.
//
// Regla de oro (RGPD art. 9, datos de salud): a los logs NUNCA van nombres,
// emails, diagnósticos ni contenido clínico. Se loguean identificadores
// internos (ids opacos), rutas, códigos y duraciones. Además de la disciplina
// en el punto de llamada, `redactFields` actúa de cinturón de seguridad:
// cualquier clave sospechosa se sustituye por [REDACTED].

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

function emit(level: LogLevel, event: string, fields: LogFields = {}): void {
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    event,
    ...redactFields(fields),
  });
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

export const logger = {
  info: (event: string, fields?: LogFields) => emit('info', event, fields),
  warn: (event: string, fields?: LogFields) => emit('warn', event, fields),
  error: (event: string, fields?: LogFields) => emit('error', event, fields),
};
