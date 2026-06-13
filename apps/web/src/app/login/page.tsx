import Link from 'next/link';
import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { getT } from '@/i18n/server';
import { Logo } from '@/components/logo';
import { LoginForm } from './login-form';

// Panel decorativo SVG — ola orgánica en la parte inferior del panel teal.
function WaveDecoration() {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 400 80"
      preserveAspectRatio="none"
      className="absolute bottom-0 left-0 w-full"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M0,40 C80,80 160,0 240,40 C320,80 370,20 400,40 L400,80 L0,80 Z"
        fill="rgb(231 111 81 / 0.18)"
      />
      <path
        d="M0,55 C100,20 200,70 320,45 C360,35 385,55 400,50 L400,80 L0,80 Z"
        fill="rgb(231 111 81 / 0.10)"
      />
    </svg>
  );
}

// Blob decorativo SVG para el panel teal (sutileza orgánica Lifecare).
function BlobDecoration() {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 300 300"
      className="absolute -right-16 -top-16 h-64 w-64 opacity-10"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M150,20 C200,20 260,60 270,120 C280,180 240,250 180,265 C120,280 50,240 30,175 C10,110 50,30 150,20 Z"
        fill="white"
      />
    </svg>
  );
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ registered?: string; reset?: string }>;
}) {
  const session = await auth();
  if (session?.user) redirect('/');
  const { t } = await getT();
  const { registered, reset } = await searchParams;

  return (
    <main
      id="contenido"
      className="flex min-h-screen bg-[#FAF7F2]"
    >
      {/* ── Panel decorativo teal (desktop únicamente) ─────────────────────── */}
      <div
        aria-hidden="true"
        className="relative hidden overflow-hidden bg-brand-700 lg:flex lg:w-[52%] lg:flex-col lg:justify-between lg:p-12"
      >
        <BlobDecoration />

        {/* Logo blanco */}
        <span className="relative z-10 inline-flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/15 text-sm font-extrabold text-white">
            V
          </span>
          <span className="text-xl font-extrabold tracking-tight text-white">Vetlla</span>
        </span>

        {/* Claim principal */}
        <div className="relative z-10 flex flex-col gap-4">
          <p className="font-display text-display-2xl whitespace-pre-line leading-tight text-white">
            {t('auth.panel.claim')}
          </p>
          <p className="max-w-xs text-lg font-medium text-brand-100/80">
            {t('auth.panel.sub')}
          </p>

          {/* Sello de confianza veraz: residencia de datos UE / RGPD */}
          <div className="mt-6 inline-flex items-center gap-2 self-start rounded-full bg-white/10 px-4 py-2">
            <svg
              aria-hidden="true"
              focusable="false"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="shrink-0 text-brand-100"
            >
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
            <p className="text-sm text-brand-100/90">{t('auth.panel.trust')}</p>
          </div>
        </div>

        <WaveDecoration />
      </div>

      {/* ── Panel del formulario ────────────────────────────────────────────── */}
      <div className="flex w-full flex-col items-center justify-center px-6 py-10 lg:w-[48%] lg:px-14">
        {/* Logo visible solo en móvil */}
        <div className="mb-8 lg:hidden">
          <Logo />
        </div>

        <div className="w-full max-w-sm">
          <h1 className="mb-1 text-2xl font-extrabold tracking-tight text-[#1A3A3F]">
            {t('action.login')}
          </h1>
          <p className="mb-6 text-sm text-[#1A3A3F]/70">{t('login.subtitle')}</p>

          {registered && (
            <div
              role="status"
              className="mb-4 rounded-2xl border border-delight-100 bg-delight-50 px-4 py-3 text-sm text-delight-700"
            >
              {t('login.registered')}
            </div>
          )}
          {reset && (
            <div
              role="status"
              className="mb-4 rounded-2xl border border-delight-100 bg-delight-50 px-4 py-3 text-sm text-delight-700"
            >
              {t('login.resetDone')}
            </div>
          )}

          <LoginForm />

          <div className="mt-5 flex flex-col gap-1.5 text-center text-sm">
            <Link href="/recuperar" className="text-brand-600 hover:text-brand-700 hover:underline">
              {t('login.forgot')}
            </Link>
            <p className="text-[#1A3A3F]/70">
              {t('login.noAccount')}{' '}
              <Link href="/registro" className="font-semibold text-warm-700 hover:text-warm-800 hover:underline">
                {t('login.tryFree')}
              </Link>
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
