// Patrón de validación inline de formularios con Zod en cliente (UX-09).
// `collectFieldErrors` es pura y testable; `useZodForm` la envuelve con estado de React
// para mostrar errores por campo bajo cada input, sin esperar al error del servidor.

import { useState } from 'react';
import type { z } from 'zod';

/** Errores por campo: clave = ruta del campo ('score', 'phone'…), valor = mensaje. */
export type FieldErrors = Record<string, string>;

/** Convierte un ZodError en un mapa campo→mensaje (el primer error de cada campo). */
export function collectFieldErrors(error: z.ZodError): FieldErrors {
  const out: FieldErrors = {};
  for (const issue of error.issues) {
    const key = issue.path.length > 0 ? issue.path.join('.') : '_form';
    if (!(key in out)) out[key] = issue.message;
  }
  return out;
}

export interface ZodFormApi<T> {
  /** Errores actuales por campo. */
  errors: FieldErrors;
  /**
   * Valida `values` contra el esquema. Si es válido limpia los errores y devuelve los
   * datos parseados; si no, fija los errores por campo y devuelve `null`.
   */
  validate: (values: unknown) => T | null;
  /** Fija manualmente el error de un campo (p. ej. tras un error del servidor). */
  setError: (field: string, message: string) => void;
  /** Limpia todos los errores. */
  clearErrors: () => void;
}

/** Hook de validación: valida en submit y expone errores por campo para la UI. */
export function useZodForm<S extends z.ZodTypeAny>(schema: S): ZodFormApi<z.infer<S>> {
  const [errors, setErrors] = useState<FieldErrors>({});

  return {
    errors,
    validate: (values: unknown): z.infer<S> | null => {
      const result = schema.safeParse(values);
      if (result.success) {
        setErrors({});
        return result.data;
      }
      setErrors(collectFieldErrors(result.error));
      return null;
    },
    setError: (field: string, message: string) =>
      setErrors((prev) => ({ ...prev, [field]: message })),
    clearErrors: () => setErrors({}),
  };
}
