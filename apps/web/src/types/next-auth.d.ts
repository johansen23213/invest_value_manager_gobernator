import type { UserRole } from '@vetlla/db';
import type { DefaultSession } from 'next-auth';

// Extiende los tipos de Auth.js con el rol y el tenant del usuario.
declare module 'next-auth' {
  interface User {
    role: UserRole;
    tenantId: string | null;
  }

  interface Session {
    user: {
      id: string;
      role: UserRole;
      tenantId: string | null;
    } & DefaultSession['user'];
  }
}

// Nota: JWT se define en @auth/core/jwt y next-auth/jwt solo lo reexporta, por lo
// que augmentarlo aquí no fusiona de forma fiable bajo la resolución estricta de
// pnpm. Los valores del token se convierten explícitamente en el callback session.
