'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Button, Input, Label } from '@vetlla/ui';

// Confirmación accesible para acciones destructivas (UX-03) y, opcionalmente,
// con motivo obligatorio (UX-17, p. ej. medicación no administrada).
interface ReasonField {
  label: string;
  required?: boolean;
  placeholder?: string;
}
interface ConfirmOptions {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'danger' | 'default';
  reason?: ReasonField;
}
export interface ConfirmResult {
  reason?: string;
}

type Resolver = (value: ConfirmResult | null) => void;

interface ConfirmContextValue {
  confirm: (options: ConfirmOptions) => Promise<ConfirmResult | null>;
}

const ConfirmContext = createContext<ConfirmContextValue | null>(null);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const [reasonValue, setReasonValue] = useState('');
  const [error, setError] = useState('');
  const resolverRef = useRef<Resolver | null>(null);
  const confirmBtnRef = useRef<HTMLButtonElement>(null);

  const close = useCallback((result: ConfirmResult | null) => {
    resolverRef.current?.(result);
    resolverRef.current = null;
    setOptions(null);
    setReasonValue('');
    setError('');
  }, []);

  const confirm = useCallback((opts: ConfirmOptions) => {
    setOptions(opts);
    return new Promise<ConfirmResult | null>((resolve) => {
      resolverRef.current = resolve;
    });
  }, []);

  useEffect(() => {
    if (!options) return;
    confirmBtnRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [options, close]);

  function onConfirm() {
    if (options?.reason?.required && reasonValue.trim() === '') {
      setError('Este campo es obligatorio.');
      return;
    }
    close({ reason: reasonValue.trim() || undefined });
  }

  return (
    <ConfirmContext.Provider value={{ confirm }}>
      {children}
      {options && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4"
          onClick={() => close(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirm-title"
            className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="confirm-title" className="text-lg font-semibold">
              {options.title}
            </h2>
            {options.description && (
              <p className="mt-2 text-sm text-slate-600">{options.description}</p>
            )}
            {options.reason && (
              <div className="mt-4">
                <Label htmlFor="confirm-reason">{options.reason.label}</Label>
                <Input
                  id="confirm-reason"
                  value={reasonValue}
                  placeholder={options.reason.placeholder}
                  onChange={(e) => setReasonValue(e.target.value)}
                  aria-invalid={Boolean(error)}
                  aria-describedby={error ? 'confirm-reason-error' : undefined}
                />
                {error && (
                  <p id="confirm-reason-error" role="alert" className="mt-1 text-sm text-red-600">
                    {error}
                  </p>
                )}
              </div>
            )}
            <div className="mt-6 flex justify-end gap-2">
              <Button variant="secondary" onClick={() => close(null)}>
                {options.cancelLabel ?? 'Cancelar'}
              </Button>
              <Button
                ref={confirmBtnRef}
                variant={options.tone === 'danger' ? 'danger' : 'primary'}
                onClick={onConfirm}
              >
                {options.confirmLabel ?? 'Confirmar'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): ConfirmContextValue['confirm'] {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirm debe usarse dentro de ConfirmProvider');
  return ctx.confirm;
}
