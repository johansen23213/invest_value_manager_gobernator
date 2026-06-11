'use client';

import { useState } from 'react';
import { Badge, Button, Card, CardContent, CardTitle, Input, Label, Select } from '@vetlla/ui';
import type { CareRecordType } from '@vetlla/db';
import { api } from '@/trpc/react';
import { CARE_DRAFT_FIELDS, careDraftSchema } from '@/lib/copilot';
import { CARE_TYPE_LABELS } from '@/lib/labels';
import { useT } from '@/i18n/provider';
import { useToast } from '@/components/toast';

// Tarjeta del copiloto (H5 Slice 2 — Feature 1): el auxiliar escribe en lenguaje
// natural, el copiloto propone un BORRADOR de CareRecord y el humano lo revisa,
// corrige y confirma (o descarta). Transparencia AI-Act art. 50: badge con icono +
// texto (nunca solo color) que identifica el contenido como generado por IA.

const CARE_TYPES: CareRecordType[] = ['CONSTANTES', 'ABVD', 'DEPOSICION', 'INGESTA', 'INCIDENCIA'];

interface DraftState {
  type: CareRecordType;
  /** Valores editables como texto (el esquema Zod coerciona números al confirmar). */
  fields: Record<string, string>;
  note?: string;
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

/** Inicializa los campos editables para un tipo, conservando valores con el mismo nombre. */
function fieldsForType(type: CareRecordType, previous: Record<string, string>): Record<string, string> {
  return Object.fromEntries(CARE_DRAFT_FIELDS[type].map((f) => [f, previous[f] ?? '']));
}

export function CopilotCard({
  residentId,
  online,
  onSaved,
}: {
  residentId: string;
  online: boolean;
  onSaved: () => void;
}) {
  const { t, locale } = useT();
  const toast = useToast();
  const [text, setText] = useState('');
  const [draft, setDraft] = useState<DraftState | null>(null);

  const generate = api.copilot.draftCareRecord.useMutation({
    onSuccess: ({ draft: d, model, promptVersion }) => {
      const fields = fieldsForType(d.type, {});
      for (const [k, v] of Object.entries(d.payload)) {
        if (v !== undefined && v !== null) fields[k] = String(v);
      }
      setDraft({ type: d.type, fields, note: d.note, model, promptVersion });
    },
    onError: () => toast.error(t('copilot.error.draft')),
  });

  const confirm = api.copilot.confirmCareRecord.useMutation({
    onSuccess: () => {
      toast.success(t('copilot.saved'));
      setDraft(null);
      setText('');
      onSaved();
    },
    onError: () => toast.error(t('copilot.error.confirm')),
  });

  function handleConfirm() {
    if (!draft) return;
    const payload: Record<string, string> = {};
    for (const [k, v] of Object.entries(draft.fields)) {
      if (v.trim() !== '') payload[k] = v.trim();
    }
    // Validación amable en cliente; el servidor revalida con el mismo esquema.
    const parsed = careDraftSchema.safeParse({ type: draft.type, payload, note: draft.note });
    if (!parsed.success) {
      toast.error(t('copilot.error.invalid'));
      return;
    }
    confirm.mutate({
      residentId,
      clientId: crypto.randomUUID(), // idempotencia ante reintentos
      draft: parsed.data,
      model: draft.model,
      promptVersion: draft.promptVersion,
    });
  }

  return (
    <Card>
      <CardContent>
        <CardTitle className="mb-1 text-base">{t('copilot.title')}</CardTitle>
        <p className="mb-3 text-sm text-slate-500">{t('copilot.intro')}</p>

        {!online && (
          <p className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            {t('copilot.offline')}
          </p>
        )}

        <Label htmlFor="copilot-input">{t('copilot.inputLabel')}</Label>
        <textarea
          id="copilot-input"
          data-testid="copilot-input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={t('copilot.placeholder')}
          maxLength={1000}
          rows={3}
          className="min-h-[88px] w-full rounded-md border border-slate-300 px-3 py-2 text-base focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:bg-slate-50"
        />
        <Button
          size="lg"
          className="mt-3 w-full"
          data-testid="copilot-generate"
          disabled={!online || text.trim().length === 0 || generate.isPending}
          aria-busy={generate.isPending}
          onClick={() =>
            generate.mutate({ residentId, utterance: text.trim(), locale })
          }
        >
          {generate.isPending ? t('copilot.generating') : t('copilot.generate')}
        </Button>

        {draft && (
          <section
            data-testid="copilot-draft-card"
            aria-label={t('copilot.badge')}
            className="mt-4 rounded-xl border-2 border-dashed border-amber-300 bg-amber-50/50 p-4"
          >
            <Badge tone="amber" icon={<SparkleIcon />}>
              {t('copilot.badge')}
            </Badge>
            <p className="mt-2 text-sm text-slate-600">{t('copilot.transparency')}</p>

            <div className="mt-3">
              <Label htmlFor="copilot-type">{t('copilot.typeLabel')}</Label>
              <Select
                id="copilot-type"
                value={draft.type}
                onChange={(e) => {
                  const type = e.target.value as CareRecordType;
                  setDraft((d) => (d ? { ...d, type, fields: fieldsForType(type, d.fields) } : d));
                }}
              >
                {CARE_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {CARE_TYPE_LABELS[type]}
                  </option>
                ))}
              </Select>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-3">
              {CARE_DRAFT_FIELDS[draft.type].map((field) => (
                <div key={field} className={field === 'descripcion' ? 'col-span-2' : ''}>
                  <Label htmlFor={`copilot-field-${field}`}>{t(`copilot.field.${field}`)}</Label>
                  <Input
                    id={`copilot-field-${field}`}
                    inputMode={['fc', 'temperatura', 'sato2', 'porcentaje'].includes(field) ? 'decimal' : undefined}
                    value={draft.fields[field] ?? ''}
                    onChange={(e) =>
                      setDraft((d) =>
                        d ? { ...d, fields: { ...d.fields, [field]: e.target.value } } : d,
                      )
                    }
                  />
                </div>
              ))}
            </div>

            {draft.note && (
              <p className="mt-3 text-sm italic text-slate-600">
                {t('copilot.noteLabel')}: {draft.note}
              </p>
            )}

            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              <Button
                size="lg"
                data-testid="copilot-confirm"
                disabled={confirm.isPending}
                aria-busy={confirm.isPending}
                onClick={handleConfirm}
              >
                {confirm.isPending ? t('copilot.saving') : t('copilot.confirm')}
              </Button>
              <Button
                size="lg"
                variant="secondary"
                data-testid="copilot-discard"
                onClick={() => {
                  setDraft(null);
                  toast.toast(t('copilot.discarded'));
                }}
              >
                {t('copilot.discard')}
              </Button>
            </div>
          </section>
        )}
      </CardContent>
    </Card>
  );
}
