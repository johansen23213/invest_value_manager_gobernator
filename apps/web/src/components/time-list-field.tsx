'use client';

import { useState } from 'react';
import { Button, Input } from '@vetlla/ui';

// Editor de horas de pauta (UX-02): chips + selector de hora, en vez de teclear
// "08:00,20:00" a mano. Evita errores de formato en la medicación.
export function TimeListField({
  value,
  onChange,
}: {
  value: string[];
  onChange: (next: string[]) => void;
}) {
  const [draft, setDraft] = useState('');

  function add() {
    if (!/^\d{2}:\d{2}$/.test(draft)) return;
    if (value.includes(draft)) {
      setDraft('');
      return;
    }
    onChange([...value, draft].sort());
    setDraft('');
  }

  function remove(time: string) {
    onChange(value.filter((t) => t !== time));
  }

  return (
    <div>
      <ul className="mb-2 flex flex-wrap gap-2" aria-label="Horas de pauta">
        {value.length === 0 && <li className="text-sm text-slate-400">Sin horas</li>}
        {value.map((t) => (
          <li
            key={t}
            className="flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1 text-sm font-medium"
          >
            {t}
            <button
              type="button"
              onClick={() => remove(t)}
              aria-label={`Quitar las ${t}`}
              className="text-slate-400 hover:text-red-600"
            >
              ×
            </button>
          </li>
        ))}
      </ul>
      <div className="flex gap-2">
        <Input
          type="time"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          aria-label="Nueva hora"
          className="max-w-[140px]"
        />
        <Button type="button" variant="secondary" size="sm" onClick={add} disabled={!draft}>
          Añadir hora
        </Button>
      </div>
    </div>
  );
}
