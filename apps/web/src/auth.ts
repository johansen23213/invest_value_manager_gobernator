import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import bcrypt from 'bcryptjs';
import { asPlatformAdmin, logAudit, type UserRole } from '@vetlla/db';
import { credentialsSchema } from '@/lib/auth-schema';
import { verifyTotp } from '@/lib/totp';
import { findRecoveryCodeHash } from '@/lib/mfa-recovery';
import { isLocked, registerFailure, resetLockout } from '@/lib/login-lockout';
import './env'; // valida el entorno al cargar la capa de auth

// La autenticación es una operación previa al tenant (lookup por email único,
// cross-tenant), por lo que usa el cliente con bypass de RLS.
const authDb = asPlatformAdmin();

/**
 * Flujo de autenticación con MFA + bloqueo de cuenta (RNF-SEG-002, RNF-SEG-011).
 *
 * Etapas:
 *   1. Validar formato de entrada (Zod).
 *   2. Buscar usuario por email.
 *   3. Comprobar bloqueo (ACCOUNT_LOCKED): rechazar sin revelar si el password era correcto.
 *   4. Verificar contraseña (bcrypt).
 *      - Fallo: incrementar contador, potencialmente bloquear, auditar, retornar null.
 *      - Éxito: resetear contador de fallos.
 *   5. Si MFA activo: comprobar `totp` o `recoveryCode` en los campos de credenciales.
 *      - Ausentes: lanzar error tipado "MFA_REQUIRED" (la UI debe redirigir al paso MFA).
 *      - Presentes pero inválidos: lanzar "MFA_INVALID".
 *      - Válidos: continuar.
 *   6. Registrar login exitoso (lastLoginAt, AuditLog).
 *
 * Errores tipados que la UI debe manejar:
 *   "ACCOUNT_LOCKED"  → mostrar mensaje de bloqueo temporal.
 *   "MFA_REQUIRED"    → mostrar formulario TOTP (segundo paso).
 *   "MFA_INVALID"     → código TOTP o recovery code incorrecto.
 *   null              → credenciales incorrectas (genérico, sin detalle para no enumerar).
 *
 * La UI distingue estos errores leyendo el campo `message` del CallbackError de Auth.js
 * (que encapsula el error como un string en la query param `?error=`).
 * Implementación de referencia en apps/web/src/app/login/actions.ts.
 */

// Estrategia JWT con provider de credenciales. El adaptador Postgres de Auth.js
// se incorporará al añadir providers OAuth/email (H1); credenciales requiere JWT.
export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: 'jwt' },
  pages: { signIn: '/login' },
  providers: [
    Credentials({
      credentials: {
        email:        { label: 'Email', type: 'email' },
        password:     { label: 'Contraseña', type: 'password' },
        // Campos opcionales para el segundo factor MFA.
        // La UI envía uno de los dos cuando el usuario ya superó el paso de contraseña.
        totp:         { label: 'Código TOTP', type: 'text' },
        recoveryCode: { label: 'Código de recuperación', type: 'text' },
      },
      authorize: async (raw) => {
        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) return null;

        const { email, password } = parsed.data;
        // totp y recoveryCode son strings o undefined; credentialsSchema solo valida email+password
        const totp        = typeof raw?.totp === 'string' && raw.totp.length > 0 ? raw.totp : undefined;
        const recoveryCode = typeof raw?.recoveryCode === 'string' && raw.recoveryCode.length > 0 ? raw.recoveryCode : undefined;

        // -- 1. Buscar usuario
        const user = await authDb.user.findUnique({
          where: { email },
          select: {
            id: true,
            email: true,
            name: true,
            role: true,
            tenantId: true,
            passwordHash: true,
            mfaSecret: true,
            mfaEnabledAt: true,
            failedLoginAttempts: true,
            lockedUntil: true,
          },
        });
        if (!user) return null;

        // -- 2. Comprobar bloqueo ANTES de verificar contraseña (no enumeración).
        const now = new Date();
        if (isLocked(user, now)) {
          // Auditar intento de acceso a cuenta bloqueada (sin revelar la razón al cliente).
          if (user.tenantId) {
            await logAudit(authDb, {
              tenantId: user.tenantId,
              actorId: user.id,
              actorEmail: user.email,
              action: 'LOGIN_BLOCKED',
              entity: 'User',
              entityId: user.id,
              summary: 'Intento de login rechazado: cuenta bloqueada por intentos fallidos',
            });
          }
          // Error tipado "ACCOUNT_LOCKED": no revela si el password era correcto.
          throw new Error('ACCOUNT_LOCKED');
        }

        // -- 3. Verificar contraseña
        const valid = await bcrypt.compare(password, user.passwordHash);
        if (!valid) {
          // Registrar fallo y potencialmente bloquear
          const lockoutUpdate = registerFailure(user, now);
          await authDb.user.update({
            where: { id: user.id },
            data: lockoutUpdate,
          });

          // Auditar si se produce bloqueo
          if (lockoutUpdate.lockedUntil) {
            if (user.tenantId) {
              await logAudit(authDb, {
                tenantId: user.tenantId,
                actorId: user.id,
                actorEmail: user.email,
                action: 'ACCOUNT_LOCKED',
                entity: 'User',
                entityId: user.id,
                summary: `Cuenta bloqueada tras ${lockoutUpdate.failedLoginAttempts} intentos fallidos`,
              });
            }
          }

          return null;
        }

        // Contraseña correcta: resetear el contador de fallos (si había alguno)
        if (user.failedLoginAttempts > 0 || user.lockedUntil) {
          await authDb.user.update({
            where: { id: user.id },
            data: resetLockout(),
          });
        }

        // -- 4. Verificar segundo factor si MFA está activo
        if (user.mfaEnabledAt && user.mfaSecret) {
          if (!totp && !recoveryCode) {
            // La UI debe mostrar el formulario TOTP
            throw new Error('MFA_REQUIRED');
          }

          let mfaOk = false;

          if (totp) {
            try {
              mfaOk = await verifyTotp(user.mfaSecret, totp);
            } catch {
              // El secreto almacenado en BD es siempre válido (base32 de generateTotpSecret).
              // En caso de corrupción de datos, tratamos el código como inválido.
              mfaOk = false;
            }
          } else if (recoveryCode) {
            // Buscar recovery codes disponibles
            const codes = await authDb.mfaRecoveryCode.findMany({
              where: { userId: user.id, usedAt: null },
              select: { id: true, codeHash: true },
            });
            const matchedHash = await findRecoveryCodeHash(
              codes.map((c) => c.codeHash),
              recoveryCode,
            );
            if (matchedHash) {
              // Marcar como usado
              const codeRow = codes.find((c) => c.codeHash === matchedHash)!;
              await authDb.mfaRecoveryCode.update({
                where: { id: codeRow.id },
                data: { usedAt: new Date() },
              });
              mfaOk = true;
            }
          }

          if (!mfaOk) {
            throw new Error('MFA_INVALID');
          }
        }

        // -- 5. Login exitoso
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
