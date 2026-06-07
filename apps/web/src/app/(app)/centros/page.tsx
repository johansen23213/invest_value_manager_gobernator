'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import {
  Badge,
  Button,
  Card,
  CardContent,
  EmptyState,
  Input,
  Label,
  Select,
  Skeleton,
  Table,
  Td,
  Th,
} from '@vetlla/ui';
import { api } from '@/trpc/react';
import { CENTER_TYPE_LABELS } from '@/lib/labels';
import { useToast } from '@/components/toast';

const CENTER_TYPES = ['RESIDENCIA', 'CENTRO_DIA', 'VIVIENDA_TUTELADA'] as const;

export default function CentersPage() {
  const utils = api.useUtils();
  const toast = useToast();
  const me = api.me.useQuery();
  const centers = api.centers.list.useQuery();
  const canWrite = me.data?.permissions.includes('centers:write') ?? false;

  const [query, setQuery] = useState('');
  const [name, setName] = useState('');
  const [type, setType] = useState<(typeof CENTER_TYPES)[number]>('RESIDENCIA');

  const create = api.centers.create.useMutation({
    onSuccess: async () => {
      setName('');
      await utils.centers.list.invalidate();
      toast.success('Centro creado.');
    },
    onError: (e) => toast.error(e.message),
  });

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (centers.data ?? []).filter((c) => !q || c.name.toLowerCase().includes(q));
  }, [centers.data, query]);

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
                <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required minLength={2} placeholder="Residencia Los Olivos" />
              </div>
              <div>
                <Label htmlFor="type">Tipo</Label>
                <Select id="type" value={type} onChange={(e) => setType(e.target.value as (typeof CENTER_TYPES)[number])}>
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
          </CardContent>
        </Card>
      )}

      <div className="max-w-sm">
        <Label htmlFor="q">Buscar</Label>
        <Input id="q" type="search" placeholder="Nombre del centro…" value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>

      <Card>
        <CardContent>
          {centers.isLoading ? (
            <div className="flex flex-col gap-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : filtered.length > 0 ? (
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
                {filtered.map((c) => (
                  <tr key={c.id}>
                    <Td>
                      <Link href={`/centros/${c.id}`} className="font-medium text-brand-700 hover:underline">
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
          ) : centers.data && centers.data.length > 0 ? (
            <EmptyState title="Sin resultados" description="Ningún centro coincide con la búsqueda." />
          ) : (
            <EmptyState title="No hay centros todavía" description={canWrite ? 'Crea el primero con el formulario de arriba.' : undefined} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
