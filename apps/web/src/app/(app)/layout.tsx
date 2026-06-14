import Link from 'next/link';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { auth, signOut } from '@/auth';
import { getT } from '@/i18n/server';
import { CareSyncProvider } from '@/offline/use-care-sync';
import { SyncStatusBadge } from '@/offline/sync-status-badge';
import { LocaleSwitcher } from '@/i18n/locale-switcher';
import { ToastProvider } from '@/components/toast';
import { ConfirmProvider } from '@/components/confirm';
import { Logo } from '@/components/logo';
import { hasPermission } from '@/lib/rbac';
import { forTenant } from '@vetlla/db';
import { trialDaysLeft } from '@/lib/plans';
import { NavDropdown, type NavDropdownItem } from '@/components/nav-dropdown';

// ---------------------------------------------------------------------------
// NavLink — enlace suelto en la barra de navegación principal.
// aria-current="page" para accesibilidad (WCAG 2.4.4) + estilo visual petróleo.
// ---------------------------------------------------------------------------
async function NavLink({ href, label, pathname }: { href: string; label: string; pathname: string }) {
  const isActive = pathname === href || (href !== '/' && pathname.startsWith(href));
  return (
    <Link
      href={href}
      aria-current={isActive ? 'page' : undefined}
      className={
        isActive
          ? 'rounded-full px-3.5 py-1.5 text-sm font-semibold bg-brand-700 text-white transition-smooth'
          : 'rounded-full px-3.5 py-1.5 text-sm font-medium text-[#1A3A3F]/70 transition-smooth hover:bg-brand-50 hover:text-brand-700'
      }
    >
      {label}
    </Link>
  );
}

// ---------------------------------------------------------------------------
// isItemActive — determina si un pathname activa un ítem de nav.
// ---------------------------------------------------------------------------
function isItemActive(pathname: string, href: string): boolean {
  return pathname === href || (href !== '/' && pathname.startsWith(href));
}

// ---------------------------------------------------------------------------
// AppLayout — shell principal para usuarios autenticados (staff y familiar).
//
// NAVEGACIÓN AGRUPADA (UX-nav-grupos):
//
// Los 14 enlaces planos se reagrupan en 1 enlace suelto + 3 dropdowns:
//
//   Inicio  |  Asistencial ▾  |  Familias ▾  |  Centro ▾
//
//   Asistencial: Residentes, Atención, Traspaso, Alertas, Conflictos
//   Familias:    Solicitudes, Visitas, Comunicación
//   Centro:      Centros, Ocupación, Equipo, Auditoría, Plan
//
// Criterio de agrupación (arquitectura de información):
//   - Asistencial: todo lo que un auxiliar/sanitario usa a pie de cama.
//     Residentes y Atención son el núcleo; Traspaso, Alertas y Conflictos
//     son extensiones operativas del mismo flujo asistencial.
//   - Familias: la capa de contacto con el exterior (solicitudes, visitas,
//     mensajería). Gestionado mayoritariamente por Dirección/Sanitario.
//   - Centro: configuración y gobernanza (centros, ocupación, equipo,
//     auditoría, plan). Orientado a Dirección/Superadmin.
//   Inicio queda suelto: es el dashboard, el punto de anclaje.
//
// Permisos: un ítem solo aparece si el usuario tiene el permiso requerido.
// Si tras filtrar el grupo queda vacío, el dropdown no se renderiza.
//
// E2E — DECISIÓN DE COMPATIBILIDAD:
//   Todos los specs de Playwright navegan via page.goto(url) directo, no
//   mediante click en enlaces del nav global. Los helpers de los specs
//   (goToFirstResidentMedicacion, goToDisfagiaResident…) también usan URL
//   directa. Por tanto, el hecho de que los enlaces estén dentro de un
//   dropdown no rompe ningún test existente. Los enlaces permanecen en el
//   DOM (hidden attr cuando el menú está cerrado) para robustez adicional.
// ---------------------------------------------------------------------------
export default async function AppLayout({ children }: { children: ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect('/login');
  const { user } = session;
  const { t } = await getT();
  const isFamily = user.role === 'FAMILIAR';

  // Pathname actual para el indicador de página activa.
  const headersList = await headers();
  const pathname = headersList.get('x-pathname') ?? '/';

  // Banner de prueba: días restantes del TRIAL (visible para todo el equipo).
  let trialDays: number | null = null;
  if (user.tenantId) {
    const db = forTenant({ tenantId: user.tenantId, bypassRls: user.role === 'SUPERADMIN' });
    const tenant = await db.tenant.findFirst({ select: { plan: true, trialEndsAt: true } });
    if (tenant?.plan === 'TRIAL') trialDays = trialDaysLeft(tenant.trialEndsAt);
  }

  // ── Grupo Asistencial ──────────────────────────────────────────────────────
  // Todos los roles staff ven Residentes y Atención (sin permiso explícito en
  // el código actual — la protección está en las propias páginas).
  // Alertas, Traspaso y Conflictos requieren care:read.
  const asistencialItems: NavDropdownItem[] = [
    { href: '/residentes', label: t('nav.residents'), active: isItemActive(pathname, '/residentes') },
    { href: '/atencion',   label: t('nav.care'),      active: isItemActive(pathname, '/atencion') },
    ...(hasPermission(user.role, 'care:read')
      ? [
          { href: '/relevo',     label: t('nav.relevo'),    active: isItemActive(pathname, '/relevo') },
          { href: '/alertas',    label: t('nav.alerts'),    active: isItemActive(pathname, '/alertas') },
          { href: '/conflictos', label: t('nav.conflicts'), active: isItemActive(pathname, '/conflictos') },
        ]
      : []),
    ...(hasPermission(user.role, 'residents:read')
      ? [
          { href: '/valoraciones', label: t('nav.valoraciones'), active: isItemActive(pathname, '/valoraciones') },
          { href: '/acp', label: t('nav.acp'), active: isItemActive(pathname, '/acp') },
        ]
      : []),
  ];

  // ── Grupo Familias ─────────────────────────────────────────────────────────
  const familiasItems: NavDropdownItem[] = [
    ...(hasPermission(user.role, 'requests:manage')
      ? [{ href: '/solicitudes',  label: t('nav.requests'), active: isItemActive(pathname, '/solicitudes') }]
      : []),
    ...(hasPermission(user.role, 'visits:manage')
      ? [{ href: '/visitas',      label: t('nav.visits'),   active: isItemActive(pathname, '/visitas') }]
      : []),
    ...(hasPermission(user.role, 'comms:read')
      ? [{ href: '/comunicacion', label: t('nav.comms'),    active: isItemActive(pathname, '/comunicacion') }]
      : []),
  ];

  // ── Grupo Centro ───────────────────────────────────────────────────────────
  const centroItems: NavDropdownItem[] = [
    { href: '/centros',   label: t('nav.centers'),  active: isItemActive(pathname, '/centros') },
    ...(hasPermission(user.role, 'shifts:read')
      ? [{ href: '/cuadrante', label: t('nav.cuadrante'), active: isItemActive(pathname, '/cuadrante') }]
      : []),
    ...(hasPermission(user.role, 'care:read')
      ? [{ href: '/menus', label: t('nav.menus'), active: isItemActive(pathname, '/menus') }]
      : []),
    ...(hasPermission(user.role, 'centers:read')
      ? [{ href: '/ocupacion', label: t('nav.occupancy'), active: isItemActive(pathname, '/ocupacion') }]
      : []),
    ...(hasPermission(user.role, 'users:read')
      ? [{ href: '/equipo',    label: t('nav.team'),     active: isItemActive(pathname, '/equipo') }]
      : []),
    ...(hasPermission(user.role, 'audit:read')
      ? [{ href: '/auditoria', label: t('nav.audit'),    active: isItemActive(pathname, '/auditoria') }]
      : []),
    ...(hasPermission(user.role, 'users:write')
      ? [{ href: '/plan',      label: t('nav.plan'),     active: isItemActive(pathname, '/plan') }]
      : []),
    ...(hasPermission(user.role, 'billing:read')
      ? [{ href: '/facturacion', label: t('nav.facturacion'), active: isItemActive(pathname, '/facturacion') }]
      : []),
    ...(hasPermission(user.role, 'admissions:read')
      ? [{ href: '/admisiones', label: t('nav.admissions'), active: isItemActive(pathname, '/admisiones') }]
      : []),
  ];

  const asistencialActive = asistencialItems.some((i) => i.active);
  const familiasActive    = familiasItems.some((i) => i.active);
  const centroActive      = centroItems.some((i) => i.active);

  return (
    <CareSyncProvider>
      <ToastProvider>
        <ConfirmProvider>
          <div className="min-h-screen bg-[#FAF7F2]">
            {/* Enlace de salto al contenido (WCAG 2.4.1) */}
            <a
              href="#contenido"
              className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-brand-700 focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-white"
            >
              {t('skip.toContent')}
            </a>

            {/* Header con fondo blanco/crema y borde inferior petróleo sutil */}
            <header className="sticky top-0 z-30 border-b border-brand-100/60 bg-white/95 backdrop-blur-sm">
              <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-2.5">
                {/* Marca + nav principal */}
                <div className="flex items-center gap-4 min-w-0">
                  <Link href={isFamily ? '/portal' : '/'} aria-label={t('app.name')} className="shrink-0">
                    <Logo />
                  </Link>

                  {/*
                    Nav principal:
                    - Desktop: enlace suelto Inicio + 3 dropdowns agrupados en una fila.
                    - Móvil (< md): el header se convierte en una barra más estrecha;
                      los dropdowns usan posición absolute y el menú hamburguesa
                      oculta/muestra la barra completa de grupos. En esta iteración
                      los grupos se muestran en línea con overflow-x auto para que
                      sean accesibles sin hamburguesa (el siguiente sprint añadirá el
                      drawer móvil). El flex-wrap está eliminado para evitar la "sopa
                      de píldoras" anterior en móvil — ahora la barra es scrollable.
                  */}
                  <nav
                    className="flex items-center gap-0.5 text-sm overflow-x-auto scrollbar-none"
                    aria-label="Principal"
                  >
                    {isFamily ? (
                      <NavLink href="/portal" label={t('nav.portal')} pathname={pathname} />
                    ) : (
                      <>
                        {/* Inicio — enlace suelto, sin grupo */}
                        <NavLink href="/" label={t('nav.home')} pathname={pathname} />

                        {/* Grupo Asistencial */}
                        {asistencialItems.length > 0 && (
                          <NavDropdown
                            label={t('nav.group.asistencial')}
                            items={asistencialItems}
                            groupActive={asistencialActive}
                          />
                        )}

                        {/* Grupo Familias */}
                        {familiasItems.length > 0 && (
                          <NavDropdown
                            label={t('nav.group.familias')}
                            items={familiasItems}
                            groupActive={familiasActive}
                          />
                        )}

                        {/* Grupo Centro */}
                        {centroItems.length > 0 && (
                          <NavDropdown
                            label={t('nav.group.centro')}
                            items={centroItems}
                            groupActive={centroActive}
                          />
                        )}
                      </>
                    )}
                  </nav>
                </div>

                {/* Controles de usuario */}
                <div className="flex items-center gap-2 text-sm shrink-0">
                  <LocaleSwitcher />
                  {!isFamily && <SyncStatusBadge />}
                  {/* Enlace a ajustes de seguridad de la cuenta (MFA) */}
                  <Link
                    href="/cuenta/seguridad"
                    aria-label={t('nav.cuenta.seguridad')}
                    className="hidden rounded-full bg-brand-50 px-3 py-1.5 text-[#1A3A3F]/70 transition-smooth hover:bg-brand-100 hover:text-brand-700 sm:inline"
                  >
                    {user.name ?? user.email}
                    <span className="ml-1 text-[#1A3A3F]/70">· {t(`role.${user.role}`)}</span>
                  </Link>
                  <form
                    action={async () => {
                      'use server';
                      await signOut({ redirectTo: '/login' });
                    }}
                  >
                    <button
                      type="submit"
                      className="min-h-touch rounded-full border border-brand-200 px-3 py-1.5 text-sm font-medium text-[#1A3A3F]/70 transition-smooth hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700"
                    >
                      {t('action.logout')}
                    </button>
                  </form>
                </div>
              </div>
            </header>

            {/* Banner de TRIAL */}
            {trialDays !== null && (
              <div
                role="status"
                className={`border-b px-4 py-2 text-center text-sm font-medium ${
                  trialDays > 5
                    ? 'border-amber-200 bg-amber-50 text-amber-800'
                    : 'border-red-200 bg-red-50 text-red-800'
                }`}
              >
                {trialDays > 0 ? t('plan.trialLeft', { days: trialDays }) : t('plan.trialEnded')}
                {hasPermission(user.role, 'users:write') && (
                  <>
                    {' · '}
                    <Link href="/plan" className="underline">
                      {t('nav.plan')}
                    </Link>
                  </>
                )}
              </div>
            )}

            <main id="contenido" className="mx-auto max-w-6xl px-4 py-8">
              {children}
            </main>
          </div>
        </ConfirmProvider>
      </ToastProvider>
    </CareSyncProvider>
  );
}
