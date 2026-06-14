'use client';

/**
 * Pestaña de evolución médica en el expediente del residente.
 * Épica A — RF-CLI-001..006/009/011.
 *
 * Permisos:
 *   - Leer:  residents:read (staff, FAMILIAR NUNCA)
 *   - Crear: clinical:write (SANITARIO + DIRECTOR)
 *
 * CONFIDENCIALIDAD (RF-CLI-010): Esta sección no se muestra en el portal
 * del familiar. El control es doble: RBAC (residents:read) + UI (no se
 * renderiza en el portal de familias).
 */

import { useState } from 'react';
import {
  Badge,
  Button,
  FieldError,
  Label,
  SectionCard,
  Select,
} from '@vetlla/ui';
import { api } from '@/trpc/react';
import { useT } from '@/i18n/provider';
import { formatDate } from '@/lib/format';
import { useToast } from '@/components/toast';
import { useZodForm } from '@/lib/form';
import { MEDICAL_NOTE_TYPE_LABELS } from '@/lib/labels';
import { CreateMedicalNoteInput, MedicalNoteType } from '@/lib/schemas/clinical-notes';

// ---------------------------------------------------------------------------
// Colores semánticos para chips de tipo de evolutivo
// ---------------------------------------------------------------------------

const TYPE_CHIP_TONE: Record<string, 'blue' | 'amber' | 'red' | 'neutral' | 'green'> = {
  EVOLUTIVO:   'blue',
  EXPLORACION: 'neutral',
  DERIVACION:  'amber',
  VISITA:      'green',
};

// ---------------------------------------------------------------------------
// Componente principal
// ---------------------------------------------------------------------------

interface MedicalNotesTabProps {
  residentId: string;
  /** Puede leer la evolución médica (residents:read). */
  canRead: boolean;
  /** Puede crear evolutivos (clinical:write). */
  canWrite: boolean;
}

export function MedicalNotesTab({ residentId, canRead, canWrite }: MedicalNotesTabProps) {
  const { locale, t } = useT();
  const toast = useToast();
  const utils = api.useUtils();

  const today = new Date().toISOString().split('T')[0]!;

  // Filtro de tipo
  const [filterType, setFilterType] = useState<MedicalNoteType | ''>('');

  // Formulario de alta
  const [formOpen, setFormOpen] = useState(false);
  const [formFields, setFormFields] = useState({
    type: 'EVOLUTIVO' as string,
    noteDate: today,
    reason: '',
    body: '',
    plan: '',
  });
  const bodySchema = CreateMedicalNoteInput.pick({ body: true });
  const form = useZodForm(bodySchema);

  // Query — solo se ejecuta si canRead (por permiso; el server también lo valida)
  const notes = api.clinicalNotes.medical.listByResident.useQuery(
    {
      residentId,
      type: filterType ? (filterType as MedicalNoteType) : undefined,
    },
    { enabled: canRead },
  );

  // Mutation
  const createNote = api.clinicalNotes.medical.create.useMutation({
    onSuccess: async () => {
      setFormFields({ type: 'EVOLUTIVO', noteDate: today, reason: '', body: '', plan: '' });
      form.clearErrors();
      setFormOpen(false);
      await utils.clinicalNotes.medical.listByResident.invalidate({ residentId });
      toast.success('Evolutivo médico registrado.');
    },
    onError: (e) => toast.error(e.message),
  });

  const fmtDate = (d: Date | string | null | undefined) => formatDate(locale, d);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const data = form.validate({ body: formFields.body });
    if (!data) return;

    createNote.mutate({
      residentId,
      noteDate: new Date(formFields.noteDate),
      type: formFields.type as MedicalNoteType,
      reason: formFields.reason || undefined,
      body: data.body,
      plan: formFields.plan || undefined,
    });
  };

  if (!canRead) return null;

  const noteList = notes.data ?? [];
  const isEmpty = noteList.length === 0;

  return (
    <div className="flex flex-col gap-4">
      <SectionCard
        title="Evolución médica"
        aside={
          <div className="flex flex-wrap items-center gap-2">
            {/* Filtro por tipo */}
            <div>
              <Label htmlFor="medical-type-filter" className="sr-only">
                Filtrar por tipo de evolutivo
              </Label>
              <Select
                id="medical-type-filter"
                aria-label="Filtrar por tipo de evolutivo"
                value={filterType}
                onChange={(e) => setFilterType(e.target.value as MedicalNoteType | '')}
                className="min-w-[160px]"
              >
                <option value="">Todos los tipos</option>
                {Object.entries(MEDICAL_NOTE_TYPE_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </Select>
            </div>
            {canWrite && (
              <Button
                size="sm"
                onClick={() => setFormOpen((o) => !o)}
                aria-expanded={formOpen}
                aria-controls="medical-note-form"
              >
                {formOpen ? 'Cancelar' : 'Nuevo evolutivo'}
              </Button>
            )}
          </div>
        }
      >

          {/* Formulario de alta */}
          {canWrite && formOpen && (
            <form
              id="medical-note-form"
              className="mb-6 flex flex-col gap-3 rounded-2xl border border-brand-100 bg-brand-50 p-4"
              noValidate
              onSubmit={handleSubmit}
            >
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label htmlFor="med-type">Tipo</Label>
                  <Select
                    id="med-type"
                    value={formFields.type}
                    onChange={(e) => setFormFields((s) => ({ ...s, type: e.target.value }))}
                  >
                    {Object.entries(MEDICAL_NOTE_TYPE_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </Select>
                </div>
                <div>
                  <Label htmlFor="med-date">Fecha</Label>
                  <input
                    id="med-date"
                    type="date"
                    max={today}
                    value={formFields.noteDate}
                    onChange={(e) => setFormFields((s) => ({ ...s, noteDate: e.target.value }))}
                    className="flex min-h-[48px] w-full rounded-2xl border border-brand-200 bg-white px-3 py-2 text-[#1A3A3F] focus:outline-none focus:ring-2 focus:ring-brand-500/30"
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="med-reason">Motivo (opcional)</Label>
                <input
                  id="med-reason"
                  type="text"
                  placeholder="Motivo de la visita, derivación…"
                  maxLength={500}
                  value={formFields.reason}
                  onChange={(e) => setFormFields((s) => ({ ...s, reason: e.target.value }))}
                  className="flex min-h-[48px] w-full rounded-2xl border border-brand-200 bg-white px-3 py-2 text-[#1A3A3F] placeholder:text-[#1A3A3F]/40 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
                />
              </div>
              <div>
                <Label htmlFor="med-body">
                  Descripción clínica <span aria-hidden="true" className="text-warm-600">*</span>
                </Label>
                <textarea
                  id="med-body"
                  rows={5}
                  className="mt-1 flex w-full rounded-2xl border border-brand-200 bg-white px-3 py-2 text-[#1A3A3F] placeholder:text-[#1A3A3F]/40 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
                  placeholder="Observaciones, hallazgos, evolución del paciente…"
                  aria-required="true"
                  aria-invalid={Boolean(form.errors.body)}
                  aria-describedby={form.errors.body ? 'med-body-err' : undefined}
                  value={formFields.body}
                  onChange={(e) => setFormFields((s) => ({ ...s, body: e.target.value }))}
                />
                <FieldError id="med-body-err">{form.errors.body}</FieldError>
              </div>
              <div>
                <Label htmlFor="med-plan">Plan (opcional)</Label>
                <textarea
                  id="med-plan"
                  rows={3}
                  className="mt-1 flex w-full rounded-2xl border border-brand-200 bg-white px-3 py-2 text-[#1A3A3F] placeholder:text-[#1A3A3F]/40 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
                  placeholder="Plan de actuación, seguimiento, tratamiento propuesto…"
                  value={formFields.plan}
                  onChange={(e) => setFormFields((s) => ({ ...s, plan: e.target.value }))}
                />
              </div>
              <div className="flex gap-2 self-end">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => { setFormOpen(false); form.clearErrors(); }}
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  size="lg"
                  className="min-h-[56px]"
                  disabled={createNote.isPending}
                >
                  {createNote.isPending ? 'Guardando…' : 'Registrar evolutivo'}
                </Button>
              </div>
            </form>
          )}

          {/* Lista de evolutivos */}
          {notes.isLoading ? (
            <p className="text-sm text-[#1A3A3F]/60">{t('state.loading')}</p>
          ) : isEmpty ? (
            <div className="flex flex-col items-center gap-2 py-8 text-center">
              <p className="text-sm text-[#1A3A3F]/60">
                {filterType
                  ? 'Sin evolutivos médicos de este tipo.'
                  : 'Sin evolutivos médicos registrados.'}
              </p>
            </div>
          ) : (
            <ul className="flex flex-col gap-4" role="list" aria-label="Evolutivos médicos">
              {noteList.map((note) => (
                <li
                  key={note.id}
                  className="rounded-2xl border border-brand-100 bg-white p-4"
                >
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    {/* Chip de tipo */}
                    <Badge tone={TYPE_CHIP_TONE[note.type] ?? 'neutral'}>
                      {MEDICAL_NOTE_TYPE_LABELS[note.type] ?? note.type}
                    </Badge>
                    {/* Fecha */}
                    <span className="text-xs text-[#1A3A3F]/40">
                      {fmtDate(note.noteDate)}
                    </span>
                    {/* Autor */}
                    {note.author?.name && (
                      <span className="text-xs text-[#1A3A3F]/40">
                        · {note.author.name}
                        {note.author.jobTitle ? ` · ${note.author.jobTitle}` : ''}
                      </span>
                    )}
                  </div>
                  {/* Motivo */}
                  {note.reason && (
                    <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-[#1A3A3F]/60">
                      Motivo: <span className="normal-case font-normal">{note.reason}</span>
                    </p>
                  )}
                  {/* Cuerpo */}
                  <p className="text-sm leading-relaxed text-[#1A3A3F]">{note.body}</p>
                  {/* Plan */}
                  {note.plan && (
                    <div className="mt-3 rounded-xl border border-brand-100 bg-brand-50 p-3">
                      <p className="mb-0.5 text-xs font-semibold uppercase tracking-wide text-brand-600">
                        Plan
                      </p>
                      <p className="text-sm leading-relaxed text-[#1A3A3F]">{note.plan}</p>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
      </SectionCard>
    </div>
  );
}
