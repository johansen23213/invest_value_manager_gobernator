import { prisma } from '@vetlla/db';

// INC-6: health check para probes del proveedor (sin auth, sin datos).
// Responde 200 si la app y la BD contestan; 503 si la BD no responde.
export async function GET() {
  let db: 'ok' | 'error' = 'ok';
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    db = 'error';
  }
  const body = { status: db === 'ok' ? 'ok' : 'degraded', db, ts: new Date().toISOString() };
  return Response.json(body, { status: db === 'ok' ? 200 : 503 });
}
