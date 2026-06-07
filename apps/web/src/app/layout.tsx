import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import './globals.css';
import { TRPCProvider } from '@/trpc/react';
import { ServiceWorkerRegister } from '@/components/service-worker-register';

export const metadata: Metadata = {
  title: 'Vetlla',
  description: 'Gestión sociosanitaria cloud-native',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, title: 'Vetlla', statusBarStyle: 'default' },
};

export const viewport: Viewport = {
  themeColor: '#0f172a',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es">
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased">
        <TRPCProvider>{children}</TRPCProvider>
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
