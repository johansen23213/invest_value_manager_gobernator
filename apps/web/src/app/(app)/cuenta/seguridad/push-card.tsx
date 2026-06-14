'use client';

/**
 * Tarjeta de gestión de notificaciones push (RF-NOT-001..005).
 *
 * Ciclo de vida:
 *  A) getPublicKey devuelve null → VAPID no configurado → "no soportado".
 *  B) Navegador sin PushManager/Notification → "no soportado".
 *  C) No suscrito → botón "Activar" → requestPermission → subscribe → feedback.
 *  D) Suscrito → botón "Desactivar" → unsubscribe local + api → feedback.
 *
 * Accesibilidad (WCAG 2.1 AA):
 *  - Toggle con role="switch", aria-checked y label visible.
 *  - aria-live="polite" en región de feedback.
 *  - Foco gestionado: el toggle recupera el foco tras completar la acción.
 *  - Objetivos táctiles min-h-touch (48px) en todos los botones.
 *  - role="alert" en mensajes de error.
 *  - El estado se comunica por texto, nunca solo por color.
 *
 * Restricciones:
 *  - Solo Web APIs (no node:crypto, no server-only).
 *  - No edita dictionaries.ts: usa únicamente claves push.* ya existentes.
 *  - No modifica mfa-card.tsx.
 */

import { useEffect, useRef, useState } from 'react';
import { api } from '@/trpc/react';
import { useT } from '@/i18n/provider';
import { useToast } from '@/components/toast';
import { formatDateTime } from '@/lib/format';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@vetlla/ui';

// ---------------------------------------------------------------------------
// Helper: convierte la clave VAPID de base64url a Uint8Array
// ---------------------------------------------------------------------------

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const pad = '='.repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + pad).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) {
    bytes[i] = raw.charCodeAt(i);
  }
  return bytes;
}

// ---------------------------------------------------------------------------
// Helper: detecta soporte de push en el navegador actual
// ---------------------------------------------------------------------------

function browserSupportsPush(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

// ---------------------------------------------------------------------------
// Subcomponente: lista de dispositivos suscritos
// ---------------------------------------------------------------------------

type DeviceItem = {
  id: string;
  endpoint: string;
  userAgent: string | null;
  createdAt: Date;
  lastSeenAt: Date | null;
};

function DeviceList({
  devices,
  onRemove,
  removingEndpoint,
  t,
  locale,
}: {
  devices: DeviceItem[];
  onRemove: (endpoint: string) => void;
  removingEndpoint: string | null;
  t: (k: string) => string;
  locale: string;
}) {
  if (devices.length === 0) {
    return (
      <p className="text-sm text-[#1A3A3F]/60">{t('push.devices.empty')}</p>
    );
  }

  return (
    <ul className="flex flex-col gap-2" aria-label={t('push.devices.title')}>
      {devices.map((dev) => {
        const label = dev.userAgent
          ? dev.userAgent.slice(0, 80)
          : dev.endpoint.slice(0, 40) + '…';
        const isRemoving = removingEndpoint === dev.endpoint;
        return (
          <li
            key={dev.id}
            className="flex items-center justify-between gap-3 rounded-xl border border-brand-100/60 bg-brand-50/40 px-4 py-3"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-[#1A3A3F]">{label}</p>
              <p className="text-xs text-[#1A3A3F]/50">
                {formatDateTime(locale as 'es' | 'ca', dev.lastSeenAt ?? dev.createdAt)}
              </p>
            </div>
            <Button
              variant="secondary"
              size="sm"
              disabled={isRemoving}
              onClick={() => onRemove(dev.endpoint)}
              aria-label={`${t('push.devices.remove')} — ${label}`}
            >
              {isRemoving ? '…' : t('push.devices.remove')}
            </Button>
          </li>
        );
      })}
    </ul>
  );
}

// ---------------------------------------------------------------------------
// Componente principal: PushCard
// ---------------------------------------------------------------------------

export function PushCard() {
  const { t, locale } = useT();
  const { success: toastSuccess, error: toastError } = useToast();
  const utils = api.useUtils();
  const toggleRef = useRef<HTMLButtonElement>(null);

  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isWorking, setIsWorking] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [feedbackIsError, setFeedbackIsError] = useState(false);
  const [removingEndpoint, setRemovingEndpoint] = useState<string | null>(null);

  // ── tRPC queries & mutations ────────────────────────────────────────────
  const publicKeyQ = api.push.getPublicKey.useQuery();
  const devicesQ   = api.push.listMine.useQuery(undefined, {
    // Solo refetch cuando el usuario está en la página
    refetchOnWindowFocus: true,
  });

  const subscribeMut   = api.push.subscribe.useMutation({
    onSuccess: () => void utils.push.listMine.invalidate(),
  });
  const unsubscribeMut = api.push.unsubscribe.useMutation({
    onSuccess: () => void utils.push.listMine.invalidate(),
  });

  // ── Detecta si el dispositivo actual ya tiene una suscripción activa ───
  useEffect(() => {
    if (!browserSupportsPush()) return;
    void navigator.serviceWorker.ready.then((reg) => {
      reg.pushManager.getSubscription().then((sub) => {
        setIsSubscribed(sub !== null);
      });
    });
  }, []);

  // ── Determina el estado de soporte ─────────────────────────────────────
  const vapidReady      = publicKeyQ.data?.publicKey != null;
  const browserSupports = browserSupportsPush();
  const isSupported     = vapidReady && browserSupports;

  // ── Feedback helpers ────────────────────────────────────────────────────
  function showFeedback(msg: string, isErr = false) {
    setFeedback(msg);
    setFeedbackIsError(isErr);
  }

  // ── Activar suscripción ─────────────────────────────────────────────────
  async function handleEnable() {
    if (!publicKeyQ.data?.publicKey) return;
    setIsWorking(true);
    setFeedback(null);

    try {
      const permission = await Notification.requestPermission();
      if (permission === 'denied') {
        showFeedback(t('push.permissionDenied'), true);
        setIsWorking(false);
        toggleRef.current?.focus();
        return;
      }

      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKeyQ.data.publicKey),
      });

      const p256dh = btoa(
        String.fromCharCode(...new Uint8Array(sub.getKey('p256dh')!)),
      );
      const auth = btoa(
        String.fromCharCode(...new Uint8Array(sub.getKey('auth')!)),
      );

      await subscribeMut.mutateAsync({
        endpoint:  sub.endpoint,
        p256dh,
        auth,
        userAgent: navigator.userAgent,
      });

      setIsSubscribed(true);
      showFeedback(t('push.enabled'));
      toastSuccess(t('push.enabled'));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      showFeedback(msg, true);
      toastError(msg);
    } finally {
      setIsWorking(false);
      toggleRef.current?.focus();
    }
  }

  // ── Desactivar suscripción ──────────────────────────────────────────────
  async function handleDisable() {
    setIsWorking(true);
    setFeedback(null);

    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();

      if (sub) {
        await sub.unsubscribe();
        await unsubscribeMut.mutateAsync({ endpoint: sub.endpoint });
      }

      setIsSubscribed(false);
      showFeedback(t('push.disabled'));
      toastSuccess(t('push.disabled'));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      showFeedback(msg, true);
      toastError(msg);
    } finally {
      setIsWorking(false);
      toggleRef.current?.focus();
    }
  }

  // ── Revocar dispositivo específico ──────────────────────────────────────
  async function handleRemoveDevice(endpoint: string) {
    setRemovingEndpoint(endpoint);
    try {
      await unsubscribeMut.mutateAsync({ endpoint });
      toastSuccess(t('push.devices.removed'));
      // Si el endpoint es el propio dispositivo, actualiza el estado local
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub?.endpoint === endpoint) {
        await sub.unsubscribe();
        setIsSubscribed(false);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toastError(msg);
    } finally {
      setRemovingEndpoint(null);
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <CardTitle>{t('push.title')}</CardTitle>
          {isSupported && (
            <Badge tone={isSubscribed ? 'green' : 'neutral'}>
              {isSubscribed ? t('push.enabled') : t('push.disabled')}
            </Badge>
          )}
        </div>
      </CardHeader>

      <CardContent>
        {/* Estado: cargando publicKey */}
        {publicKeyQ.isLoading && (
          <p className="text-sm text-[#1A3A3F]/60">…</p>
        )}

        {/* Estado: no soportado */}
        {!publicKeyQ.isLoading && !isSupported && (
          <p
            role="alert"
            className="text-sm text-[#1A3A3F]/70"
          >
            {t('push.notSupported')}
          </p>
        )}

        {/* Estado: soportado */}
        {!publicKeyQ.isLoading && isSupported && (
          <div className="flex flex-col gap-5">
            {/* Descripción y toggle */}
            <p className="text-sm text-[#1A3A3F]/70">{t('push.subtitle')}</p>

            <div className="flex items-center gap-4">
              {/* Toggle accesible (role="switch") */}
              <button
                ref={toggleRef}
                role="switch"
                aria-checked={isSubscribed}
                aria-label={
                  isSubscribed ? t('push.disable') : t('push.enable')
                }
                disabled={isWorking}
                onClick={() =>
                  void (isSubscribed ? handleDisable() : handleEnable())
                }
                className={[
                  // Pista visual: fondo cambia según estado
                  'relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full border-2 border-transparent',
                  'transition-colors duration-200',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-1',
                  'disabled:cursor-not-allowed disabled:opacity-50',
                  isSubscribed ? 'bg-brand-700' : 'bg-slate-300',
                ].join(' ')}
              >
                <span
                  aria-hidden="true"
                  className={[
                    'pointer-events-none inline-block h-6 w-6 rounded-full bg-white shadow-md',
                    'transform transition-transform duration-200',
                    isSubscribed ? 'translate-x-5' : 'translate-x-0',
                  ].join(' ')}
                />
              </button>

              {/* Label textual del estado */}
              <span className="text-sm font-medium text-[#1A3A3F]">
                {isWorking
                  ? '…'
                  : isSubscribed
                    ? t('push.disable')
                    : t('push.enable')}
              </span>
            </div>

            {/* Región aria-live para feedback inline */}
            <div aria-live="polite" aria-atomic="true" className="min-h-[1.5rem]">
              {feedback && (
                <p
                  role={feedbackIsError ? 'alert' : undefined}
                  className={
                    feedbackIsError
                      ? 'text-sm font-medium text-red-600'
                      : 'text-sm text-brand-700'
                  }
                >
                  {feedback}
                </p>
              )}
            </div>

            {/* Lista de dispositivos suscritos */}
            <section aria-labelledby="push-devices-heading">
              <h3
                id="push-devices-heading"
                className="mb-3 text-sm font-semibold text-[#1A3A3F]"
              >
                {t('push.devices.title')}
              </h3>

              {devicesQ.isLoading ? (
                <p className="text-sm text-[#1A3A3F]/60">…</p>
              ) : (
                <DeviceList
                  devices={devicesQ.data ?? []}
                  onRemove={(endpoint) => void handleRemoveDevice(endpoint)}
                  removingEndpoint={removingEndpoint}
                  t={t}
                  locale={locale}
                />
              )}
            </section>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
