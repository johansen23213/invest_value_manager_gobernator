import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Los workspaces @vetlla/* exportan TypeScript fuente; los transpilamos.
  transpilePackages: ['@vetlla/ai', '@vetlla/db', '@vetlla/ui'],
  serverExternalPackages: ['@prisma/client', 'bcryptjs', 'web-push'],
  // OPS-C01: salida standalone para el Dockerfile de producción multistage.
  // Next.js copia solo los ficheros necesarios en .next/standalone/ (binarios,
  // páginas, rutas de API) y omite devDependencies y código fuente.
  // El Dockerfile de producción solo necesita copiar .next/standalone/ y
  // .next/static/ — sin pnpm ni node_modules del monorepo.
  output: 'standalone',
  webpack: (config, { isServer }) => {
    if (!isServer) {
      // web-push usa módulos Node.js (tls, net, crypto). Excluirlo del bundle
      // del cliente (solo se usa server-side en los routers tRPC).
      config.resolve ??= {};
      config.resolve.fallback = {
        ...(config.resolve.fallback as Record<string, false> | undefined),
        tls: false,
        net: false,
        crypto: false,
      };
    }
    return config;
  },
};

export default nextConfig;
