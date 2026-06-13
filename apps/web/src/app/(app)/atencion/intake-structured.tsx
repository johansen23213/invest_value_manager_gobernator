'use client';

/**
 * IntakeStructured — Registro estructurado de ingesta (RF-NUT-006/007).
 *
 * Complementa el CareRecord(INGESTA) offline-first de /atencion con un
 * registro normalizado por MealType + foodPct + hidratación.
 * Solo necesita conexión (IntakeRecord no tiene offline path propio).
 *
 * Se renderiza como sección adicional en la pantalla de atención directa
 * cuando hay un residente seleccionado.
 */

import { useState } from 'react';
import { Badge, Button, Card, CardContent, CardTitle, Label, Skeleton } from '@vetlla/ui';
import { api } from '@/trpc/react';
import { useT } from '@/i18n/provider';
import { useToast } from '@/components/toast';
import { formatDate } from '@/lib/format';

const MEAL_ORDER = ['DESAYUNO', 'COMIDA', 'MERIENDA', 'CENA'] as const;
type MealType = (typeof MEAL_ORDER)[number];

const INTAKE_LEVELS = [0, 25, 50, 75, 100] as const;

function intakeTone(pct: number): 'red' | 'amber' | 'green' {
  if (pct <= 25) return 'red';
  if (pct <= 50) return 'amber';
  return 'green';
}

interface IntakeStructuredProps {
  residentId: string;
  online: boolean;
}

export function IntakeStructured({ residentId, online }: IntakeStructuredProps) {
  const { t, locale } = useT();
  const toast = useToast();

  const [meal, setMeal] = useState<MealType>('COMIDA');
  const [foodPct, setFoodPct] = useState<number>(100);
  const [hydrationMl, setHydrationMl] = useState('');
  const [notes, setNotes] = useState('');

  const MEAL_LABELS: Record<MealType, string> = {
    DESAYUNO: t('meal.DESAYUNO'),
    COMIDA:   t('meal.COMIDA'),
    MERIENDA: t('meal.MERIENDA'),
    CENA:     t('meal.CENA'),
  };

  const recordMutation = api.nutrition.intake.record.useMutation({
    onSuccess: () => {
      toast.success(t('intake.saved'));
      setHydrationMl('');
      setNotes('');
      void historyQuery.refetch();
    },
    onError: () => toast.error('Error al registrar la ingesta.'),
  });

  // Historial reciente: últimos 7 días
  const dateFrom = new Date();
  dateFrom.setDate(dateFrom.getDate() - 7);
  const historyQuery = api.nutrition.intake.listByResident.useQuery(
    { residentId, dateFrom },
    { enabled: online },
  );

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const hydration = hydrationMl.trim() ? parseInt(hydrationMl, 10) : undefined;
    if (hydration !== undefined && (isNaN(hydration) || hydration < 0)) return;

    recordMutation.mutate({
      residentId,
      date: new Date(),
      meal,
      foodPct,
      hydrationMl: hydration,
      notes: notes.trim() || undefined,
    });
  }

  return (
    <Card>
      <CardContent>
        <CardTitle className="mb-4 text-base">{t('intake.title')}</CardTitle>

        {!online && (
          <p className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            El registro estructurado de ingesta requiere conexión.
          </p>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {/* Comida */}
          <div>
            <Label htmlFor="intake-meal">{t('intake.meal')}</Label>
            <select
              id="intake-meal"
              value={meal}
              onChange={(e) => setMeal(e.target.value as MealType)}
              disabled={!online}
              className="min-h-[44px] w-full rounded-2xl border border-brand-200 bg-white px-3 py-2 text-base text-[#1A3A3F] focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30 disabled:opacity-50"
            >
              {MEAL_ORDER.map((m) => (
                <option key={m} value={m}>{MEAL_LABELS[m]}</option>
              ))}
            </select>
          </div>

          {/* Botones de porcentaje — grandes, táctiles (WCAG 2.5.5) */}
          <fieldset>
            <legend className="mb-2 text-sm font-medium text-[#1A3A3F]">
              {t('intake.foodPct')}
            </legend>
            <div className="flex gap-2" role="group" aria-label={t('intake.foodPct')}>
              {INTAKE_LEVELS.map((p) => (
                <button
                  key={p}
                  type="button"
                  disabled={!online}
                  onClick={() => setFoodPct(p)}
                  aria-pressed={foodPct === p}
                  className={`min-h-[56px] flex-1 rounded-full border text-base font-semibold transition-colors disabled:opacity-50 ${
                    foodPct === p
                      ? 'border-brand-700 bg-brand-700 text-white'
                      : 'border-brand-200 bg-white text-[#1A3A3F] hover:bg-brand-50 hover:border-brand-400'
                  }`}
                >
                  {p}%
                </button>
              ))}
            </div>
          </fieldset>

          {/* Hidratación */}
          <div>
            <Label htmlFor="intake-hydration">{t('intake.hydrationMl')}</Label>
            <input
              id="intake-hydration"
              type="number"
              inputMode="numeric"
              min={0}
              max={5000}
              value={hydrationMl}
              onChange={(e) => setHydrationMl(e.target.value)}
              placeholder={t('intake.hydrationPh')}
              disabled={!online}
              className="min-h-[44px] w-full rounded-2xl border border-brand-200 bg-white px-3 py-2 text-base text-[#1A3A3F] placeholder:text-[#1A3A3F]/40 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30 disabled:opacity-50"
            />
          </div>

          {/* Notas */}
          <div>
            <Label htmlFor="intake-notes">{t('intake.notes')}</Label>
            <textarea
              id="intake-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={t('intake.notesPh')}
              maxLength={1000}
              rows={2}
              disabled={!online}
              className="w-full rounded-2xl border border-brand-200 bg-white px-3 py-2 text-base text-[#1A3A3F] placeholder:text-[#1A3A3F]/40 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30 disabled:opacity-50"
            />
          </div>

          <Button
            type="submit"
            size="lg"
            className="w-full"
            disabled={!online || recordMutation.isPending}
          >
            {recordMutation.isPending ? t('intake.submitting') : t('intake.submit')}
          </Button>
        </form>

        {/* Historial reciente */}
        <div className="mt-6">
          <h3 className="mb-2 text-sm font-semibold text-[#1A3A3F]">{t('intake.history')}</h3>
          {!online ? (
            <p className="text-sm text-[#1A3A3F]/40">Sin conexión: el historial se mostrará al volver online.</p>
          ) : historyQuery.isLoading ? (
            <div className="flex flex-col gap-1">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-8 w-full" />
              ))}
            </div>
          ) : (historyQuery.data ?? []).length === 0 ? (
            <p className="text-sm text-[#1A3A3F]/40">{t('intake.historyEmpty')}</p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {(historyQuery.data ?? []).slice(0, 14).map((rec) => {
                const mealLabel = MEAL_LABELS[rec.meal as MealType] ?? rec.meal;
                return (
                  <li
                    key={rec.id}
                    className="flex items-center justify-between rounded-xl bg-brand-50 px-3 py-2 text-sm"
                  >
                    <div className="flex items-center gap-2">
                      <Badge tone={intakeTone(rec.foodPct)}>
                        {rec.foodPct}%
                      </Badge>
                      <span className="text-[#1A3A3F]/70">{mealLabel}</span>
                      {rec.hydrationMl && (
                        <span className="text-xs text-[#1A3A3F]/40">· {rec.hydrationMl} ml</span>
                      )}
                      {rec.notes && (
                        <span className="truncate max-w-[120px] text-xs text-[#1A3A3F]/50 italic">{rec.notes}</span>
                      )}
                    </div>
                    <time
                      dateTime={rec.date instanceof Date ? rec.date.toISOString() : String(rec.date)}
                      className="text-xs text-[#1A3A3F]/40"
                    >
                      {formatDate(locale, rec.date)}
                    </time>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
