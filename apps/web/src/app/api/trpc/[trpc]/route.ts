import { fetchRequestHandler } from '@trpc/server/adapters/fetch';
import { appRouter } from '@/server/routers/_app';
import { createTRPCContext } from '@/server/trpc';
import { logger } from '@/server/logger';

const handler = (req: Request) =>
  fetchRequestHandler({
    endpoint: '/api/trpc',
    req,
    router: appRouter,
    createContext: () => createTRPCContext({ headers: req.headers }),
    // INC-6: traza de errores SIN PII — ruta, código y tipo del error tRPC;
    // jamás el input (puede llevar datos de salud). Los códigos esperados de
    // flujo (UNAUTHORIZED/FORBIDDEN/NOT_FOUND) bajan a warn para no ensuciar.
    onError({ error, path, type }) {
      const expected = ['UNAUTHORIZED', 'FORBIDDEN', 'NOT_FOUND', 'BAD_REQUEST'];
      const log = expected.includes(error.code) ? logger.warn : logger.error;
      log('trpc.error', {
        path: path ?? 'unknown',
        type,
        code: error.code,
        message: error.message,
      });
    },
  });

export { handler as GET, handler as POST };
