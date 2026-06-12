import type { ReactNode } from 'react';
import { headers } from 'next/headers';
import Link from 'next/link';
import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import { hasPermission } from '@/lib/rbac';

// Sub-navegación de la sección Visitas (agenda / franjas).
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

export default async function VisitasLayout({ children }: { children: ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect('/login');

  // Solo staff con visits:manage puede acceder al backoffice de visitas
  if (!hasPermission(session.user.role, 'visits:manage')) {
    redirect('/');
  }

  const canConfigSlots = hasPermission(session.user.role, 'centers:write');

  const headersList = await headers();
  const pathname = headersList.get('x-pathname') ?? '/visitas';

  return (
    <div className="flex flex-col gap-6">
      <nav
        className="flex items-center gap-1 rounded-2xl border border-brand-100/60 bg-white px-3 py-2 shadow-card"
        aria-label="Secciones de visitas"
      >
        <SubNavLink
          href="/visitas"
          label="Agenda"
          pathname={pathname}
        />
        {canConfigSlots && (
          <SubNavLink
            href="/visitas/franjas"
            label="Franjas"
            pathname={pathname}
          />
        )}
      </nav>
      {children}
    </div>
  );
}
