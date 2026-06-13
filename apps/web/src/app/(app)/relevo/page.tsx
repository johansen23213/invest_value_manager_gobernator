'use client';

/**
 * Traspaso de turno — pantalla de lectura rápida para el equipo entrante.
 * Épica A — RF-PRO-008/009.
 *
 * Permiso: care:read (AUXILIAR + SANITARIO + DIRECTOR).
 *
 * Flujo:
 *   1. El usuario selecciona turno (preselección = currentShift) y fecha.
 *   2. Si el tenant tiene más de un centro, elige centro; si tiene varios,
 *      elige también unidad (opcional).
 *   3. Se muestra la lista de residentes con sus notas del turno.
 *      - Residentes con categoría INCIDENCIA se destacan visualmente.
 *      - Residentes sin notas muestran estado vacío amable.
 *
 * Ruta: /relevo
 */

import { useState, useEffect } from 'react';
import { Badge, Card, CardContent, Label, Select } from '@vetlla/ui';
import { api } from '@/trpc/react';
import { useT } from '@/i18n/provider';
import { formatDate } from '@/lib/format';
import { currentShift, type Shift } from '@/lib/mar';
import {
  NURSING_NOTE_SHIFT_LABELS,
  NURSING_NOTE_CATEGORY_LABELS,
} from '@/lib/labels';

// ---------------------------------------------------------------------------
// Colores semánticos
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
// Icono de alerta (decorativo) — incidencias destacadas
// ---------------------------------------------------------------------------
function IconAlert({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      className={className}
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12" y2="17.01" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Componente principal
// ---------------------------------------------------------------------------

export default function RelevoPage() {
  const { locale } = useT();
  const today = new Date().toISOString().split('T')[0]!;

  // Controles del filtro
  const [selectedDate, setSelectedDate] = useState(today);
  const [selectedShift, setSelectedShift] = useState<Shift>(currentShift(new Date()));
  const [selectedCenterId, setSelectedCenterId] = useState<string>('');
  const [selectedUnitId, setSelectedUnitId] = useState<string>('');

  // Cargar centros del tenant
  const centersQuery = api.centers.list.useQuery();

  // Pre-seleccionar el primer centro cuando carguen
  useEffect(() => {
    const data = centersQuery.data;
    if (data && data.length > 0 && !selectedCenterId) {
      setSelectedCenterId(data[0]!.id);
    }
  }, [centersQuery.data, selectedCenterId]);

  // Cargar unidades del centro seleccionado
  const centerDetailQuery = api.centers.get.useQuery(
    { id: selectedCenterId },
    { enabled: Boolean(selectedCenterId) },
  );

  // Cargar el traspaso de turno
  const handoverQuery = api.clinicalNotes.nursing.listForShiftHandover.useQuery(
    {
      centerId: selectedCenterId,
      unitId: selectedUnitId || undefined,
      shift: selectedShift,
      noteDate: new Date(selectedDate),
    },
    { enabled: Boolean(selectedCenterId) },
  );

  const fmtDate = (d: Date | string | null | undefined) => formatDate(locale, d);

  const centers = centersQuery.data ?? [];
  const units = centerDetailQuery.data?.units ?? [];
  const handover = handoverQuery.data ?? [];

  // Estadísticas: residentes con incidencia
  const withIncidencia = handover.filter((item) =>
    item.notes.some((n) => n.category === 'INCIDENCIA'),
  );

  // Estado: ningún centro disponible
  if (centersQuery.isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <p className="text-sm text-[#1A3A3F]/60">Cargando centros…</p>
      </div>
    );
  }

  if (centers.length === 0) {
    return (
      <div className="flex items-center justify-center py-16">
        <p className="text-sm text-[#1A3A3F]/60">No hay centros disponibles.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Cabecera */}
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight text-[#1A3A3F]">
          Traspaso de turno
        </h1>
        <p className="mt-1 text-sm text-[#1A3A3F]/60">
          Notas del turno para el equipo entrante. Escanea de un vistazo.
        </p>
      </div>

      {/* Controles de filtro */}
      <Card>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {/* Turno */}
            <div>
              <Label htmlFor="relevo-shift">Turno</Label>
              <Select
                id="relevo-shift"
                value={selectedShift}
                onChange={(e) => setSelectedShift(e.target.value as Shift)}
              >
                {Object.entries(NURSING_NOTE_SHIFT_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </Select>
            </div>

            {/* Fecha */}
            <div>
              <Label htmlFor="relevo-date">Fecha</Label>
              <input
                id="relevo-date"
                type="date"
                max={today}
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="flex min-h-[48px] w-full rounded-2xl border border-brand-200 bg-white px-3 py-2 text-[#1A3A3F] focus:outline-none focus:ring-2 focus:ring-brand-500/30"
              />
            </div>

            {/* Centro (visible si hay más de uno) */}
            {centers.length > 1 && (
              <div>
                <Label htmlFor="relevo-center">Centro</Label>
                <Select
                  id="relevo-center"
                  value={selectedCenterId}
                  onChange={(e) => {
                    setSelectedCenterId(e.target.value);
                    setSelectedUnitId('');
                  }}
                >
                  {centers.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </Select>
              </div>
            )}

            {/* Unidad */}
            {units.length > 0 && (
              <div>
                <Label htmlFor="relevo-unit">Unidad</Label>
                <Select
                  id="relevo-unit"
                  value={selectedUnitId}
                  onChange={(e) => setSelectedUnitId(e.target.value)}
                >
                  <option value="">Todas las unidades</option>
                  {units.map((u) => (
                    <option key={u.id} value={u.id}>{u.name}</option>
                  ))}
                </Select>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Resumen rápido del turno */}
      {!handoverQuery.isLoading && handover.length > 0 && (
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm font-semibold text-[#1A3A3F]">
            {handover.length} {handover.length === 1 ? 'residente' : 'residentes'}
          </span>
          <Badge tone={SHIFT_CHIP_TONE[selectedShift] ?? 'neutral'}>
            {NURSING_NOTE_SHIFT_LABELS[selectedShift] ?? selectedShift}
          </Badge>
          {withIncidencia.length > 0 && (
            <span
              className="inline-flex items-center gap-1 rounded-full bg-warm-50 px-3 py-1 text-sm font-semibold text-warm-700"
              role="status"
              aria-live="polite"
            >
              <IconAlert className="text-warm-500" />
              {withIncidencia.length} {withIncidencia.length === 1 ? 'residente con incidencia' : 'residentes con incidencias'}
            </span>
          )}
        </div>
      )}

      {/* Estado de carga */}
      {handoverQuery.isLoading && (
        <div className="flex items-center justify-center py-16">
          <p className="text-sm text-[#1A3A3F]/60">Cargando traspaso…</p>
        </div>
      )}

      {/* Estado vacío */}
      {!handoverQuery.isLoading && handover.length === 0 && selectedCenterId && (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-brand-100 bg-brand-50 py-16 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-100">
            <svg aria-hidden="true" className="h-7 w-7 text-brand-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25z" />
            </svg>
          </div>
          <p className="text-base font-semibold text-[#1A3A3F]">Sin notas en este turno</p>
          <p className="max-w-sm text-sm text-[#1A3A3F]/60">
            No hay notas de enfermería registradas para este turno y fecha.
          </p>
        </div>
      )}

      {/* Lista de residentes con sus notas */}
      {!handoverQuery.isLoading && handover.length > 0 && (
        <ul
          className="flex flex-col gap-4"
          role="list"
          aria-label={`Traspaso de turno ${NURSING_NOTE_SHIFT_LABELS[selectedShift] ?? selectedShift} — ${fmtDate(selectedDate)}`}
        >
          {handover.map(({ resident, notes }) => {
            const hasIncidencia = notes.some((n) => n.category === 'INCIDENCIA');
            const hasNotes = notes.length > 0;

            return (
              <li key={resident.id}>
                <article
                  className={`rounded-2xl border p-4 transition-shadow ${
                    hasIncidencia
                      ? 'border-warm-200 bg-warm-50 shadow-sm'
                      : 'border-brand-100 bg-white'
                  }`}
                  aria-label={`${resident.firstName} ${resident.lastName}${hasIncidencia ? ' — con incidencia' : ''}`}
                >
                  {/* Cabecera del residente */}
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      {hasIncidencia && (
                        <span aria-hidden="true">
                          <IconAlert className="h-4 w-4 text-warm-500" />
                        </span>
                      )}
                      <h2 className="text-base font-semibold text-[#1A3A3F]">
                        {resident.firstName} {resident.lastName}
                      </h2>
                      {resident.bed && (
                        <span className="text-xs text-[#1A3A3F]/50">
                          Plaza {resident.bed.code}
                        </span>
                      )}
                    </div>
                    {hasIncidencia && (
                      <Badge tone="red">
                        Incidencia
                      </Badge>
                    )}
                  </div>

                  {/* Notas del turno */}
                  {!hasNotes ? (
                    <p className="text-sm italic text-[#1A3A3F]/40">Sin notas en este turno.</p>
                  ) : (
                    <ul className="flex flex-col gap-3" role="list" aria-label={`Notas de ${resident.firstName} ${resident.lastName}`}>
                      {notes.map((note) => (
                        <li
                          key={note.id}
                          className={`rounded-xl border p-3 ${
                            note.category === 'INCIDENCIA'
                              ? 'border-warm-200 bg-white'
                              : 'border-brand-100 bg-brand-50'
                          }`}
                        >
                          <div className="mb-1.5 flex flex-wrap items-center gap-2">
                            <Badge tone={CATEGORY_CHIP_TONE[note.category ?? 'GENERAL'] ?? 'neutral'}>
                              {NURSING_NOTE_CATEGORY_LABELS[note.category ?? 'GENERAL'] ?? note.category}
                            </Badge>
                            <span className="text-xs text-[#1A3A3F]/40">
                              {fmtDate(note.noteDate)}
                            </span>
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
                </article>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
