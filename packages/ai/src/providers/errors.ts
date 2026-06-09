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
