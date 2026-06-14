import { fetchRequestHandler } from '@trpc/server/adapters/fetch';
import { appRouter } from '@/server/routers/_app';
import { createTRPCContext } from '@/server/trpc';
import { logger, requestLogger } from '@/server/logger';

const handler = (req: Request) =>
  fetchRequestHandler({
    endpoint: '/api/trpc',
    req,
    router: appRouter,
    createContext: () => createTRPCContext({ headers: req.headers }),
    // INC-6: traza de errores SIN PII — ruta, código y tipo del error tRPC;
    // jamás el input (puede llevar datos de salud). Los códigos esperados de
    // flujo (UNAUTHORIZED/FORBIDDEN/NOT_FOUND) bajan a warn para no ensuciar.
    // OPS-A10: se incluye requestId (correlation ID) en el log del error para
    // correlacionar con el log de timing del mismo request.
    onError({ error, path, type, ctx }) {
      const expected = ['UNAUTHORIZED', 'FORBIDDEN', 'NOT_FOUND', 'BAD_REQUEST'];
      const log = ctx?.requestId != null ? requestLogger(ctx.requestId) : logger;
      const emit = expected.includes(error.code) ? log.warn : log.error;
      emit('trpc.error', {
        path: path ?? 'unknown',
        type,
        code: error.code,
        message: error.message,
      });
    },
  });

export { handler as GET, handler as POST };
