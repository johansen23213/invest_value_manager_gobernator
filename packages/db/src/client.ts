import { PrismaClient } from '@prisma/client';

// Singleton para evitar múltiples instancias en desarrollo (hot reload de Next).
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

// El RUNTIME de la app (forTenant/asPlatformAdmin) conecta como el ROL DE APP no
// propietario (APP_DATABASE_URL) para que RLS se enforce de verdad (ADR-0014):
// Postgres ignora RLS para superusuarios, así que la app nunca debe conectar como
// el rol propietario/superusuario. Las migraciones/seed siguen usando DATABASE_URL
// (owner) vía la datasource de Prisma. Fallback a DATABASE_URL donde no haya rol de
// app aún (degradación, no rotura) — p. ej. en local, donde el rol es owner NO
// superusuario y FORCE RLS ya aplica.
const runtimeDatabaseUrl = process.env.APP_DATABASE_URL ?? process.env.DATABASE_URL;

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    ...(runtimeDatabaseUrl ? { datasourceUrl: runtimeDatabaseUrl } : {}),
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
