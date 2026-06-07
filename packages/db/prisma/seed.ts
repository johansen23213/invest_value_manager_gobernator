import { PrismaClient, UserRole } from '@prisma/client';
import bcrypt from 'bcryptjs';

// Seed de H0: un tenant demo + un usuario por rol para poder iniciar sesión.
// El seed completo (centros, residentes, registros — §13 del spec) se amplía en H2.
const prisma = new PrismaClient();

const DEMO_PASSWORD = 'vetlla1234';

async function main() {
  const tenant = await prisma.tenant.upsert({
    where: { slug: 'demo' },
    update: {},
    create: { name: 'Residencias Demo S.L.', slug: 'demo' },
  });

  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);

  const users: Array<{ email: string; name: string; role: UserRole; tenantId: string | null }> = [
    { email: 'superadmin@vetlla.dev', name: 'Plataforma', role: UserRole.SUPERADMIN, tenantId: null },
    { email: 'direccion@demo.vetlla.dev', name: 'Dirección Demo', role: UserRole.DIRECTOR, tenantId: tenant.id },
    { email: 'sanitario@demo.vetlla.dev', name: 'Enfermería Demo', role: UserRole.SANITARIO, tenantId: tenant.id },
    { email: 'auxiliar@demo.vetlla.dev', name: 'Auxiliar Demo', role: UserRole.AUXILIAR, tenantId: tenant.id },
    { email: 'familiar@demo.vetlla.dev', name: 'Familiar Demo', role: UserRole.FAMILIAR, tenantId: tenant.id },
  ];

  for (const u of users) {
    await prisma.user.upsert({
      where: { email: u.email },
      update: { name: u.name, role: u.role, tenantId: u.tenantId },
      create: { ...u, passwordHash },
    });
  }

  console.log(`Seed OK. Tenant "${tenant.name}" + ${users.length} usuarios.`);
  console.log(`Password de todos los usuarios demo: ${DEMO_PASSWORD}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
