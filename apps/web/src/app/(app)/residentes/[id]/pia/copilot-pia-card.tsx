'use client';

import { useState } from 'react';
import { Badge, Button, Card, CardContent, CardTitle, Input, Label } from '@vetlla/ui';
import { api } from '@/trpc/react';
import { carePlanDraftSchema } from '@/lib/copilot';
import { useT } from '@/i18n/provider';
import { useToast } from '@/components/toast';

// Tarjeta del copiloto (H5 Slice 3 — Feature 2): el profesional (sanitario/dirección)
// pide un borrador de PIA; el copiloto lo redacta a partir del expediente minimizado y
// el humano revisa, edita y confirma (o descarta). Transparencia AI-Act art. 50: badge
// con icono + texto (nunca solo color) que identifica el contenido como generado por IA.

interface DraftGoal {
  /** Id de cliente estable para el key/edición de la lista. */
  clientId: string;
  description: string;
  targetDate?: string;
}

interface DraftState {
  title: string;
  goals: DraftGoal[];
  notes?: string;
  model: string;
  promptVersion: string;
}

/** Icono "chispa de IA" decorativo (el texto del badge es el canal de información). */
function SparkleIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="currentColor">
      <path d="M8 1l1.7 4.3L14 7l-4.3 1.7L8 13 6.3 8.7 2 7l4.3-1.7L8 1zm5 9l.8 2.2L16 13l-2.2.8L13 16l-.8-2.2L10 13l2.2-.8L13 10z" />
    </svg>
  );
}

export function CopilotPiaCard({
  residentId,
  onCreated,
}: {
  residentId: string;
  onCreated: () => void;
}) {
  const { t, locale } = useT();
  const toast = useToast();
  const [guidance, setGuidance] = useState('');
  const [draft, setDraft] = useState<DraftState | null>(null);

  const generate = api.copilot.draftCarePlan.useMutation({
    onSuccess: ({ draft: d, model, promptVersion }) => {
      setDraft({
        title: d.title,
        goals: d.goals.map((g) => ({
          clientId: crypto.randomUUID(),
          description: g.description,
          targetDate: g.targetDate,
        })),
        notes: d.notes,
        model,
        promptVersion,
      });
    },
    onError: () => toast.error(t('copilotPia.error.draft')),
  });

  const confirm = api.copilot.confirmCarePlan.useMutation({
    onSuccess: () => {
      toast.success(t('copilotPia.saved'));
      setDraft(null);
      setGuidance('');
      onCreated();
    },
    onError: () => toast.error(t('copilotPia.error.confirm')),
  });

  function updateGoal(clientId: string, description: string) {
    setDraft((d) =>
      d
        ? { ...d, goals: d.goals.map((g) => (g.clientId === clientId ? { ...g, description } : g)) }
        : d,
    );
  }

  function removeGoal(clientId: string) {
    setDraft((d) => (d ? { ...d, goals: d.goals.filter((g) => g.clientId !== clientId) } : d));
  }

  function addGoal() {
    setDraft((d) =>
      d ? { ...d, goals: [...d.goals, { clientId: crypto.randomUUID(), description: '' }] } : d,
    );
  }

  function handleConfirm() {
    if (!draft) return;
    const goals = draft.goals
      .map((g) => ({ description: g.description.trim(), targetDate: g.targetDate }))
      .filter((g) => g.description !== '');
    // Validación amable en cliente; el servidor revalida con el mismo esquema.
    const parsed = carePlanDraftSchema.safeParse({
      title: draft.title.trim(),
      goals,
      notes: draft.notes,
    });
    if (!parsed.success) {
      toast.error(t('copilotPia.error.invalid'));
      return;
    }
    confirm.mutate({
      residentId,
      draft: parsed.data,
      model: draft.model,
      promptVersion: draft.promptVersion,
    });
  }

  return (
    <Card>
      <CardContent>
        <CardTitle className="mb-1 text-base">{t('copilotPia.title')}</CardTitle>
        <p className="mb-3 text-sm text-slate-500">{t('copilotPia.intro')}</p>

        <Label htmlFor="copilot-pia-guidance">{t('copilotPia.guidanceLabel')}</Label>
        <textarea
          id="copilot-pia-guidance"
          data-testid="copilot-pia-guidance"
          value={guidance}
          onChange={(e) => setGuidance(e.target.value)}
          placeholder={t('copilotPia.guidancePlaceholder')}
          maxLength={1000}
          rows={2}
          className="min-h-[64px] w-full rounded-md border border-slate-300 px-3 py-2 text-base focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
        <Button
          className="mt-3"
          data-testid="copilot-pia-generate"
          disabled={generate.isPending}
          aria-busy={generate.isPending}
          onClick={() =>
            generate.mutate({
              residentId,
              guidance: guidance.trim() === '' ? undefined : guidance.trim(),
              locale,
            })
          }
        >
          {generate.isPending ? t('copilotPia.generating') : t('copilotPia.generate')}
        </Button>

        {draft && (
          <section
            data-testid="copilot-pia-draft-card"
            aria-label={t('copilotPia.badge')}
            className="mt-4 rounded-xl border-2 border-dashed border-amber-300 bg-amber-50/50 p-4"
          >
            <Badge tone="amber" icon={<SparkleIcon />}>
              {t('copilotPia.badge')}
            </Badge>
            <p className="mt-2 text-sm text-slate-600">{t('copilotPia.transparency')}</p>

            <div className="mt-3">
              <Label htmlFor="copilot-pia-title">{t('copilotPia.titleLabel')}</Label>
              <Input
                id="copilot-pia-title"
                data-testid="copilot-pia-title"
                value={draft.title}
                onChange={(e) => setDraft((d) => (d ? { ...d, title: e.target.value } : d))}
              />
            </div>

            <div className="mt-3">
              <p className="mb-1 text-sm font-medium text-slate-600">{t('copilotPia.goalsLabel')}</p>
              <ul className="flex flex-col gap-2">
                {draft.goals.map((goal, i) => (
                  <li key={goal.clientId} className="flex items-start gap-2">
                    <div className="flex-1">
                      <Label htmlFor={`copilot-pia-goal-${i}`} className="sr-only">
                        {t('copilotPia.goalLabel')} {i + 1}
                      </Label>
                      <Input
                        id={`copilot-pia-goal-${i}`}
                        data-testid="copilot-pia-goal"
                        aria-label={`${t('copilotPia.goalLabel')} ${i + 1}`}
                        value={goal.description}
                        onChange={(e) => updateGoal(goal.clientId, e.target.value)}
                      />
                    </div>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      data-testid="copilot-pia-remove-goal"
                      aria-label={`${t('copilotPia.removeGoal')} ${i + 1}`}
                      onClick={() => removeGoal(goal.clientId)}
                    >
                      ✕
                    </Button>
                  </li>
                ))}
              </ul>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="mt-2"
                data-testid="copilot-pia-add-goal"
                onClick={addGoal}
              >
                {t('copilotPia.addGoal')}
              </Button>
            </div>

            {draft.notes && (
              <p className="mt-3 text-sm italic text-slate-600">
                {t('copilotPia.notesLabel')}: {draft.notes}
              </p>
            )}

            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              <Button
                data-testid="copilot-pia-confirm"
                disabled={confirm.isPending}
                aria-busy={confirm.isPending}
                onClick={handleConfirm}
              >
                {confirm.isPending ? t('copilotPia.creating') : t('copilotPia.confirm')}
              </Button>
              <Button
                variant="secondary"
                data-testid="copilot-pia-discard"
                onClick={() => {
                  setDraft(null);
                  toast.toast(t('copilotPia.discarded'));
                }}
              >
                {t('copilotPia.discard')}
              </Button>
            </div>
          </section>
        )}
      </CardContent>
    </Card>
  );
}
