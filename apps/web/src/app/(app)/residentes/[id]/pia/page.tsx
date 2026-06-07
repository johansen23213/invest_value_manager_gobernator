'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { Badge, Button, Card, CardContent, CardTitle, Input, Label, Select } from '@vetlla/ui';
import { api } from '@/trpc/react';
import { CARE_PLAN_STATUS_LABELS, GOAL_STATUS_LABELS } from '@/lib/labels';
import { useT } from '@/i18n/provider';
import { formatDate } from '@/lib/format';
import { useToast } from '@/components/toast';
import type { GoalStatus } from '@vetlla/db';

const GOAL_STATUSES: GoalStatus[] = ['PENDIENTE', 'EN_PROGRESO', 'CONSEGUIDO', 'CANCELADO'];

export default function CarePlanPage() {
  const params = useParams<{ id: string }>();
  const residentId = params.id;
  const utils = api.useUtils();
  const toast = useToast();
  const { locale } = useT();
  const me = api.me.useQuery();
  const canWrite = me.data?.permissions.includes('careplan:write') ?? false;

  const resident = api.residents.get.useQuery({ id: residentId });
  const plans = api.carePlans.listByResident.useQuery({ residentId });

  const [title, setTitle] = useState('');
  const [goalText, setGoalText] = useState<Record<string, string>>({});
  const [reviewText, setReviewText] = useState<Record<string, string>>({});

  const refresh = () => utils.carePlans.listByResident.invalidate({ residentId });

  const createPlan = api.carePlans.create.useMutation({
    onSuccess: async () => {
      setTitle('');
      await refresh();
      toast.success('PIA creado.');
    },
    onError: (e) => toast.error(e.message),
  });
  const addGoal = api.carePlans.addGoal.useMutation({
    onSuccess: refresh,
    onError: (e) => toast.error(e.message),
  });
  const updateGoal = api.carePlans.updateGoal.useMutation({
    onSuccess: refresh,
    onError: (e) => toast.error(e.message),
  });
  const addReview = api.carePlans.addReview.useMutation({
    onSuccess: refresh,
    onError: (e) => toast.error(e.message),
  });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href={`/residentes/${residentId}`} className="text-sm text-brand-700 hover:underline">
          ← Expediente
        </Link>
        <h1 className="mt-1 text-2xl font-bold">
          PIA{resident.data ? ` · ${resident.data.firstName} ${resident.data.lastName}` : ''}
        </h1>
      </div>

      {canWrite && (
        <Card>
          <CardContent>
            <form
              className="flex items-end gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                createPlan.mutate({ residentId, title });
              }}
            >
              <div className="flex-1">
                <Label htmlFor="title">Nuevo PIA</Label>
                <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} required placeholder="Plan de atención 2026" />
              </div>
              <Button type="submit" disabled={createPlan.isPending}>
                Crear PIA
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      {plans.data && plans.data.length > 0 ? (
        plans.data.map((plan) => (
          <Card key={plan.id}>
            <CardContent>
              <div className="mb-3 flex items-center justify-between">
                <CardTitle className="text-base">{plan.title}</CardTitle>
                <Badge tone={plan.status === 'ACTIVO' ? 'green' : 'neutral'}>
                  {CARE_PLAN_STATUS_LABELS[plan.status]}
                </Badge>
              </div>

              {/* Objetivos */}
              <p className="mb-1 text-sm font-medium text-slate-600">Objetivos</p>
              {plan.goals.length === 0 ? (
                <p className="text-sm text-slate-500">Sin objetivos.</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {plan.goals.map((g) => (
                    <li key={g.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-slate-50 px-3 py-2 text-sm">
                      <span>{g.description}</span>
                      {canWrite ? (
                        <Select
                          value={g.status}
                          onChange={(e) => updateGoal.mutate({ id: g.id, status: e.target.value as GoalStatus })}
                          className="max-w-[160px]"
                        >
                          {GOAL_STATUSES.map((s) => (
                            <option key={s} value={s}>
                              {GOAL_STATUS_LABELS[s]}
                            </option>
                          ))}
                        </Select>
                      ) : (
                        <Badge>{GOAL_STATUS_LABELS[g.status]}</Badge>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              {canWrite && (
                <form
                  className="mt-2 flex gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    addGoal.mutate({ carePlanId: plan.id, description: goalText[plan.id] ?? '' });
                    setGoalText((s) => ({ ...s, [plan.id]: '' }));
                  }}
                >
                  <Input
                    placeholder="Nuevo objetivo"
                    value={goalText[plan.id] ?? ''}
                    onChange={(e) => setGoalText((s) => ({ ...s, [plan.id]: e.target.value }))}
                    required
                  />
                  <Button type="submit" size="sm">
                    Añadir
                  </Button>
                </form>
              )}

              {/* Revisiones */}
              <p className="mb-1 mt-4 text-sm font-medium text-slate-600">Revisiones / seguimiento</p>
              {plan.reviews.length === 0 ? (
                <p className="text-sm text-slate-500">Sin revisiones.</p>
              ) : (
                <ul className="flex flex-col gap-1 text-sm">
                  {plan.reviews.map((rv) => (
                    <li key={rv.id} className="rounded-md bg-slate-50 px-3 py-2">
                      <span className="text-slate-400">
                        {formatDate(locale, rv.reviewDate)}:
                      </span>{' '}
                      {rv.summary}
                    </li>
                  ))}
                </ul>
              )}
              {canWrite && (
                <form
                  className="mt-2 flex gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    addReview.mutate({ carePlanId: plan.id, summary: reviewText[plan.id] ?? '' });
                    setReviewText((s) => ({ ...s, [plan.id]: '' }));
                  }}
                >
                  <Input
                    placeholder="Nota de seguimiento"
                    value={reviewText[plan.id] ?? ''}
                    onChange={(e) => setReviewText((s) => ({ ...s, [plan.id]: e.target.value }))}
                    required
                  />
                  <Button type="submit" size="sm">
                    Añadir revisión
                  </Button>
                </form>
              )}
            </CardContent>
          </Card>
        ))
      ) : (
        <p className="text-slate-500">Sin PIA todavía.</p>
      )}
    </div>
  );
}
