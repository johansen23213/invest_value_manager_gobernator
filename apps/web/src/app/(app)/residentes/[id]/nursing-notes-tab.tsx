'use client';

/**
 * Pestaña de notas de enfermería por turno en el expediente del residente.
 * Épica A — RF-ENF-001..011.
 *
 * Permisos:
 *   - Leer:  care:read  (AUXILIAR + SANITARIO + DIRECTOR)
 *   - Crear: care:write (AUXILIAR + SANITARIO + DIRECTOR)
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
import { NursingNoteShift, NursingNoteCategory } from '@vetlla/db';
import { api } from '@/trpc/react';
import { useT } from '@/i18n/provider';
import { formatDate } from '@/lib/format';
import { useToast } from '@/components/toast';
import { useZodForm } from '@/lib/form';
import { currentShift } from '@/lib/mar';
import {
  NURSING_NOTE_SHIFT_LABELS,
  NURSING_NOTE_CATEGORY_LABELS,
} from '@/lib/labels';
import {
  CreateNursingNoteInput,
  NursingNoteShiftSchema,
} from '@/server/routers/clinical-notes';

// ---------------------------------------------------------------------------
// Colores semánticos para chips de turno y categoría
// ---------------------------------------------------------------------------

const SHIFT_CHIP_TONE: Record<string, 'blue' | 'amber' | 'neutral'> = {
  MANANA: 'blue',
  TARDE:  'amber',
  NOCHE:  'neutral',
};

const CATEGORY_CHIP_TONE: Record<string, 'red' | 'amber' | 'neutral' | 'green' | 'blue'> = {
  INCIDENCIA:   'red',
  DOLOR:        'amber',
  CURA:         'blue',
  ALIMENTACION: 'green',
  SUENO:        'neutral',
  CONDUCTA:     'neutral',
  GENERAL:      'neutral',
};

// ---------------------------------------------------------------------------
// Componente principal
// ---------------------------------------------------------------------------

interface NursingNotesTabProps {
  residentId: string;
  canWrite: boolean;
}

export function NursingNotesTab({ residentId, canWrite }: NursingNotesTabProps) {
  const { locale } = useT();
  const toast = useToast();
  const utils = api.useUtils();

  const today = new Date().toISOString().split('T')[0]!;
  const defaultShift = currentShift(new Date());

  // Filtro de turno
  const [filterShift, setFilterShift] = useState<NursingNoteShift | ''>('');

  // Formulario de alta
  const [formOpen, setFormOpen] = useState(false);
  const [formFields, setFormFields] = useState({
    shift: defaultShift as string,
    noteDate: today,
    category: 'GENERAL' as string,
    body: '',
  });
  const bodySchema = CreateNursingNoteInput.pick({ body: true });
  const form = useZodForm(bodySchema);

  // Query
  const notes = api.clinicalNotes.nursing.listByResident.useQuery({
    residentId,
    shift: filterShift ? (filterShift as NursingNoteShift) : undefined,
  });

  // Mutation
  const createNote = api.clinicalNotes.nursing.create.useMutation({
    onSuccess: async () => {
      setFormFields({ shift: defaultShift, noteDate: today, category: 'GENERAL', body: '' });
      form.clearErrors();
      setFormOpen(false);
      await utils.clinicalNotes.nursing.listByResident.invalidate({ residentId });
      toast.success('Nota de enfermería registrada.');
    },
    onError: (e) => toast.error(e.message),
  });

  const fmtDate = (d: Date | string | null | undefined) => formatDate(locale, d);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const data = form.validate({ body: formFields.body });
    if (!data) return;

    const parsed = NursingNoteShiftSchema.safeParse(formFields.shift);
    if (!parsed.success) {
      toast.error('Selecciona un turno válido.');
      return;
    }

    createNote.mutate({
      residentId,
      shift: parsed.data,
      noteDate: new Date(formFields.noteDate),
      body: data.body,
      category: formFields.category as NursingNoteCategory,
    });
  };

  const noteList = notes.data ?? [];
  const isEmpty = noteList.length === 0;

  return (
    <div className="flex flex-col gap-4">
      <SectionCard
        title="Notas de enfermería"
        aside={
          <div className="flex flex-wrap items-center gap-2">
            {/* Filtro por turno */}
            <div>
              <Label htmlFor="nursing-shift-filter" className="sr-only">
                Filtrar por turno
              </Label>
              <Select
                id="nursing-shift-filter"
                aria-label="Filtrar por turno"
                value={filterShift}
                onChange={(e) => setFilterShift(e.target.value as NursingNoteShift | '')}
                className="min-w-[140px]"
              >
                <option value="">Todos los turnos</option>
                {Object.entries(NURSING_NOTE_SHIFT_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </Select>
            </div>
            {canWrite && (
              <Button
                size="sm"
                onClick={() => setFormOpen((o) => !o)}
                aria-expanded={formOpen}
                aria-controls="nursing-note-form"
              >
                {formOpen ? 'Cancelar' : 'Nueva nota'}
              </Button>
            )}
          </div>
        }
      >

          {/* Formulario de alta */}
          {canWrite && formOpen && (
            <form
              id="nursing-note-form"
              className="mb-6 flex flex-col gap-3 rounded-2xl border border-brand-100 bg-brand-50 p-4"
              noValidate
              onSubmit={handleSubmit}
            >
              <div className="grid gap-3 sm:grid-cols-3">
                <div>
                  <Label htmlFor="n-shift">Turno</Label>
                  <Select
                    id="n-shift"
                    value={formFields.shift}
                    onChange={(e) => setFormFields((s) => ({ ...s, shift: e.target.value }))}
                  >
                    {Object.entries(NURSING_NOTE_SHIFT_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </Select>
                </div>
                <div>
                  <Label htmlFor="n-date">Fecha</Label>
                  <input
                    id="n-date"
                    type="date"
                    max={today}
                    value={formFields.noteDate}
                    onChange={(e) => setFormFields((s) => ({ ...s, noteDate: e.target.value }))}
                    className="flex min-h-[48px] w-full rounded-2xl border border-brand-200 bg-white px-3 py-2 text-[#1A3A3F] focus:outline-none focus:ring-2 focus:ring-brand-500/30"
                  />
                </div>
                <div>
                  <Label htmlFor="n-category">Categoría</Label>
                  <Select
                    id="n-category"
                    value={formFields.category}
                    onChange={(e) => setFormFields((s) => ({ ...s, category: e.target.value }))}
                  >
                    {Object.entries(NURSING_NOTE_CATEGORY_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </Select>
                </div>
              </div>
              <div>
                <Label htmlFor="n-body">
                  Nota <span aria-hidden="true" className="text-warm-600">*</span>
                </Label>
                <textarea
                  id="n-body"
                  rows={4}
                  className="mt-1 flex w-full rounded-2xl border border-brand-200 bg-white px-3 py-2 text-[#1A3A3F] placeholder:text-[#1A3A3F]/40 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
                  placeholder="Describe la situación del residente en este turno…"
                  aria-required="true"
                  aria-invalid={Boolean(form.errors.body)}
                  aria-describedby={form.errors.body ? 'n-body-err' : undefined}
                  value={formFields.body}
                  onChange={(e) => setFormFields((s) => ({ ...s, body: e.target.value }))}
                />
                <FieldError id="n-body-err">{form.errors.body}</FieldError>
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
                  {createNote.isPending ? 'Guardando…' : 'Registrar nota'}
                </Button>
              </div>
            </form>
          )}

          {/* Lista de notas */}
          {notes.isLoading ? (
            <p className="text-sm text-[#1A3A3F]/60">Cargando…</p>
          ) : isEmpty ? (
            <div className="flex flex-col items-center gap-2 py-8 text-center">
              <p className="text-sm text-[#1A3A3F]/60">
                {filterShift
                  ? 'Sin notas de enfermería para este turno.'
                  : 'Sin notas de enfermería registradas.'}
              </p>
            </div>
          ) : (
            <ul className="flex flex-col gap-3" role="list" aria-label="Notas de enfermería">
              {noteList.map((note) => (
                <li
                  key={note.id}
                  className={`rounded-2xl border p-4 ${
                    note.category === 'INCIDENCIA'
                      ? 'border-warm-200 bg-warm-50'
                      : 'border-brand-100 bg-white'
                  }`}
                >
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    {/* Chip de turno */}
                    <Badge tone={SHIFT_CHIP_TONE[note.shift] ?? 'neutral'}>
                      {NURSING_NOTE_SHIFT_LABELS[note.shift] ?? note.shift}
                    </Badge>
                    {/* Chip de categoría */}
                    <Badge tone={CATEGORY_CHIP_TONE[note.category ?? 'GENERAL'] ?? 'neutral'}>
                      {NURSING_NOTE_CATEGORY_LABELS[note.category ?? 'GENERAL'] ?? note.category}
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
                  <p className="text-sm leading-relaxed text-[#1A3A3F]">{note.body}</p>
                </li>
              ))}
            </ul>
          )}
      </SectionCard>
    </div>
  );
}
