/**
 * errors.ts — Errores comunes a los adaptadores de proveedor.
 */

/**
 * Se lanza cuando se intenta usar un adaptador real que aún no está cableado
 * (esqueletos del Slice 1) o cuando faltan credenciales/configuración.
 */
export class NotImplementedError extends Error {
  constructor(provider: string, detail?: string) {
    super(
      `[@vetlla/ai] El proveedor "${provider}" aún no está implementado en este slice` +
        (detail ? `: ${detail}` : '. Usa AI_PROVIDER=stub para dev/tests.'),
    );
    this.name = 'NotImplementedError';
  }
}

/**
 * Falta configuración obligatoria para usar un adaptador real (p. ej. la base URL del
 * endpoint OpenAI-compatible). Mensaje claro y accionable; nunca incluye secretos.
 */
export class ProviderConfigError extends Error {
  constructor(provider: string, detail: string) {
    super(`[@vetlla/ai] Configuración inválida del proveedor "${provider}": ${detail}`);
    this.name = 'ProviderConfigError';
  }
}

/**
 * Una petición HTTP al motor de modelo falló: respuesta no-2xx, timeout o error de red.
 * Lleva el `status` (si lo hay) y un cuerpo de respuesta RECORTADO para diagnóstico.
 * No registra cabeceras ni credenciales (nunca incluir el `Authorization`).
 */
export class ProviderRequestError extends Error {
  readonly provider: string;
  readonly status?: number;

  constructor(provider: string, detail: string, options: { status?: number; cause?: unknown } = {}) {
    super(`[@vetlla/ai] Error de petición al proveedor "${provider}": ${detail}`, {
      cause: options.cause,
    });
    this.name = 'ProviderRequestError';
    this.provider = provider;
    this.status = options.status;
  }
}
