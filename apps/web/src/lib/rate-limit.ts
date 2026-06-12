// Rate limiter en memoria de ventana deslizante (sliding window).
//
// Diseño intencional: implementación en memoria a nivel de módulo Node.js,
// suficiente para proteger endpoints de baja frecuencia (p. ej. checkInByCode)
// en una única instancia de servidor.
//
// LIMITACIÓN DOCUMENTADA (multi-instancia):
//   En un despliegue con múltiples réplicas (varios procesos Node / pods), cada
//   instancia mantiene su propio mapa independiente. Un atacante que distribuya
//   sus peticiones entre réplicas podría superar el umbral efectivo. Para
//   producción con más de una instancia, sustituir por un store compartido (Redis
//   EU / Upstash EU) usando el mismo contrato: checkRateLimit(key) → boolean.
//   Con Rate Limit de 10 intentos/min por usuario y espacio BASE32-8 (~10^12
//   combinaciones), el ataque requeriría miles de réplicas para ser práctico.

/** Entradas del mapa en memoria: timestamps de intentos fallidos. */
interface Bucket {
  attempts: number[]; // timestamps epoch ms de cada intento fallido
}

// Map a nivel de módulo: persiste entre requests en el mismo proceso.
const store = new Map<string, Bucket>();

/**
 * Registra un intento fallido para `key` y devuelve si está dentro del límite.
 *
 * @param key        Identificador único del actor (p. ej. userId o IP).
 * @param maxAttempts Máximo de intentos fallidos permitidos en la ventana.
 * @param windowMs   Duración de la ventana deslizante en milisegundos.
 * @returns `true` si el intento está DENTRO del límite (se permite), `false` si lo supera.
 */
export function checkRateLimit(
  key: string,
  maxAttempts: number,
  windowMs: number,
): boolean {
  const now = Date.now();
  const bucket = store.get(key) ?? { attempts: [] };

  // Descarta intentos más antiguos que la ventana.
  bucket.attempts = bucket.attempts.filter((t) => now - t < windowMs);

  // H-5 — barrido perezoso: si tras la poda el bucket queda vacío, eliminamos
  // la entrada del Map. Sin esto, cada key distinta (checkin:userId) acumula un
  // Bucket vacío permanente en el Map y lo hace crecer de forma monótona en un
  // proceso de vida larga. El delete ocurre tanto si estamos dentro del límite
  // como si no: en ambos casos el intento actual se vuelve a insertar si aplica.
  if (bucket.attempts.length === 0) {
    store.delete(key);
  }

  if (bucket.attempts.length >= maxAttempts) {
    // Sigue bloqueado con intentos dentro de la ventana.
    store.set(key, bucket);
    return false; // límite superado
  }

  bucket.attempts.push(now);
  store.set(key, bucket);
  return true; // dentro del límite
}

/**
 * Devuelve si `key` está actualmente bloqueado sin registrar un nuevo intento.
 * Útil para tests que quieren comprobar el estado sin modificarlo.
 */
export function isRateLimited(key: string, maxAttempts: number, windowMs: number): boolean {
  const now = Date.now();
  const bucket = store.get(key);
  if (!bucket) return false;
  const recent = bucket.attempts.filter((t) => now - t < windowMs);
  return recent.length >= maxAttempts;
}

/** Limpia todas las entradas (solo para tests). */
export function clearRateLimitStore(): void {
  store.clear();
}
