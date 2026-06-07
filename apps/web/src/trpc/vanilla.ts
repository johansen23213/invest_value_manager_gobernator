import { createTRPCClient, httpBatchLink } from '@trpc/client';
import superjson from 'superjson';
import type { AppRouter } from '@/server/routers/_app';

// Cliente tRPC sin React, para el motor de sincronización offline (fuera de
// componentes). Solo se usa en el navegador (URL relativa).
export const trpcVanilla = createTRPCClient<AppRouter>({
  links: [httpBatchLink({ url: '/api/trpc', transformer: superjson })],
});
