'use client';

/**
 * Tarjeta de gestión MFA (RNF-SEG-002).
 *
 * Estados:
 *  A) MFA desactivado → botón "Activar" → flujo setup→confirm→recovery codes.
 *  B) MFA activado    → muestra estado + recovery codes restantes + botones
 *                       "Regenerar códigos" y "Desactivar".
 *
 * Accesibilidad (WCAG 2.1 AA):
 *  - Labels asociados a inputs con htmlFor/id.
 *  - aria-live="polite" en la región de recovery codes.
 *  - role="alert" en mensajes de error.
 *  - Objetivos táctiles min-h-touch (48px) en todos los botones.
 *  - Focus gestionado: al mostrar recovery codes el h3 recibe focus.
 */

import { useRef, useState } from 'react';
import { z } from 'zod';
import { api } from '@/trpc/react';
import { useT } from '@/i18n/provider';
import { useToast } from '@/components/toast';
import { useZodForm } from '@/lib/form';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  FieldError,
  Input,
  Label,
} from '@vetlla/ui';

// ---------------------------------------------------------------------------
// Schemas Zod (reutilizando las mismas restricciones que el backend)
// ---------------------------------------------------------------------------

const totpSchema = z.object({
  code: z
    .string()
    .length(6, 'El código debe tener 6 dígitos.')
    .regex(/^\d{6}$/, 'Solo dígitos.'),
});

const disableSchema = z.object({
  password: z.string().min(1, 'La contraseña es obligatoria.'),
  totp: z.string().length(6).regex(/^\d{6}$/).optional().or(z.literal('')),
  recoveryCode: z.string().length(8).optional().or(z.literal('')),
});

const regenerateSchema = z.object({
  totp: z
    .string()
    .length(6, 'El código debe tener 6 dígitos.')
    .regex(/^\d{6}$/, 'Solo dígitos.'),
});

// ---------------------------------------------------------------------------
// Subcomponente: Lista de Recovery Codes
// ---------------------------------------------------------------------------

function RecoveryCodesList({
  codes,
  t,
  headingRef,
}: {
  codes: string[];
  t: (k: string) => string;
  headingRef?: React.RefObject<HTMLHeadingElement | null>;
}) {
  const handleCopy = () => {
    void navigator.clipboard.writeText(codes.join('\n'));
  };

  return (
    <div
      aria-live="polite"
      aria-atomic="true"
      className="rounded-2xl border border-amber-200 bg-amber-50 p-5"
    >
      <h3
        ref={headingRef}
        tabIndex={-1}
        className="mb-1 text-base font-semibold text-amber-900 focus:outline-none"
      >
        {t('mfa.setup.recoveryTitle')}
      </h3>
      <p className="mb-4 text-sm text-amber-800">{t('mfa.setup.recoveryHint')}</p>
      <ul className="mb-4 grid grid-cols-2 gap-1.5 font-mono text-sm text-amber-900">
        {codes.map((c) => (
          <li
            key={c}
            className="rounded-lg border border-amber-200 bg-white px-3 py-1.5 tracking-widest"
          >
            {c}
          </li>
        ))}
      </ul>
      <Button variant="secondary" size="sm" onClick={handleCopy} type="button">
        Copiar todos
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Subcomponente: Flujo Setup (setup → confirm → recovery)
// ---------------------------------------------------------------------------

function MfaSetupFlow({
  onDone,
  t,
}: {
  onDone: () => void;
  t: (k: string) => string;
}) {
  const [step, setStep] = useState<'idle' | 'qr' | 'recovery'>('idle');
  const [otpauthUrl, setOtpauthUrl] = useState<string | null>(null);
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const recoveryRef = useRef<HTMLHeadingElement | null>(null);
  const { error: toastError, success: toastSuccess } = useToast();

  const setupMut = api.mfa.setup.useMutation({
    onError: (err) => toastError(err.message),
  });
  const confirmMut = api.mfa.confirm.useMutation({
    onError: (err) => {
      if (err.message === 'MFA_INVALID') {
        form.setError('code', 'Código incorrecto. Comprueba tu aplicación.');
      } else {
        toastError(err.message);
      }
    },
  });

  const form = useZodForm(totpSchema);

  const handleStart = async () => {
    const result = await setupMut.mutateAsync();
    setOtpauthUrl(result.otpauthUrl);
    setStep('qr');
  };

  const handleConfirm = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const values = { code: (fd.get('code') as string) ?? '' };
    const data = form.validate(values);
    if (!data) return;
    const result = await confirmMut.mutateAsync({ code: data.code });
    setRecoveryCodes(result.recoveryCodes);
    setStep('recovery');
    toastSuccess(t('mfa.setup.success'));
    // Foco al heading de recovery codes para lector de pantalla
    requestAnimationFrame(() => recoveryRef.current?.focus());
  };

  if (step === 'idle') {
    return (
      <Button
        variant="primary"
        size="md"
        onClick={() => void handleStart()}
        disabled={setupMut.isPending}
        type="button"
      >
        {setupMut.isPending ? 'Iniciando…' : 'Activar'}
      </Button>
    );
  }

  if (step === 'recovery') {
    return (
      <div className="flex flex-col gap-4">
        <RecoveryCodesList codes={recoveryCodes} t={t} headingRef={recoveryRef} />
        <Button variant="primary" size="md" onClick={onDone} type="button">
          Entendido, ya los he guardado
        </Button>
      </div>
    );
  }

  // step === 'qr'
  return (
    <div className="flex flex-col gap-5">
      <p className="text-sm text-[#1A3A3F]/70">{t('mfa.setup.intro')}</p>

      {/* URL otpauth como texto copiable (no hay librería QR disponible) */}
      <div>
        <p
          id="qr-label"
          className="mb-2 text-sm font-semibold text-[#1A3A3F]"
        >
          {t('mfa.setup.qrLabel')} — introduce esta URL en tu app de autenticación:
        </p>
        <div
          aria-labelledby="qr-label"
          className="break-all rounded-2xl border border-brand-200 bg-brand-50 px-4 py-3 font-mono text-xs text-[#1A3A3F]"
        >
          {otpauthUrl}
        </div>
        <p className="mt-1 text-xs text-[#1A3A3F]/60">
          También puedes copiar y pegar esta URL en tu app (Google Authenticator, Authy, etc.) usando la opción &ldquo;introducir clave manualmente&rdquo;.
        </p>
      </div>

      {/* Formulario de confirmación */}
      <form
        onSubmit={(e) => void handleConfirm(e)}
        className="flex flex-col gap-4"
        aria-label={t('mfa.setup.title')}
        noValidate
      >
        <div className="flex flex-col gap-1">
          <Label htmlFor="mfa-code">{t('mfa.setup.codeLabel')}</Label>
          <Input
            id="mfa-code"
            name="code"
            type="text"
            inputMode="numeric"
            pattern="[0-9]{6}"
            maxLength={6}
            placeholder={t('mfa.setup.codePh')}
            autoComplete="one-time-code"
            aria-describedby={form.errors.code ? 'mfa-code-err' : undefined}
            aria-invalid={!!form.errors.code}
            className="max-w-[180px]"
          />
          <FieldError id="mfa-code-err">{form.errors.code}</FieldError>
        </div>

        <Button
          type="submit"
          variant="primary"
          size="md"
          disabled={confirmMut.isPending}
          className="self-start"
        >
          {confirmMut.isPending ? t('mfa.setup.confirming') : t('mfa.setup.confirm')}
        </Button>
      </form>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Subcomponente: Desactivar MFA
// ---------------------------------------------------------------------------

function MfaDisableForm({
  onDone,
  t,
}: {
  onDone: () => void;
  t: (k: string) => string;
}) {
  const [useRecovery, setUseRecovery] = useState(false);
  const { error: toastError, success: toastSuccess } = useToast();
  const utils = api.useUtils();

  const disableMut = api.mfa.disable.useMutation({
    onSuccess: () => {
      void utils.mfa.status.invalidate();
      toastSuccess(t('mfa.disable.success'));
      onDone();
    },
    onError: (err) => {
      if (err.message === 'MFA_INVALID') {
        form.setError(useRecovery ? 'recoveryCode' : 'totp', 'Código incorrecto.');
      } else if (err.message === 'Contraseña incorrecta.') {
        form.setError('password', 'Contraseña incorrecta.');
      } else {
        toastError(err.message);
      }
    },
  });

  const form = useZodForm(disableSchema);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const raw = {
      password: (fd.get('password') as string) ?? '',
      totp: (fd.get('totp') as string) ?? '',
      recoveryCode: (fd.get('recoveryCode') as string) ?? '',
    };
    const data = form.validate(raw);
    if (!data) return;

    await disableMut.mutateAsync({
      password: data.password,
      totp: data.totp || undefined,
      recoveryCode: data.recoveryCode || undefined,
    });
  };

  return (
    <form
      onSubmit={(e) => void handleSubmit(e)}
      className="flex flex-col gap-4"
      aria-label={t('mfa.disable.title')}
      noValidate
    >
      <p className="text-sm text-[#1A3A3F]/70">{t('mfa.disable.intro')}</p>

      {/* Contraseña */}
      <div className="flex flex-col gap-1">
        <Label htmlFor="disable-password">{t('mfa.disable.password')}</Label>
        <Input
          id="disable-password"
          name="password"
          type="password"
          autoComplete="current-password"
          aria-describedby={form.errors.password ? 'disable-password-err' : undefined}
          aria-invalid={!!form.errors.password}
          className="max-w-xs"
        />
        <FieldError id="disable-password-err">{form.errors.password}</FieldError>
      </div>

      {/* TOTP o Recovery Code */}
      {!useRecovery ? (
        <div className="flex flex-col gap-1">
          <Label htmlFor="disable-totp">{t('mfa.disable.totp')}</Label>
          <Input
            id="disable-totp"
            name="totp"
            type="text"
            inputMode="numeric"
            pattern="[0-9]{6}"
            maxLength={6}
            placeholder={t('mfa.totp.ph')}
            autoComplete="one-time-code"
            aria-describedby={form.errors.totp ? 'disable-totp-err' : undefined}
            aria-invalid={!!form.errors.totp}
            className="max-w-[180px]"
          />
          <FieldError id="disable-totp-err">{form.errors.totp}</FieldError>
          <button
            type="button"
            className="mt-1 self-start text-sm text-brand-600 hover:underline"
            onClick={() => setUseRecovery(true)}
          >
            {t('mfa.totp.useRecovery')}
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-1">
          <Label htmlFor="disable-recovery">{t('mfa.disable.recovery')}</Label>
          <Input
            id="disable-recovery"
            name="recoveryCode"
            type="text"
            maxLength={8}
            placeholder={t('mfa.recovery.ph')}
            autoComplete="off"
            aria-describedby={form.errors.recoveryCode ? 'disable-recovery-err' : undefined}
            aria-invalid={!!form.errors.recoveryCode}
            className="max-w-[220px]"
          />
          <FieldError id="disable-recovery-err">{form.errors.recoveryCode}</FieldError>
          <button
            type="button"
            className="mt-1 self-start text-sm text-brand-600 hover:underline"
            onClick={() => setUseRecovery(false)}
          >
            Usar código TOTP en su lugar
          </button>
        </div>
      )}

      <div className="flex gap-3">
        <Button
          type="submit"
          variant="danger"
          size="md"
          disabled={disableMut.isPending}
        >
          {disableMut.isPending ? t('mfa.disable.submitting') : t('mfa.disable.submit')}
        </Button>
        <Button type="button" variant="secondary" size="md" onClick={onDone}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Subcomponente: Regenerar Recovery Codes
// ---------------------------------------------------------------------------

function MfaRegenerateForm({
  onDone,
  t,
}: {
  onDone: () => void;
  t: (k: string) => string;
}) {
  const [newCodes, setNewCodes] = useState<string[]>([]);
  const recoveryRef = useRef<HTMLHeadingElement | null>(null);
  const { error: toastError, success: toastSuccess } = useToast();
  const utils = api.useUtils();

  const regenerateMut = api.mfa.regenerateRecoveryCodes.useMutation({
    onSuccess: (data) => {
      void utils.mfa.status.invalidate();
      setNewCodes(data.recoveryCodes);
      toastSuccess(t('mfa.regenerate.success'));
      requestAnimationFrame(() => recoveryRef.current?.focus());
    },
    onError: (err) => {
      if (err.message === 'MFA_INVALID') {
        form.setError('totp', 'Código incorrecto.');
      } else {
        toastError(err.message);
      }
    },
  });

  const form = useZodForm(regenerateSchema);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const values = { totp: (fd.get('totp') as string) ?? '' };
    const data = form.validate(values);
    if (!data) return;
    await regenerateMut.mutateAsync({ totp: data.totp });
  };

  if (newCodes.length > 0) {
    return (
      <div className="flex flex-col gap-4">
        <RecoveryCodesList codes={newCodes} t={t} headingRef={recoveryRef} />
        <Button variant="primary" size="md" onClick={onDone} type="button">
          Entendido, ya los he guardado
        </Button>
      </div>
    );
  }

  return (
    <form
      onSubmit={(e) => void handleSubmit(e)}
      className="flex flex-col gap-4"
      aria-label={t('mfa.regenerate.title')}
      noValidate
    >
      <p className="text-sm text-[#1A3A3F]/70">{t('mfa.regenerate.intro')}</p>

      <div className="flex flex-col gap-1">
        <Label htmlFor="regen-totp">{t('mfa.totp.label')}</Label>
        <Input
          id="regen-totp"
          name="totp"
          type="text"
          inputMode="numeric"
          pattern="[0-9]{6}"
          maxLength={6}
          placeholder={t('mfa.totp.ph')}
          autoComplete="one-time-code"
          aria-describedby={form.errors.totp ? 'regen-totp-err' : undefined}
          aria-invalid={!!form.errors.totp}
          className="max-w-[180px]"
        />
        <FieldError id="regen-totp-err">{form.errors.totp}</FieldError>
      </div>

      <div className="flex gap-3">
        <Button
          type="submit"
          variant="primary"
          size="md"
          disabled={regenerateMut.isPending}
        >
          {regenerateMut.isPending
            ? t('mfa.regenerate.submitting')
            : t('mfa.regenerate.submit')}
        </Button>
        <Button type="button" variant="secondary" size="md" onClick={onDone}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Componente principal: MfaCard
// ---------------------------------------------------------------------------

type ActivePanel = null | 'setup' | 'disable' | 'regenerate';

export function MfaCard() {
  const { t } = useT();
  const [activePanel, setActivePanel] = useState<ActivePanel>(null);
  const utils = api.useUtils();

  const statusQ = api.mfa.status.useQuery();
  const status = statusQ.data;

  const handlePanelDone = () => {
    setActivePanel(null);
    void utils.mfa.status.invalidate();
  };

  const isEnabled = status?.enabled ?? false;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <CardTitle>{t('cuenta.seguridad.title')}</CardTitle>
          {statusQ.isLoading ? null : isEnabled ? (
            <Badge tone="green">{t('mfa.status.enabled')}</Badge>
          ) : (
            <Badge tone="neutral">{t('mfa.status.disabled')}</Badge>
          )}
        </div>
      </CardHeader>

      <CardContent>
        {statusQ.isLoading ? (
          <p className="text-sm text-[#1A3A3F]/60">{t('state.loading')}</p>
        ) : !isEnabled ? (
          /* ── Estado: MFA desactivado ────────────────────────────────────── */
          activePanel === 'setup' ? (
            <MfaSetupFlow
              onDone={handlePanelDone}
              t={t}
            />
          ) : (
            <div className="flex flex-col gap-4">
              <p className="text-sm text-[#1A3A3F]/70">
                {t('mfa.description')}
              </p>
              <Button
                variant="primary"
                size="md"
                className="self-start"
                onClick={() => setActivePanel('setup')}
                type="button"
              >
                {t('mfa.activate')}
              </Button>
            </div>
          )
        ) : (
          /* ── Estado: MFA activado ───────────────────────────────────────── */
          <div className="flex flex-col gap-5">
            {/* Info de estado */}
            {activePanel === null && (
              <div className="flex flex-col gap-3">
                <p className="text-sm text-[#1A3A3F]/70">
                  {t('mfa.status.recoveryCodes', {
                    count: status?.remainingRecoveryCodes ?? 0,
                  })}
                </p>
                {(status?.remainingRecoveryCodes ?? 0) <= 3 && (
                  <p role="alert" className="text-sm font-medium text-amber-700">
                    {t('mfa.codesLow')}
                  </p>
                )}

                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setActivePanel('regenerate')}
                    type="button"
                  >
                    {t('mfa.regenerate.title')}
                  </Button>
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => setActivePanel('disable')}
                    type="button"
                  >
                    {t('mfa.disable.title')}
                  </Button>
                </div>
              </div>
            )}

            {/* Panel activo */}
            {activePanel === 'disable' && (
              <MfaDisableForm onDone={handlePanelDone} t={t} />
            )}
            {activePanel === 'regenerate' && (
              <MfaRegenerateForm onDone={handlePanelDone} t={t} />
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
