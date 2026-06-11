'use client';

import { useRouter } from 'next/navigation';
import { LOCALES, LOCALE_COOKIE, LOCALE_LABELS } from './config';
import { useT } from './provider';

export function LocaleSwitcher() {
  const router = useRouter();
  const { locale } = useT();

  function setLocale(next: string) {
    document.cookie = `${LOCALE_COOKIE}=${next};path=/;max-age=31536000;samesite=lax`;
    router.refresh();
  }

  return (
    <div className="flex items-center gap-1" role="group" aria-label="Idioma">
      {LOCALES.map((l) => (
        <button
          key={l}
          type="button"
          onClick={() => setLocale(l)}
          aria-pressed={locale === l}
          className={`min-h-touch rounded-md px-2 py-1 text-xs font-medium ${
            locale === l ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          {LOCALE_LABELS[l]}
        </button>
      ))}
    </div>
  );
}
