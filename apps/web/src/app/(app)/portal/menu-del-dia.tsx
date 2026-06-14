'use client';

/**
 * MenuDelDia — Tarjeta del menú del día para el portal del familiar (RF-NUT-005).
 *
 * Llama a nutrition.menu.forFamily (permiso portal:read).
 * Solo muestra el menú estándar (no platos alternativos internos).
 * Lenguaje cercano; alérgenos siempre visibles. Mobile-first.
 */

import { Card, CardContent, CardTitle, Skeleton } from '@vetlla/ui';
import { api } from '@/trpc/react';
import { useT } from '@/i18n/provider';
import { formatDate } from '@/lib/format';
import { AllergenChip } from '@/components/allergen-chip';
import type { AllergenValue } from '@/lib/schemas/nutrition';

const MEAL_ORDER = ['DESAYUNO', 'COMIDA', 'MERIENDA', 'CENA'] as const;
type MealType = (typeof MEAL_ORDER)[number];

interface MenuDelDiaProps {
  residentId: string;
}

export function MenuDelDia({ residentId }: MenuDelDiaProps) {
  const { t, locale } = useT();
  const today = new Date();

  const query = api.nutrition.menu.forFamily.useQuery({
    residentId,
    date: today,
  });

  const MEAL_LABELS: Record<MealType, string> = {
    DESAYUNO: t('meal.DESAYUNO'),
    COMIDA:   t('meal.COMIDA'),
    MERIENDA: t('meal.MERIENDA'),
    CENA:     t('meal.CENA'),
  };

  const items = query.data ?? [];

  // Agrupar platos por comida
  const byMeal = new Map<MealType, typeof items>();
  for (const m of MEAL_ORDER) byMeal.set(m, []);
  for (const item of items) {
    const arr = byMeal.get(item.meal as MealType) ?? [];
    arr.push(item);
    byMeal.set(item.meal as MealType, arr);
  }

  const allergens = (raw: unknown): AllergenValue[] =>
    Array.isArray(raw) ? (raw as AllergenValue[]) : [];

  // Solo mostrar comidas con platos
  const mealsWith = MEAL_ORDER.filter((m) => (byMeal.get(m) ?? []).length > 0);

  return (
    <section aria-labelledby="menu-title">
      <Card>
        <CardContent className="flex flex-col gap-4">
          <div>
            <CardTitle id="menu-title" className="text-base">
              {t('portal.menu.title')}
            </CardTitle>
            <p className="text-sm text-[#1A3A3F]/60">
              {t('portal.menu.subtitle')} · {formatDate(locale, today)}
            </p>
          </div>

          {query.isLoading ? (
            <div className="flex flex-col gap-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : mealsWith.length === 0 ? (
            <p className="rounded-xl bg-brand-50 px-3 py-2.5 text-sm text-[#1A3A3F]/60">
              {t('portal.menu.noMenu')}
            </p>
          ) : (
            <ul className="flex flex-col gap-4">
              {mealsWith.map((meal) => {
                const dishes = byMeal.get(meal) ?? [];
                return (
                  <li key={meal}>
                    <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-widest text-[#1A3A3F]/40">
                      {MEAL_LABELS[meal]}
                    </h3>
                    <ul className="flex flex-col gap-2">
                      {dishes.map((dish) => {
                        const dishAllergens = allergens(dish.allergens);
                        return (
                          <li
                            key={dish.id}
                            className="rounded-xl border border-brand-100/60 bg-[#FAF7F2] px-3 py-2.5"
                          >
                            <p className="font-medium text-[#1A3A3F]">{dish.dishName}</p>
                            {dish.description && (
                              <p className="mt-0.5 text-sm text-[#1A3A3F]/60">{dish.description}</p>
                            )}
                            {dishAllergens.length > 0 && (
                              <div className="mt-2 flex flex-wrap items-center gap-1">
                                <span className="text-xs text-[#1A3A3F]/40">
                                  {t('portal.menu.allergens')}
                                </span>
                                {dishAllergens.map((a) => (
                                  <AllergenChip key={a} allergen={a} locale={locale} size="xs" />
                                ))}
                              </div>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
