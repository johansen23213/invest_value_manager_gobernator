import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Los workspaces @vetlla/* exportan TypeScript fuente; los transpilamos.
  transpilePackages: ['@vetlla/ai', '@vetlla/db', '@vetlla/ui'],
  serverExternalPackages: ['@prisma/client', 'bcryptjs'],
};

export default nextConfig;
