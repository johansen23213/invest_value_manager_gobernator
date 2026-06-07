'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Badge, Button, Card, CardContent, Input, Label, Select, Table, Td, Th } from '@vetlla/ui';
import { api } from '@/trpc/react';
import { CENTER_TYPE_LABELS } from '@/lib/labels';

const CENTER_TYPES = ['RESIDENCIA', 'CENTRO_DIA', 'VIVIENDA_TUTELADA'] as const;

export default function CentersPage() {
  const utils = api.useUtils();
  const me = api.me.useQuery();
  const centers = api.centers.list.useQuery();
  const canWrite = me.data?.permissions.includes('centers:write') ?? false;

  const [name, setName] = useState('');
  const [type, setType] = useState<(typeof CENTER_TYPES)[number]>('RESIDENCIA');

  const create = api.centers.create.useMutation({
    onSuccess: async () => {
      setName('');
      await utils.centers.list.invalidate();
    },
  });

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold">Centros</h1>

      {canWrite && (
        <Card>
          <CardContent>
            <form
              className="flex flex-wrap items-end gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                create.mutate({ name, type });
              }}
            >
              <div className="flex-1">
                <Label htmlFor="name">Nombre</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  minLength={2}
                  placeholder="Residencia Los Olivos"
                />
              </div>
              <div>
                <Label htmlFor="type">Tipo</Label>
                <Select
                  id="type"
                  value={type}
                  onChange={(e) => setType(e.target.value as (typeof CENTER_TYPES)[number])}
                >
                  {CENTER_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {CENTER_TYPE_LABELS[t]}
                    </option>
                  ))}
                </Select>
              </div>
              <Button type="submit" disabled={create.isPending}>
                {create.isPending ? 'Creando…' : 'Crear centro'}
              </Button>
            </form>
            {create.error && (
              <p role="alert" className="mt-2 text-sm text-red-600">
                {create.error.message}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent>
          {centers.isLoading ? (
            <p className="text-slate-500">Cargando…</p>
          ) : centers.data && centers.data.length > 0 ? (
            <Table>
              <thead>
                <tr>
                  <Th>Nombre</Th>
                  <Th>Tipo</Th>
                  <Th>Unidades</Th>
                  <Th>Residentes</Th>
                </tr>
              </thead>
              <tbody>
                {centers.data.map((c) => (
                  <tr key={c.id}>
                    <Td>
                      <Link href={`/centros/${c.id}`} className="font-medium text-blue-600 hover:underline">
                        {c.name}
                      </Link>
                    </Td>
                    <Td>
                      <Badge tone="blue">{CENTER_TYPE_LABELS[c.type]}</Badge>
                    </Td>
                    <Td>{c._count.units}</Td>
                    <Td>{c._count.residents}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          ) : (
            <p className="text-slate-500">No hay centros todavía.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
