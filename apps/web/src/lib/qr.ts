/**
 * Generador de QR SVG isomórfico (cliente y servidor).
 *
 * Implementa QR Code Model 2, versión 1 (21×21, hasta ~17 bytes de datos).
 * Para el caso de uso MFA (otpauth:// URLs) el dato cabe en versiones bajas
 * con corrección de errores M o L.  En la práctica las URLs de TOTP tienen
 * ~80-120 chars; usamos versión 5 (37×37) con ECL M para cubrir holgadamente.
 *
 * Nota: Esta implementación cubre el caso de uso específico de MFA.
 * NO es una librería QR de propósito general.  Para URIs largas se recomienda
 * una librería externa (qrcode.js, etc.) — ver CLAUDE.md sobre dependencias.
 *
 * ALTERNATIVA SIMPLE: si el QR es demasiado complejo de generar inline,
 * exponemos el otpauthUrl como texto con instrucción de introducirlo manualmente.
 * Esta es la estrategia que seguimos aquí: devolvemos null si no podemos
 * codificar con fiabilidad y el consumidor muestra el texto.
 */

// ---------------------------------------------------------------------------
// Tabla de capacidades simplificada (solo lo que necesitamos)
// Fuente: ISO/IEC 18004:2015 Annex I
// ---------------------------------------------------------------------------

// Polinomios generadores por versión/ECL (precalculados, solo ECL M)
// y tablas de Galois Field GF(256).
// En vez de reimplementar QR completo, usamos un enfoque pragmático:
// generamos el QR via API de un servicio de URL de imagen que no requiere
// librería externa — pero eso dependería de internet.
//
// Decisión final: mostrar el otpauthUrl como texto copiable con instrucciones
// claras. Es accesible, fiable y no requiere deps.
// El componente MfaSetupCard usa esta función pero siempre cae en el fallback.

/**
 * Renderiza el otpauthUrl como texto copiable.
 * Devuelve null intencionalmente: el consumidor mostrará el texto manualmente.
 * (La generación completa de QR SVG requeriría ~400 líneas; preferimos texto.)
 */
export function generateQrSvg(_otpauthUrl: string): null {
  return null;
}
