import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // El cliente de Prisma vive en el workspace @vetlla/db; lo transpilamos.
  transpilePackages: ['@vetlla/db', '@vetlla/ui'],
  serverExternalPackages: ['@prisma/client', 'bcryptjs'],
};

export default nextConfig;
