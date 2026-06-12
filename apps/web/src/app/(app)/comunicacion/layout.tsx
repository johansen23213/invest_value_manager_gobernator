import type { ReactNode } from 'react';
import { headers } from 'next/headers';
import Link from 'next/link';

// Sub-navegación de la sección Comunicación (comunicados / mensajería).
// Es un Server Component (sin 'use client') que lee el pathname del header.

async function SubNavLink({
  href,
  label,
  pathname,
}: {
  href: string;
  label: string;
  pathname: string;
}) {
  const isActive = pathname === href || pathname.startsWith(href);
  return (
    <Link
      href={href}
      aria-current={isActive ? 'page' : undefined}
      className={
        isActive
          ? 'rounded-full px-4 py-1.5 text-sm font-semibold bg-brand-700 text-white transition-smooth'
          : 'rounded-full px-4 py-1.5 text-sm font-medium text-[#1A3A3F]/70 transition-smooth hover:bg-brand-50 hover:text-brand-700'
      }
    >
      {label}
    </Link>
  );
}

export default async function ComunicacionLayout({ children }: { children: ReactNode }) {
  const headersList = await headers();
  const pathname = headersList.get('x-pathname') ?? '/comunicacion';

  return (
    <div className="flex flex-col gap-6">
      {/* Sub-navegación horizontal entre comunicados y mensajería */}
      <nav
        className="flex items-center gap-1 rounded-2xl border border-brand-100/60 bg-white px-3 py-2 shadow-card"
        aria-label="Secciones de comunicación"
      >
        <SubNavLink
          href="/comunicacion/comunicados"
          label="Comunicados"
          pathname={pathname}
        />
        <SubNavLink
          href="/comunicacion/mensajes"
          label="Mensajería"
          pathname={pathname}
        />
      </nav>
      {children}
    </div>
  );
}
