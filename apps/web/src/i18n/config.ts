export const LOCALES = ['es', 'ca'] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'es';
export const LOCALE_COOKIE = 'vetlla-locale';

export const LOCALE_LABELS: Record<Locale, string> = {
  es: 'Castellano',
  ca: 'Català',
};

export function isLocale(value: string | undefined): value is Locale {
  return value === 'es' || value === 'ca';
}
