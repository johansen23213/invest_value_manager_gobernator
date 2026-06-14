import { NextResponse, type NextRequest } from 'next/server';
import { generateRequestId } from '@/server/logger';

/**
 * Middleware de Vetlla — dos responsabilidades:
 *
 * 1. Inyecta `x-pathname` como header de request para que los Server Components
 *    puedan determinar el enlace activo en la nav sin un client component extra.
 *
 * 2. Propaga (o genera) el `x-request-id` (correlation ID):
 *    - Si el cliente o un proxy upstream envía `x-request-id`, se conserva.
 *    - Si no, se genera un UUID v4 nuevo (Web Crypto, sin PII).
 *    El ID se reenvía tanto en los headers de REQUEST (para que el contexto tRPC
 *    lo lea) como en los headers de RESPONSE (para que el cliente lo incluya en
 *    reportes de error). NUNCA contiene datos personales.
 *
 * No afecta a la lógica de autenticación (Auth.js gestiona sus propias rutas).
 */
export function middleware(request: NextRequest) {
  const requestHeaders = new Headers(request.headers);

  // --- 1. Pathname para nav activa ---
  requestHeaders.set('x-pathname', request.nextUrl.pathname);

  // --- 2. Correlation ID (OPS-A10) ---
  const existingId = request.headers.get('x-request-id');
  const requestId = existingId ?? generateRequestId();
  requestHeaders.set('x-request-id', requestId);

  const response = NextResponse.next({ request: { headers: requestHeaders } });

  // Reenviar el ID en la respuesta para facilitar la correlación en el cliente.
  response.headers.set('x-request-id', requestId);

  return response;
}

export const config = {
  // Excluir rutas de Next.js internals y archivos estáticos.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
