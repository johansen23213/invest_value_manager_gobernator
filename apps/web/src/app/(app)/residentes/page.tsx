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
import { DEPENDENCY_GRADE_LABELS, RESIDENT_STATUS_LABELS } from '@/lib/labels';
import { useToast } from '@/components/toast';

const GRADES = ['SIN_VALORAR', 'GRADO_I', 'GRADO_II', 'GRADO_III'] as const;
const STATUSES = ['ACTIVO', 'PREINGRESO', 'BAJA'] as const;

export default function ResidentsPage() {
  const utils = api.useUtils();
  const toast = useToast();
  const me = api.me.useQuery();
  const canWrite = me.data?.permissions.includes('residents:write') ?? false;
  const residents = api.residents.list.useQuery();
  const centers = api.centers.list.useQuery();

  // Filtros (UX-10)
  const [query, setQuery] = useState('');
  const [centerFilter, setCenterFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  // Alta
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [centerId, setCenterId] = useState('');
  const [grade, setGrade] = useState<(typeof GRADES)[number]>('SIN_VALORAR');

  const create = api.residents.create.useMutation({
    onSuccess: async () => {
      setFirstName('');
      setLastName('');
      await utils.residents.list.invalidate();
      toast.success('Residente dado de alta.');
    },
    onError: (e) => toast.error(e.message),
  });

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (residents.data ?? []).filter((r) => {
      if (q && !`${r.firstName} ${r.lastName}`.toLowerCase().includes(q)) return false;
      if (centerFilter && r.center.id !== centerFilter) return false;
      if (statusFilter && r.status !== statusFilter) return false;
      return true;
    });
  }, [residents.data, query, centerFilter, statusFilter]);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold">Residentes</h1>

      {canWrite && (
        <Card>
          <CardContent>
            <form
              className="flex flex-wrap items-end gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                create.mutate({ firstName, lastName, centerId, dependencyGrade: grade });
              }}
            >
              <div>
                <Label htmlFor="firstName">Nombre</Label>
                <Input id="firstName" value={firstName} onChange={(e) => setFirstName(e.target.value)} required />
              </div>
              <div>
                <Label htmlFor="lastName">Apellidos</Label>
                <Input id="lastName" value={lastName} onChange={(e) => setLastName(e.target.value)} required />
              </div>
              <div>
                <Label htmlFor="center">Centro</Label>
                <Select id="center" value={centerId} onChange={(e) => setCenterId(e.target.value)} required>
                  <option value="">Selecciona…</option>
                  {centers.data?.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label htmlFor="grade">Dependencia</Label>
                <Select id="grade" value={grade} onChange={(e) => setGrade(e.target.value as (typeof GRADES)[number])}>
                  {GRADES.map((g) => (
                    <option key={g} value={g}>
                      {DEPENDENCY_GRADE_LABELS[g]}
                    </option>
                  ))}
                </Select>
              </div>
              <Button type="submit" disabled={create.isPending || !centerId}>
                {create.isPending ? 'Creando…' : 'Alta de residente'}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Buscador y filtros */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[220px] flex-1">
          <Label htmlFor="q">Buscar</Label>
          <Input id="q" type="search" placeholder="Nombre o apellidos…" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="fcenter">Centro</Label>
          <Select id="fcenter" value={centerFilter} onChange={(e) => setCenterFilter(e.target.value)}>
            <option value="">Todos</option>
            {centers.data?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="fstatus">Estado</Label>
          <Select id="fstatus" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">Todos</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {RESIDENT_STATUS_LABELS[s]}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <Card>
        <CardContent>
          {residents.isLoading ? (
            <div className="flex flex-col gap-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : filtered.length > 0 ? (
            <>
              <p className="mb-2 text-sm text-slate-500">{filtered.length} residentes</p>
              <Table>
                <thead>
                  <tr>
                    <Th>Residente</Th>
                    <Th>Centro</Th>
                    <Th>Plaza</Th>
                    <Th>Dependencia</Th>
                    <Th>Estado</Th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r) => (
                    <tr key={r.id}>
                      <Td>
                        <Link href={`/residentes/${r.id}`} className="font-medium text-blue-600 hover:underline">
                          {r.lastName}, {r.firstName}
                        </Link>
                      </Td>
                      <Td>{r.center.name}</Td>
                      <Td>{r.bed ? `${r.bed.code} (${r.bed.unit.name})` : '—'}</Td>
                      <Td>{DEPENDENCY_GRADE_LABELS[r.dependencyGrade]}</Td>
                      <Td>
                        <Badge tone={r.status === 'ACTIVO' ? 'green' : 'neutral'}>
                          {RESIDENT_STATUS_LABELS[r.status]}
                        </Badge>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </>
          ) : residents.data && residents.data.length > 0 ? (
            <EmptyState title="Sin resultados" description="Prueba a cambiar la búsqueda o los filtros." />
          ) : (
            <EmptyState title="No hay residentes todavía" description={canWrite ? 'Da de alta el primero con el formulario de arriba.' : undefined} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
