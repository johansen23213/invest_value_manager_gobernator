import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import bcrypt from 'bcryptjs';
import { asPlatformAdmin, logAudit, type UserRole } from '@vetlla/db';
import { credentialsSchema } from '@/lib/auth-schema';
import './env'; // valida el entorno al cargar la capa de auth

// La autenticación es una operación previa al tenant (lookup por email único,
// cross-tenant), por lo que usa el cliente con bypass de RLS.
const authDb = asPlatformAdmin();

// Estrategia JWT con provider de credenciales. El adaptador Postgres de Auth.js
// se incorporará al añadir providers OAuth/email (H1); credenciales requiere JWT.
export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: 'jwt' },
  pages: { signIn: '/login' },
  providers: [
    Credentials({
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Contraseña', type: 'password' },
      },
      authorize: async (raw) => {
        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) return null;

        const { email, password } = parsed.data;
        const user = await authDb.user.findUnique({ where: { email } });
        if (!user) return null;

        const valid = await bcrypt.compare(password, user.passwordHash);
        if (!valid) return null;

        await authDb.user.update({
          where: { id: user.id },
          data: { lastLoginAt: new Date() },
        });

        // Trazabilidad de acceso (RGPD). Solo usuarios con tenant.
        if (user.tenantId) {
          await logAudit(authDb, {
            tenantId: user.tenantId,
            actorId: user.id,
            actorEmail: user.email,
            action: 'LOGIN',
            entity: 'User',
            entityId: user.id,
            summary: 'Inicio de sesión',
          });
        }

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          tenantId: user.tenantId,
        };
      },
    }),
  ],
  callbacks: {
    jwt: ({ token, user }) => {
      if (user) {
        token.role = user.role;
        token.tenantId = user.tenantId;
      }
      return token;
    },
    session: ({ session, token }) => {
      if (session.user) {
        session.user.id = token.sub ?? '';
        session.user.role = token.role as UserRole;
        session.user.tenantId = (token.tenantId as string | null) ?? null;
      }
      return session;
    },
  },
});
