'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { Badge, Button, Card, CardContent, CardTitle, Input, Label, Select } from '@vetlla/ui';
import { api } from '@/trpc/react';
import { BED_STATUS_LABELS, CENTER_TYPE_LABELS } from '@/lib/labels';
import { useToast } from '@/components/toast';
import { useConfirm } from '@/components/confirm';

export default function CenterDetailPage() {
  const params = useParams<{ id: string }>();
  const centerId = params.id;
  const utils = api.useUtils();
  const toast = useToast();
  const confirm = useConfirm();
  const me = api.me.useQuery();
  const canWrite = me.data?.permissions.includes('centers:write') ?? false;
  const center = api.centers.get.useQuery({ id: centerId });

  const [unitName, setUnitName] = useState('');
  const [unitFloor, setUnitFloor] = useState('');
  const [bedUnitId, setBedUnitId] = useState('');
  const [bedCode, setBedCode] = useState('');

  const refresh = () => utils.centers.get.invalidate({ id: centerId });

  const createUnit = api.units.create.useMutation({
    onSuccess: async () => {
      setUnitName('');
      setUnitFloor('');
      await refresh();
      toast.success('Unidad creada.');
    },
    onError: (e) => toast.error(e.message),
  });
  const createBed = api.beds.create.useMutation({
    onSuccess: async () => {
      setBedCode('');
      await refresh();
      toast.success('Plaza creada.');
    },
    onError: (e) => toast.error(e.message),
  });
  const deleteBed = api.beds.delete.useMutation({
    onSuccess: async () => {
      await refresh();
      toast.success('Plaza eliminada.');
    },
    onError: (e) => toast.error(e.message),
  });
  const deleteUnit = api.units.delete.useMutation({
    onSuccess: async () => {
      await refresh();
      toast.success('Unidad eliminada.');
    },
    onError: (e) => toast.error(e.message),
  });

  async function confirmDeleteUnit(id: string, name: string) {
    const ok = await confirm({
      title: `Eliminar la unidad "${name}"`,
      description: 'Esta acción no se puede deshacer.',
      confirmLabel: 'Eliminar',
      tone: 'danger',
    });
    if (ok) deleteUnit.mutate({ id });
  }

  async function confirmDeleteBed(id: string, code: string) {
    const ok = await confirm({
      title: `Eliminar la plaza "${code}"`,
      description: 'Esta acción no se puede deshacer.',
      confirmLabel: 'Eliminar',
      tone: 'danger',
    });
    if (ok) deleteBed.mutate({ id });
  }

  if (center.isLoading) return <p className="text-slate-500">Cargando…</p>;
  if (!center.data) return <p className="text-slate-500">Centro no encontrado.</p>;

  const c = center.data;
  const totalBeds = c.units.reduce((n, u) => n + u.beds.length, 0);
  const occupied = c.units.reduce((n, u) => n + u.beds.filter((b) => b.resident).length, 0);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/centros" className="text-sm text-blue-600 hover:underline">
          ← Centros
        </Link>
        <h1 className="mt-1 text-2xl font-bold">{c.name}</h1>
        <p className="text-slate-500">
          <Badge tone="blue">{CENTER_TYPE_LABELS[c.type]}</Badge>{' '}
          {[c.address, c.city].filter(Boolean).join(', ')}
        </p>
        <p className="mt-1 text-sm text-slate-500">
          Ocupación: {occupied} / {totalBeds} plazas · {c._count.residents} residentes
        </p>
      </div>

      {canWrite && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Card>
            <CardContent>
              <CardTitle className="mb-3 text-base">Añadir unidad</CardTitle>
              <form
                className="flex flex-col gap-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  createUnit.mutate({ centerId, name: unitName, floor: unitFloor || undefined });
                }}
              >
                <div>
                  <Label htmlFor="unitName">Nombre</Label>
                  <Input id="unitName" value={unitName} onChange={(e) => setUnitName(e.target.value)} required placeholder="Planta 1" />
                </div>
                <div>
                  <Label htmlFor="unitFloor">Planta (opcional)</Label>
                  <Input id="unitFloor" value={unitFloor} onChange={(e) => setUnitFloor(e.target.value)} />
                </div>
                <Button type="submit" disabled={createUnit.isPending}>
                  Añadir unidad
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardContent>
              <CardTitle className="mb-3 text-base">Añadir plaza</CardTitle>
              <form
                className="flex flex-col gap-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  createBed.mutate({ unitId: bedUnitId, code: bedCode });
                }}
              >
                <div>
                  <Label htmlFor="bedUnit">Unidad</Label>
                  <Select id="bedUnit" value={bedUnitId} onChange={(e) => setBedUnitId(e.target.value)} required>
                    <option value="">Selecciona…</option>
                    {c.units.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name}
                      </option>
                    ))}
                  </Select>
                </div>
                <div>
                  <Label htmlFor="bedCode">Código</Label>
                  <Input id="bedCode" value={bedCode} onChange={(e) => setBedCode(e.target.value)} required placeholder="101-A" />
                </div>
                <Button type="submit" disabled={createBed.isPending || !bedUnitId}>
                  Añadir plaza
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      )}

      {c.units.length === 0 ? (
        <p className="text-slate-500">No hay unidades todavía.</p>
      ) : (
        c.units.map((u) => (
          <Card key={u.id}>
            <CardContent>
              <div className="mb-3 flex items-center justify-between">
                <CardTitle className="text-base">
                  {u.name} {u.floor ? <span className="text-slate-400">· {u.floor}</span> : null}
                </CardTitle>
                {canWrite && u.beds.length === 0 && (
                  <Button variant="ghost" size="sm" onClick={() => confirmDeleteUnit(u.id, u.name)}>
                    Eliminar unidad
                  </Button>
                )}
              </div>
              {u.beds.length === 0 ? (
                <p className="text-sm text-slate-500">Sin plazas.</p>
              ) : (
                <ul className="flex flex-wrap gap-2">
                  {u.beds.map((b) => (
                    <li
                      key={b.id}
                      className="flex items-center gap-2 rounded-md border border-slate-200 px-3 py-2 text-sm"
                    >
                      <span className="font-medium">{b.code}</span>
                      {b.status === 'FUERA_SERVICIO' ? (
                        <Badge tone="neutral">{BED_STATUS_LABELS[b.status]}</Badge>
                      ) : b.resident ? (
                        <Badge tone="amber">
                          {b.resident.firstName} {b.resident.lastName}
                        </Badge>
                      ) : (
                        <Badge tone="green">Libre</Badge>
                      )}
                      {canWrite && !b.resident && (
                        <button
                          type="button"
                          aria-label={`Eliminar plaza ${b.code}`}
                          className="text-slate-400 hover:text-red-600"
                          onClick={() => confirmDeleteBed(b.id, b.code)}
                        >
                          ×
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}
