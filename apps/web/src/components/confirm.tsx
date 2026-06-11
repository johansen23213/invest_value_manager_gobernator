'use client';

import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
  Input,
  Label,
} from '@vetlla/ui';

// Confirmación accesible para acciones destructivas (UX-03) y, opcionalmente,
// con motivo obligatorio (UX-17, p. ej. medicación no administrada).
// Sobre Radix Dialog (UX-08): focus-trap, scroll-lock, retorno de foco y
// cierre con Escape/click fuera gestionados por la primitiva.
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

  const close = useCallback((result: ConfirmResult | null) => {
    resolverRef.current?.(result);
    resolverRef.current = null;
    setOptions(null);
    setReasonValue('');
    setError('');
  }, []);

  const confirm = useCallback((opts: ConfirmOptions) => {
    setOptions(opts);
    setReasonValue('');
    setError('');
    return new Promise<ConfirmResult | null>((resolve) => {
      resolverRef.current = resolve;
    });
  }, []);

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
      <Dialog open={options !== null} onOpenChange={(open) => !open && close(null)}>
        {options && (
          <DialogContent
            aria-describedby={undefined}
            onOpenAutoFocus={(e) => {
              // Con campo de motivo, enfoca el input; si no, deja el foco por defecto.
              if (options.reason) {
                e.preventDefault();
                inputAutoFocus();
              }
            }}
          >
            <DialogTitle>{options.title}</DialogTitle>
            {options.description && <DialogDescription>{options.description}</DialogDescription>}
            {options.reason && (
              <div className="mt-4">
                <Label htmlFor="confirm-reason">{options.reason.label}</Label>
                <Input
                  id="confirm-reason"
                  data-confirm-reason
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
            <DialogFooter>
              <Button variant="secondary" onClick={() => close(null)}>
                {options.cancelLabel ?? 'Cancelar'}
              </Button>
              <Button
                variant={options.tone === 'danger' ? 'danger' : 'primary'}
                onClick={onConfirm}
              >
                {options.confirmLabel ?? 'Confirmar'}
              </Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>
    </ConfirmContext.Provider>
  );
}

function inputAutoFocus() {
  // Tras montar el contenido, enfoca el campo de motivo.
  requestAnimationFrame(() => {
    const el = document.querySelector<HTMLInputElement>('[data-confirm-reason]');
    el?.focus();
  });
}

export function useConfirm(): ConfirmContextValue['confirm'] {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirm debe usarse dentro de ConfirmProvider');
  return ctx.confirm;
}
