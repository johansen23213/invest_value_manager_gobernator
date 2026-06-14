import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Los workspaces @vetlla/* exportan TypeScript fuente; los transpilamos.
  transpilePackages: ['@vetlla/ai', '@vetlla/db', '@vetlla/ui'],
  serverExternalPackages: ['@prisma/client', 'bcryptjs', 'web-push'],
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
