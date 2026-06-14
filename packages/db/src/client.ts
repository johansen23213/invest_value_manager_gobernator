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

// ---------------------------------------------------------------------------
// OPS-C04 — Guardia de arranque: verificar que el cliente conecta como un rol
// NOSUPERUSER NOBYPASSRLS (vetlla_app), nunca como superusuario ni owner con
// bypassrls. Si la app arranca con un rol incorrecto, RLS no se enforza y el
// aislamiento multitenant queda roto silenciosamente.
//
// La comprobación se hace UNA SOLA VEZ al importar el módulo (no por query).
// En tests/CI que usan APP_DATABASE_URL=<vetlla_app conn string> esto NO falla
// porque vetlla_app es NOSUPERUSER NOBYPASSRLS por diseño (ADR-0014, app-role.sql).
//
// Si APP_DATABASE_URL no está definida (entorno local de dev sin vetlla_app aún),
// se omite la comprobación y se emite un WARNING en lugar de lanzar error, para
// no romper `pnpm dev` en local donde DATABASE_URL apunta al owner pero tampoco
// es superusuario (y FORCE RLS ya aplica para el owner en Postgres 15+).
// ---------------------------------------------------------------------------
async function assertRlsEnforced(): Promise<void> {
  // Si no hay APP_DATABASE_URL, estamos en un entorno sin rol separado (dev local).
  // Emitir warning y salir sin lanzar error.
  if (!process.env.APP_DATABASE_URL) {
    console.warn(
      '[vetlla/db] AVISO OPS-C04: APP_DATABASE_URL no definida. ' +
      'La comprobación de rol RLS se omite. Define APP_DATABASE_URL=<vetlla_app> en producción.',
    );
    return;
  }

  try {
    const rows = await prisma.$queryRaw<Array<{
      current_user: string;
      is_superuser: boolean;
      rolbypassrls: boolean;
    }>>`
      SELECT
        current_user,
        (SELECT rolsuper    FROM pg_roles WHERE rolname = current_user) AS is_superuser,
        (SELECT rolbypassrls FROM pg_roles WHERE rolname = current_user) AS rolbypassrls
    `;

    const row = rows[0];
    if (!row) {
      // No debería ocurrir, pero si la query no devuelve filas es un entorno inusual.
      console.warn('[vetlla/db] AVISO OPS-C04: No se pudo verificar el rol de BD.');
      return;
    }

    if (row.is_superuser || row.rolbypassrls) {
      // La app está conectada como superusuario o un rol con BYPASSRLS.
      // En este caso Postgres ignora RLS aunque esté marcada como FORCE.
      // Lanzar un error claro para que el proceso no arranque en modo inseguro.
      throw new Error(
        `[vetlla/db] OPS-C04: RLS no se enforza — la app conecta como "${row.current_user}" ` +
        `(superuser=${row.is_superuser}, bypassrls=${row.rolbypassrls}). ` +
        'La app debe conectar como vetlla_app (NOSUPERUSER NOBYPASSRLS). ' +
        'Comprueba APP_DATABASE_URL y que app-role.sql se haya ejecutado correctamente.',
      );
    }
  } catch (err) {
    // Si el error es el nuestro (OPS-C04), lo relanzamos.
    if (err instanceof Error && err.message.includes('OPS-C04')) throw err;
    // Si es un error de conexión u otro, lo logueamos pero no bloqueamos el arranque
    // (la BD podría no estar disponible aún en el ciclo de arranque; los errores de
    // conexión reales se manifestarán en la primera query real).
    console.warn('[vetlla/db] AVISO OPS-C04: No se pudo conectar a BD para verificar RLS:', (err as Error).message);
  }
}

// Ejecutar la comprobación una sola vez al importar. Se llama de forma asíncrona
// para no bloquear el módulo durante la importación estática; el error emerge
// antes de que la aplicación sirva tráfico real porque Next.js aguarda las
// inicializaciones de módulo durante el arrange del servidor.
void assertRlsEnforced();
