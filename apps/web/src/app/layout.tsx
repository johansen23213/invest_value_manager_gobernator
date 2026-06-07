import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';
import { TRPCProvider } from '@/trpc/react';

export const metadata: Metadata = {
  title: 'Vetlla',
  description: 'Gestión sociosanitaria cloud-native',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es">
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased">
        <TRPCProvider>{children}</TRPCProvider>
      </body>
    </html>
  );
}
