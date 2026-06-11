'use client';

import { createContext, useCallback, useContext, type ReactNode } from 'react';
import { translate } from './dictionaries';
import type { Locale } from './config';

interface I18nContextValue {
  locale: Locale;
  t: (key: string, vars?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ locale, children }: { locale: Locale; children: ReactNode }) {
  const t = useCallback(
    (key: string, vars?: Record<string, string | number>) => translate(locale, key, vars),
    [locale],
  );
  return <I18nContext.Provider value={{ locale, t }}>{children}</I18nContext.Provider>;
}

export function useT(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useT debe usarse dentro de I18nProvider');
  return ctx;
}
