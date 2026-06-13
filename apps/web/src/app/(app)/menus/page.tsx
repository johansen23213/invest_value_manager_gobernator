'use client';

/**
 * Pantalla Menús del centro + Listados de cocina (Épica C — RF-NUT-003/004/008/009).
 *
 * Dos pestañas:
 *   1. "Menú del día" — per MealType; el Director (centers:write) puede editar.
 *   2. "Cocina" — dietas y listado de comedor por comida/unidad; solo lectura, imprimible.
 *
 * RBAC: requiere care:read para entrar; edición solo visible con centers:write.
 */

import { useState, useMemo } from 'react';
import {
  Button,
  Dialog,
  DialogContent,
  DialogTitle,
  EmptyState,
  Input,
  Label,
  PageHeader,
  SectionCard,
  Skeleton,
} from '@vetlla/ui';
import { api } from '@/trpc/react';
import { useT } from '@/i18n/provider';
import { useToast } from '@/components/toast';
import { useConfirm } from '@/components/confirm';
import { formatDate } from '@/lib/format';
import { AllergenList } from '@/components/allergen-chip';
import { DIET_TYPE_LABELS, LIQUID_TEXTURE_LABELS } from '@/lib/labels';
import type { AllergenValue } from '@/server/routers/nutrition';

// ─── Constantes ──────────────────────────────────────────────────────────────

const MEAL_ORDER = ['DESAYUNO', 'COMIDA', 'MERIENDA', 'CENA'] as const;
type MealType = (typeof MEAL_ORDER)[number];

const ALL_ALLERGENS: AllergenValue[] = [
  'GLUTEN', 'CRUSTACEOS', 'HUEVOS', 'PESCADO', 'CACAHUETES', 'SOJA',
  'LACTEOS', 'FRUTOS_CASCARA', 'APIO', 'MOSTAZA', 'SESAMO', 'SULFITOS',
  'ALTRAMUCES', 'MOLUSCOS',
];

// ─── Helpers de fecha ────────────────────────────────────────────────────────

function toIsoDate(d: Date): string {
  return d.toISOString().split('T')[0] as string;
}

function offsetDate(d: Date, days: number): Date {
  const copy = new Date(d);
  copy.setDate(copy.getDate() + days);
  return copy;
}

// ─── Sub-componente: formulario de plato ─────────────────────────────────────

interface DishItem {
  id: string;
  meal: string;
  dishName: string;
  description: string | null;
  allergens: unknown;
  isAlternative: boolean;
}

interface DishFormProps {
  centerId: string;
  date: Date;
  initialMeal: MealType;
  item?: DishItem;
  onClose: () => void;
  onSaved: () => void;
}

function DishForm({ centerId, date, initialMeal, item, onClose, onSaved }: DishFormProps) {
  const { t } = useT();
  const toast = useToast();
  const upsert = api.nutrition.menu.upsert.useMutation({
    onSuccess: () => {
      toast.success(t('menus.saved'));
      onSaved();
      onClose();
    },
    onError: () => toast.error('Error al guardar el plato.'),
  });

  const [meal, setMeal] = useState<MealType>(
    (item?.meal as MealType | undefined) ?? initialMeal,
  );
  const [dishName, setDishName] = useState(item?.dishName ?? '');
  const [description, setDescription] = useState(item?.description ?? '');
  const [allergens, setAllergens] = useState<AllergenValue[]>(
    Array.isArray(item?.allergens) ? (item.allergens as AllergenValue[]) : [],
  );
  const [isAlternative, setIsAlternative] = useState(item?.isAlternative ?? false);

  function toggleAllergen(a: AllergenValue) {
    setAllergens((prev) =>
      prev.includes(a) ? prev.filter((x) => x !== a) : [...prev, a],
    );
  }

  const MEAL_LABELS: Record<MealType, string> = {
    DESAYUNO: t('meal.DESAYUNO'),
    COMIDA:   t('meal.COMIDA'),
    MERIENDA: t('meal.MERIENDA'),
    CENA:     t('meal.CENA'),
  };

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!dishName.trim()) return;
    upsert.mutate({
      id: item?.id,
      centerId,
      date,
      meal,
      dishName: dishName.trim(),
      description: description.trim() || undefined,
      allergens,
      isAlternative,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {/* Comida */}
      <div>
        <Label htmlFor="dish-meal">{t('menus.form.meal')}</Label>
        <select
          id="dish-meal"
          value={meal}
          onChange={(e) => setMeal(e.target.value as MealType)}
          className="min-h-[44px] w-full rounded-2xl border border-brand-200 bg-white px-3 py-2 text-base text-[#1A3A3F] focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
        >
          {MEAL_ORDER.map((m) => (
            <option key={m} value={m}>{MEAL_LABELS[m]}</option>
          ))}
        </select>
      </div>

      {/* Nombre del plato */}
      <div>
        <Label htmlFor="dish-name">{t('menus.form.dishName')}</Label>
        <Input
          id="dish-name"
          value={dishName}
          onChange={(e) => setDishName(e.target.value)}
          placeholder={t('menus.form.dishNamePh')}
          required
          minLength={1}
          maxLength={200}
          aria-required="true"
        />
      </div>

      {/* Descripción */}
      <div>
        <Label htmlFor="dish-desc">{t('menus.form.description')}</Label>
        <textarea
          id="dish-desc"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={t('menus.form.descriptionPh')}
          maxLength={1000}
          rows={3}
          className="w-full rounded-2xl border border-brand-200 bg-white px-3 py-2 text-base text-[#1A3A3F] focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
        />
      </div>

      {/* Alérgenos */}
      <fieldset>
        <legend className="mb-2 text-sm font-medium text-[#1A3A3F]">{t('menus.form.allergens')}</legend>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label={t('menus.form.allergens')}>
          {ALL_ALLERGENS.map((a) => {
            const checked = allergens.includes(a);
            // Reutilizamos la clave de i18n del alérgeno
            const label = t(`allergen.${a}`);
            return (
              <button
                key={a}
                type="button"
                role="checkbox"
                aria-checked={checked}
                onClick={() => toggleAllergen(a)}
                className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                  checked
                    ? 'border-brand-700 bg-brand-700 text-white'
                    : 'border-brand-200 bg-white text-[#1A3A3F]/70 hover:border-brand-400 hover:text-brand-700'
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
      </fieldset>

      {/* Alternativo */}
      <label className="flex items-center gap-2 text-sm text-[#1A3A3F]">
        <input
          type="checkbox"
          checked={isAlternative}
          onChange={(e) => setIsAlternative(e.target.checked)}
          className="h-4 w-4 rounded accent-brand-700"
        />
        {t('menus.form.isAlternative')}
      </label>

      <div className="flex justify-end gap-2 pt-1">
        <Button type="button" variant="secondary" size="sm" onClick={onClose}>
          {t('action.cancel')}
        </Button>
        <Button type="submit" size="sm" disabled={upsert.isPending || !dishName.trim()}>
          {upsert.isPending ? t('menus.form.submitting') : t('menus.form.submit')}
        </Button>
      </div>
    </form>
  );
}

// ─── Sub-componente: sección de comida ───────────────────────────────────────

interface MealSectionProps {
  meal: MealType;
  items: DishItem[];
  canEdit: boolean;
  centerId: string;
  date: Date;
  onRefetch: () => void;
  hideHeader?: boolean;
}

function MealSection({ meal, items, canEdit, centerId, date, onRefetch, hideHeader = false }: MealSectionProps) {
  const { t, locale } = useT();
  const toast = useToast();
  const confirm = useConfirm();
  const [formOpen, setFormOpen] = useState(false);
  const [editItem, setEditItem] = useState<DishItem | null>(null);

  const deleteMutation = api.nutrition.menu.delete.useMutation({
    onSuccess: () => {
      toast.success(t('menus.deleted'));
      onRefetch();
    },
    onError: () => toast.error('Error al eliminar el plato.'),
  });

  const MEAL_LABELS: Record<MealType, string> = {
    DESAYUNO: t('meal.DESAYUNO'),
    COMIDA:   t('meal.COMIDA'),
    MERIENDA: t('meal.MERIENDA'),
    CENA:     t('meal.CENA'),
  };

  async function handleDelete(id: string) {
    const result = await confirm({
      title: t('menus.deleteConfirmTitle'),
      description: t('menus.deleteConfirmDesc'),
      confirmLabel: t('menus.deleteDish'),
      tone: 'danger',
    });
    if (!result) return;
    deleteMutation.mutate({ id });
  }

  const toAllergens = (raw: unknown): AllergenValue[] =>
    Array.isArray(raw) ? (raw as AllergenValue[]) : [];

  return (
    <div>
      {!hideHeader ? (
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-widest text-[#1A3A3F]/40">
            {MEAL_LABELS[meal]}
          </h2>
          {canEdit && (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => { setEditItem(null); setFormOpen(true); }}
            >
              + {t('menus.addDish')}
            </Button>
          )}
        </div>
      ) : canEdit ? (
        <div className="mb-3 flex justify-end">
          <Button
            size="sm"
            variant="secondary"
            onClick={() => { setEditItem(null); setFormOpen(true); }}
          >
            + {t('menus.addDish')}
          </Button>
        </div>
      ) : null}

      {items.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-brand-100 px-4 py-3 text-sm text-[#1A3A3F]/40">
          {t('menus.empty')}
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((item) => (
            <li
              key={item.id}
              className="flex flex-col gap-1 rounded-2xl border border-brand-100/60 bg-white px-4 py-3 shadow-card sm:flex-row sm:items-start sm:justify-between"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-[#1A3A3F]">{item.dishName}</span>
                  {item.isAlternative && (
                    <span className="rounded-full bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-700">
                      {t('menus.alternative')}
                    </span>
                  )}
                </div>
                {item.description && (
                  <p className="mt-0.5 text-sm text-[#1A3A3F]/60">{item.description}</p>
                )}
                <div className="mt-2">
                  <AllergenList
                    allergens={toAllergens(item.allergens)}
                    locale={locale}
                    emptyLabel={t('menus.noAllergens')}
                    size="xs"
                  />
                </div>
              </div>
              {canEdit && (
                <div className="flex shrink-0 gap-2 self-start">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => { setEditItem(item); setFormOpen(true); }}
                    aria-label={`${t('menus.editDish')}: ${item.dishName}`}
                  >
                    {t('menus.editDish')}
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => void handleDelete(item.id)}
                    disabled={deleteMutation.isPending}
                    aria-label={`${t('menus.deleteDish')}: ${item.dishName}`}
                  >
                    {t('menus.deleteDish')}
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {/* Dialog formulario */}
      <Dialog
        open={formOpen}
        onOpenChange={(open) => { if (!open) setFormOpen(false); }}
      >
        <DialogContent>
          <DialogTitle>{editItem ? t('menus.editDish') : t('menus.addDish')}</DialogTitle>
          <div className="mt-4">
            <DishForm
              centerId={centerId}
              date={date}
              initialMeal={meal}
              item={editItem ?? undefined}
              onClose={() => setFormOpen(false)}
              onSaved={onRefetch}
            />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Pestaña Cocina ───────────────────────────────────────────────────────────

interface KitchenTabProps {
  centerId: string;
  date: Date;
}

function KitchenTab({ centerId, date }: KitchenTabProps) {
  const { t } = useT();
  const [groupByUnit, setGroupByUnit] = useState(false);
  const [selectedMeal, setSelectedMeal] = useState<MealType>('COMIDA');
  const [selectedUnitId, setSelectedUnitId] = useState('');

  const dietQuery = api.nutrition.kitchen.dietListing.useQuery({ centerId, date });
  const mealQuery = api.nutrition.kitchen.mealListing.useQuery({
    centerId,
    meal: selectedMeal,
    unitId: selectedUnitId || undefined,
  });

  const MEAL_LABELS: Record<MealType, string> = {
    DESAYUNO: t('meal.DESAYUNO'),
    COMIDA:   t('meal.COMIDA'),
    MERIENDA: t('meal.MERIENDA'),
    CENA:     t('meal.CENA'),
  };

  // Unidades únicas del listado de dietas
  const units = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of dietQuery.data ?? []) {
      if (r.bed?.unit) map.set(r.bed.unit.id, r.bed.unit.name);
    }
    return [...map.entries()].sort(([, a], [, b]) => a.localeCompare(b));
  }, [dietQuery.data]);

  // Agrupar dietas por unidad
  const dietGroups = useMemo(() => {
    const data = dietQuery.data ?? [];
    if (!groupByUnit) return [{ unitName: null as string | null, residents: data }];
    const groups = new Map<string, typeof data>();
    for (const r of data) {
      const key = r.bed?.unit.name ?? 'Sin unidad';
      const arr = groups.get(key) ?? [];
      arr.push(r);
      groups.set(key, arr);
    }
    return [...groups.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([unitName, residents]) => ({ unitName, residents }));
  }, [dietQuery.data, groupByUnit]);

  return (
    <div className="flex flex-col gap-8">
      {/* ── Dietas del día ── */}
      <section aria-labelledby="diet-section-title">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 id="diet-section-title" className="text-xl font-semibold text-[#1A3A3F]">
              {t('kitchen.diet.title')}
            </h2>
            <p className="text-sm text-[#1A3A3F]/60">{t('kitchen.diet.subtitle')}</p>
          </div>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-1.5 text-sm text-[#1A3A3F]/70">
              <input
                type="checkbox"
                checked={groupByUnit}
                onChange={(e) => setGroupByUnit(e.target.checked)}
                className="h-4 w-4 rounded accent-brand-700"
              />
              {t('kitchen.diet.groupByUnit')}
            </label>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => window.print()}
              aria-label={t('kitchen.print')}
            >
              {t('kitchen.print')}
            </Button>
          </div>
        </div>

        {dietQuery.isLoading ? (
          <div className="flex flex-col gap-2">
            {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
          </div>
        ) : (dietQuery.data ?? []).length === 0 ? (
          <EmptyState title={t('kitchen.diet.empty')} />
        ) : (
          <div className="flex flex-col gap-6 print:gap-4">
            {dietGroups.map(({ unitName, residents }) => (
              <div key={unitName ?? '__all'}>
                {unitName && (
                  <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-[#1A3A3F]/40 print:text-black">
                    {unitName}
                  </h3>
                )}
                <div className="overflow-x-auto rounded-2xl border border-brand-100/60 print:border-black/20">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-brand-50 text-left text-[#1A3A3F]/60 print:bg-gray-100">
                        <th scope="col" className="px-4 py-2 font-semibold">Residente</th>
                        <th scope="col" className="px-4 py-2 font-semibold">Plaza</th>
                        <th scope="col" className="px-4 py-2 font-semibold">Dieta</th>
                        <th scope="col" className="px-4 py-2 font-semibold">{t('kitchen.diet.liquidTexture')}</th>
                        <th scope="col" className="px-4 py-2 font-semibold">{t('kitchen.diet.supplements')}</th>
                        <th scope="col" className="px-4 py-2 font-semibold">Alergias</th>
                      </tr>
                    </thead>
                    <tbody>
                      {residents.map((r, idx) => (
                        <tr
                          key={r.id}
                          className={idx % 2 === 1 ? 'bg-[#F3EDE3]/30' : 'bg-white'}
                        >
                          <td className="px-4 py-2 font-medium text-[#1A3A3F]">
                            {r.lastName}, {r.firstName}
                          </td>
                          <td className="px-4 py-2 text-[#1A3A3F]/60">
                            {r.bed ? `${r.bed.unit.name} · ${r.bed.code}` : '—'}
                          </td>
                          <td className="px-4 py-2">
                            {r.dietType ? (DIET_TYPE_LABELS[r.dietType] ?? r.dietType) : '—'}
                          </td>
                          <td className="px-4 py-2">
                            {r.liquidTexture
                              ? (LIQUID_TEXTURE_LABELS[r.liquidTexture] ?? r.liquidTexture)
                              : '—'}
                          </td>
                          <td className="px-4 py-2 text-[#1A3A3F]/70">
                            {r.nutritionSupplements ?? '—'}
                          </td>
                          <td className="px-4 py-2">
                            {r.allergies.length === 0 ? (
                              <span className="text-[#1A3A3F]/40">{t('kitchen.diet.noAllergies')}</span>
                            ) : (
                              <ul className="flex flex-wrap gap-1" aria-label="Alergias">
                                {r.allergies.map((a) => (
                                  <li key={a.id} className="text-xs">
                                    <span className="font-medium text-warm-700">{a.substance}</span>
                                    {a.severity && (
                                      <span className="ml-0.5 text-[#1A3A3F]/40">({a.severity})</span>
                                    )}
                                  </li>
                                ))}
                              </ul>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── Lista de comedor ── */}
      <section aria-labelledby="meal-section-title">
        <div className="mb-4">
          <h2 id="meal-section-title" className="text-xl font-semibold text-[#1A3A3F]">
            {t('kitchen.meal.title')}
          </h2>
          <p className="text-sm text-[#1A3A3F]/60">{t('kitchen.meal.subtitle')}</p>
        </div>

        {/* Filtros */}
        <div className="mb-4 flex flex-wrap gap-3">
          <div className="flex flex-col gap-1">
            <label htmlFor="meal-filter" className="text-xs font-medium uppercase tracking-wide text-[#1A3A3F]/40">
              {t('kitchen.meal.meal')}
            </label>
            <select
              id="meal-filter"
              value={selectedMeal}
              onChange={(e) => setSelectedMeal(e.target.value as MealType)}
              className="min-h-[44px] rounded-2xl border border-brand-200 bg-white px-3 py-2 text-sm text-[#1A3A3F] focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
            >
              {MEAL_ORDER.map((m) => (
                <option key={m} value={m}>{MEAL_LABELS[m]}</option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="unit-filter" className="text-xs font-medium uppercase tracking-wide text-[#1A3A3F]/40">
              {t('kitchen.meal.unit')}
            </label>
            <select
              id="unit-filter"
              value={selectedUnitId}
              onChange={(e) => setSelectedUnitId(e.target.value)}
              className="min-h-[44px] rounded-2xl border border-brand-200 bg-white px-3 py-2 text-sm text-[#1A3A3F] focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
            >
              <option value="">{t('kitchen.meal.allUnits')}</option>
              {units.map(([id, name]) => (
                <option key={id} value={id}>{name}</option>
              ))}
            </select>
          </div>
        </div>

        {mealQuery.isLoading ? (
          <div className="flex flex-col gap-2">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
          </div>
        ) : (mealQuery.data ?? []).length === 0 ? (
          <EmptyState title={t('kitchen.meal.empty')} />
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-brand-100/60">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-brand-50 text-left text-[#1A3A3F]/60">
                  <th scope="col" className="px-4 py-2 font-semibold">Residente</th>
                  <th scope="col" className="px-4 py-2 font-semibold">Unidad</th>
                  <th scope="col" className="px-4 py-2 font-semibold">Plaza</th>
                  <th scope="col" className="px-4 py-2 font-semibold">Dieta</th>
                  <th scope="col" className="px-4 py-2 font-semibold">{t('kitchen.diet.liquidTexture')}</th>
                </tr>
              </thead>
              <tbody>
                {(mealQuery.data ?? []).map((r, idx) => (
                  <tr key={r.id} className={idx % 2 === 1 ? 'bg-[#F3EDE3]/30' : 'bg-white'}>
                    <td className="px-4 py-2 font-medium text-[#1A3A3F]">
                      {r.lastName}, {r.firstName}
                    </td>
                    <td className="px-4 py-2 text-[#1A3A3F]/60">{r.bed?.unit.name ?? '—'}</td>
                    <td className="px-4 py-2 text-[#1A3A3F]/60">{r.bed?.code ?? '—'}</td>
                    <td className="px-4 py-2">
                      {r.dietType ? (DIET_TYPE_LABELS[r.dietType] ?? r.dietType) : '—'}
                    </td>
                    <td className="px-4 py-2">
                      {r.liquidTexture
                        ? (LIQUID_TEXTURE_LABELS[r.liquidTexture] ?? r.liquidTexture)
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

// ─── Página principal ─────────────────────────────────────────────────────────

export default function MenusPage() {
  const { t, locale } = useT();

  // Permisos
  const me = api.me.useQuery();
  const canEdit = me.data?.permissions.includes('centers:write') ?? false;

  // Centros disponibles
  const centers = api.centers.list.useQuery();
  const firstCenter = (centers.data ?? [])[0];
  const [centerId, setCenterId] = useState('');
  const effectiveCenterId = centerId || firstCenter?.id || '';

  // Fecha actual + navegación día a día
  const [date, setDate] = useState(() => new Date());
  const dateStr = toIsoDate(date);

  // Pestaña activa
  const [tab, setTab] = useState<'menu' | 'kitchen'>('menu');

  // Menú del día
  const menuQuery = api.nutrition.menu.list.useQuery(
    { centerId: effectiveCenterId, date },
    { enabled: Boolean(effectiveCenterId) },
  );

  const menuByMeal = useMemo(() => {
    const items = menuQuery.data ?? [];
    const map = new Map<MealType, DishItem[]>();
    for (const m of MEAL_ORDER) map.set(m, []);
    for (const item of items) {
      const arr = map.get(item.meal as MealType) ?? [];
      arr.push(item as DishItem);
      map.set(item.meal as MealType, arr);
    }
    return map;
  }, [menuQuery.data]);

  if (me.isLoading) return null;

  if (!me.data?.permissions.includes('care:read')) {
    return <p className="text-[#1A3A3F]/60">Tu rol no tiene acceso a los menús.</p>;
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Cabecera */}
      <PageHeader title={t('menus.title')} subtitle={t('menus.subtitle')} />

      {/* Selector de centro */}
      {(centers.data ?? []).length > 1 && (
        <div className="flex items-center gap-3">
          <label htmlFor="center-select" className="text-sm font-medium text-[#1A3A3F]">
            {t('menus.center')}
          </label>
          <select
            id="center-select"
            value={centerId}
            onChange={(e) => setCenterId(e.target.value)}
            className="min-h-[44px] rounded-2xl border border-brand-200 bg-white px-3 py-2 text-sm text-[#1A3A3F] focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
          >
            {(centers.data ?? []).map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
      )}

      {/* Navegación por día */}
      <div className="flex flex-wrap items-center gap-3" role="group" aria-label="Navegación por fecha">
        <Button
          size="sm"
          variant="secondary"
          onClick={() => setDate((d) => offsetDate(d, -1))}
          aria-label={t('menus.prevDay')}
        >
          ←
        </Button>
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={dateStr}
            onChange={(e) => {
              const parsed = new Date(e.target.value + 'T00:00:00');
              if (!isNaN(parsed.getTime())) setDate(parsed);
            }}
            className="min-h-[44px] rounded-2xl border border-brand-200 bg-white px-3 py-2 text-sm text-[#1A3A3F] focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
            aria-label={t('menus.date')}
          />
          <span className="text-sm font-medium text-[#1A3A3F]">
            {formatDate(locale, date)}
          </span>
        </div>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => setDate((d) => offsetDate(d, 1))}
          aria-label={t('menus.nextDay')}
        >
          →
        </Button>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => setDate(new Date())}
        >
          {t('menus.today')}
        </Button>
      </div>

      {/* Pestañas */}
      <div
        role="tablist"
        aria-label="Secciones de menús"
        className="flex gap-1 rounded-full border border-brand-100/60 bg-white p-1 w-fit"
      >
        {(['menu', 'kitchen'] as const).map((tabKey) => (
          <button
            key={tabKey}
            role="tab"
            aria-selected={tab === tabKey}
            onClick={() => setTab(tabKey)}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
              tab === tabKey
                ? 'bg-brand-700 text-white'
                : 'text-[#1A3A3F]/70 hover:bg-brand-50 hover:text-brand-700'
            }`}
          >
            {tabKey === 'menu' ? 'Menú del día' : t('kitchen.title')}
          </button>
        ))}
      </div>

      {/* Contenido */}
      {!effectiveCenterId ? (
        <p className="text-[#1A3A3F]/60">Sin centros disponibles.</p>
      ) : tab === 'menu' ? (
        /* ── Pestaña Menú ── */
        <div className="flex flex-col gap-6">
          {menuQuery.isLoading ? (
            <div className="flex flex-col gap-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-24 w-full" />
              ))}
            </div>
          ) : (
            MEAL_ORDER.map((meal) => {
              const MEAL_LABELS_MAP: Record<string, string> = {
                DESAYUNO: t('meal.DESAYUNO'),
                COMIDA: t('meal.COMIDA'),
                MERIENDA: t('meal.MERIENDA'),
                CENA: t('meal.CENA'),
              };
              return (
                <SectionCard key={meal} title={MEAL_LABELS_MAP[meal] ?? meal}>
                  <MealSection
                    meal={meal}
                    items={menuByMeal.get(meal) ?? []}
                    canEdit={canEdit}
                    centerId={effectiveCenterId}
                    date={date}
                    onRefetch={() => void menuQuery.refetch()}
                    hideHeader
                  />
                </SectionCard>
              );
            })
          )}
        </div>
      ) : (
        /* ── Pestaña Cocina ── */
        <KitchenTab centerId={effectiveCenterId} date={date} />
      )}
    </div>
  );
}
