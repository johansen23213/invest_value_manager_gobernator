'use client';

/**
 * AllergenChip — píldora de alérgeno con texto + color semántico.
 * Color NO es el único canal (WCAG 1.4.1): siempre hay texto.
 * Los 14 alérgenos de declaración obligatoria UE (Reg. 1169/2011).
 */

import type { AllergenValue } from '@/server/routers/nutrition';

// Clase Tailwind base + color de fondo/texto por alérgeno.
// Usamos tonos semánticos cálidos para mantener la dirección de arte Vetlla.
const ALLERGEN_COLORS: Record<AllergenValue, string> = {
  GLUTEN:         'bg-amber-50 text-amber-800 border-amber-200',
  CRUSTACEOS:     'bg-orange-50 text-orange-800 border-orange-200',
  HUEVOS:         'bg-yellow-50 text-yellow-800 border-yellow-200',
  PESCADO:        'bg-blue-50 text-blue-800 border-blue-200',
  CACAHUETES:     'bg-warm-50 text-warm-700 border-warm-200',
  SOJA:           'bg-green-50 text-green-800 border-green-200',
  LACTEOS:        'bg-sky-50 text-sky-800 border-sky-200',
  FRUTOS_CASCARA: 'bg-amber-50 text-amber-800 border-amber-200',
  APIO:           'bg-lime-50 text-lime-800 border-lime-200',
  MOSTAZA:        'bg-yellow-50 text-yellow-800 border-yellow-200',
  SESAMO:         'bg-stone-50 text-stone-700 border-stone-200',
  SULFITOS:       'bg-purple-50 text-purple-800 border-purple-200',
  ALTRAMUCES:     'bg-teal-50 text-teal-800 border-teal-200',
  MOLUSCOS:       'bg-indigo-50 text-indigo-800 border-indigo-200',
};

const ALLERGEN_LABELS: Record<AllergenValue, string> = {
  GLUTEN:         'Gluten',
  CRUSTACEOS:     'Crustáceos',
  HUEVOS:         'Huevos',
  PESCADO:        'Pescado',
  CACAHUETES:     'Cacahuetes',
  SOJA:           'Soja',
  LACTEOS:        'Lácteos',
  FRUTOS_CASCARA: 'Frutos de cáscara',
  APIO:           'Apio',
  MOSTAZA:        'Mostaza',
  SESAMO:         'Sésamo',
  SULFITOS:       'Sulfitos',
  ALTRAMUCES:     'Altramuces',
  MOLUSCOS:       'Moluscos',
};

// Etiquetas en catalán (seleccionadas por la prop locale)
const ALLERGEN_LABELS_CA: Record<AllergenValue, string> = {
  GLUTEN:         'Gluten',
  CRUSTACEOS:     'Crustacis',
  HUEVOS:         'Ous',
  PESCADO:        'Peix',
  CACAHUETES:     'Cacauets',
  SOJA:           'Soja',
  LACTEOS:        'Lactis',
  FRUTOS_CASCARA: 'Fruites de closca',
  APIO:           'Api',
  MOSTAZA:        'Mostassa',
  SESAMO:         'Sèsam',
  SULFITOS:       'Sulfits',
  ALTRAMUCES:     'Tramús',
  MOLUSCOS:       'Mol·luscos',
};

interface AllergenChipProps {
  allergen: AllergenValue;
  locale?: string;
  size?: 'sm' | 'xs';
}

export function AllergenChip({ allergen, locale = 'es', size = 'sm' }: AllergenChipProps) {
  const label =
    locale === 'ca'
      ? (ALLERGEN_LABELS_CA[allergen] ?? allergen)
      : (ALLERGEN_LABELS[allergen] ?? allergen);
  const colorClass = ALLERGEN_COLORS[allergen] ?? 'bg-brand-50 text-brand-700 border-brand-200';
  const sizeClass = size === 'xs' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-xs';

  return (
    <span
      className={`inline-flex items-center rounded-full border font-medium ${sizeClass} ${colorClass}`}
    >
      {label}
    </span>
  );
}

interface AllergenListProps {
  allergens: AllergenValue[];
  locale?: string;
  emptyLabel?: string;
  size?: 'sm' | 'xs';
}

export function AllergenList({ allergens, locale, emptyLabel, size }: AllergenListProps) {
  if (allergens.length === 0) {
    return emptyLabel ? (
      <span className="text-xs text-[#1A3A3F]/40">{emptyLabel}</span>
    ) : null;
  }
  return (
    <div className="flex flex-wrap gap-1" role="list" aria-label="Alérgenos">
      {allergens.map((a) => (
        <div key={a} role="listitem">
          <AllergenChip allergen={a} locale={locale} size={size} />
        </div>
      ))}
    </div>
  );
}
