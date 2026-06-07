import type { Locale } from '@/i18n/config';

// Formateo localizado de fechas/horas (UX-01). Usa Intl según el idioma activo
// en lugar de cadenas fijas 'es-ES'.
const LOCALE_TAG: Record<Locale, string> = { es: 'es-ES', ca: 'ca-ES' };

type DateInput = Date | string | number | null | undefined;

export function formatDate(locale: Locale, value: DateInput): string {
  if (!value) return '—';
  return new Intl.DateTimeFormat(LOCALE_TAG[locale], { dateStyle: 'medium' }).format(new Date(value));
}

export function formatDateTime(locale: Locale, value: DateInput): string {
  if (!value) return '—';
  return new Intl.DateTimeFormat(LOCALE_TAG[locale], {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

export function formatTime(locale: Locale, value: DateInput): string {
  if (!value) return '—';
  return new Intl.DateTimeFormat(LOCALE_TAG[locale], { timeStyle: 'short' }).format(new Date(value));
}
