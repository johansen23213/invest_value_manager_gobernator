import { NextResponse, type NextRequest } from 'next/server';

/**
 * Middleware mínimo: inyecta el pathname actual como header x-pathname para
 * que el AppLayout server component pueda determinar el enlace activo en la nav
 * sin necesidad de un client component adicional.
 *
 * Importante: headers() en un Server Component lee los headers de la PETICIÓN,
 * por eso hay que reenviar la request con headers modificados (no basta con
 * setearlos en la respuesta).
 *
 * No afecta a la lógica de autenticación (Auth.js gestiona sus propias rutas).
 */
export function middleware(request: NextRequest) {
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-pathname', request.nextUrl.pathname);
  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  // Excluir rutas de Next.js internals y archivos estáticos.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
