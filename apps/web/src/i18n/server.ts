import { cookies } from 'next/headers';
import { DEFAULT_LOCALE, isLocale, LOCALE_COOKIE, type Locale } from './config';
import { translate } from './dictionaries';

/** Lee el idioma actual de la cookie (servidor). */
export async function getLocale(): Promise<Locale> {
  const store = await cookies();
  const value = store.get(LOCALE_COOKIE)?.value;
  return isLocale(value) ? value : DEFAULT_LOCALE;
}

/** Helper de traducción para Server Components. */
export async function getT() {
  const locale = await getLocale();
  return {
    locale,
    t: (key: string, vars?: Record<string, string | number>) => translate(locale, key, vars),
  };
}
