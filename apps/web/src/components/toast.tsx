'use client';

import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from 'react';
import {
  ToastAction as ToastActionPrimitive,
  ToastClose,
  ToastProviderPrimitive,
  ToastRoot,
  ToastTitle,
  ToastViewport,
} from '@vetlla/ui';

// Sistema de notificaciones (UX-04) sobre Radix Toast (UX-08): región
// aria-live gestionada, foco con teclado (F8), descarte por gesto/teclado y
// pausa al pasar el ratón. La API imperativa (toast/success/error) se mantiene.
type ToastType = 'success' | 'error' | 'info';
interface ToastAction {
  label: string;
  onClick: () => void;
}
interface ToastItem {
  id: number;
  type: ToastType;
  message: string;
  action?: ToastAction;
}

interface ToastContextValue {
  toast: (message: string, type?: ToastType, action?: ToastAction) => void;
  success: (message: string, action?: ToastAction) => void;
  error: (message: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

let counter = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const remove = useCallback((id: number) => {
    setToasts((list) => list.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback(
    (message: string, type: ToastType = 'info', action?: ToastAction) => {
      const id = ++counter;
      setToasts((list) => [...list, { id, type, message, action }]);
    },
    [],
  );

  const success = useCallback(
    (m: string, action?: ToastAction) => toast(m, 'success', action),
    [toast],
  );
  const error = useCallback((m: string) => toast(m, 'error'), [toast]);

  return (
    <ToastContext.Provider value={{ toast, success, error }}>
      <ToastProviderPrimitive swipeDirection="right">
        {children}
        {toasts.map((t) => (
          <ToastRoot
            key={t.id}
            tone={t.type}
            // Las que llevan acción (p. ej. deshacer) duran más.
            duration={t.action ? 7000 : 4500}
            // Los errores se anuncian de forma asertiva.
            type={t.type === 'error' ? 'foreground' : 'background'}
            onOpenChange={(open) => {
              if (!open) remove(t.id);
            }}
          >
            <ToastTitle>{t.message}</ToastTitle>
            <span className="flex items-center gap-2">
              {t.action && (
                <ToastActionPrimitive
                  altText={t.action.label}
                  onClick={() => {
                    t.action?.onClick();
                    remove(t.id);
                  }}
                  className="font-semibold underline underline-offset-2"
                >
                  {t.action.label}
                </ToastActionPrimitive>
              )}
              <ToastClose aria-label="Cerrar" className="text-slate-400 hover:text-slate-700">
                ×
              </ToastClose>
            </span>
          </ToastRoot>
        ))}
        <ToastViewport />
      </ToastProviderPrimitive>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast debe usarse dentro de ToastProvider');
  return ctx;
}
