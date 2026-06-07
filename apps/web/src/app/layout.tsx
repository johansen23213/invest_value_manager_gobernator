import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import './globals.css';
import { TRPCProvider } from '@/trpc/react';
import { ServiceWorkerRegister } from '@/components/service-worker-register';
import { I18nProvider } from '@/i18n/provider';
import { getLocale } from '@/i18n/server';
import { translate } from '@/i18n/dictionaries';

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

export default async function RootLayout({ children }: { children: ReactNode }) {
  const locale = await getLocale();

  return (
    <html lang={locale}>
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased">
        <a
          href="#contenido"
          className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded-md focus:bg-slate-900 focus:px-3 focus:py-2 focus:text-white"
        >
          {translate(locale, 'skip.toContent')}
        </a>
        <I18nProvider locale={locale}>
          <TRPCProvider>{children}</TRPCProvider>
        </I18nProvider>
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
