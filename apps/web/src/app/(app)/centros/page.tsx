'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { z } from 'zod';
import {
  Badge,
  Button,
  Card,
  CardContent,
  EmptyState,
  FieldError,
  Input,
  Label,
  Select,
  Skeleton,
  Table,
  Td,
  Th,
} from '@vetlla/ui';
import { api } from '@/trpc/react';
import { useT } from '@/i18n/provider';
import { useToast } from '@/components/toast';
import { useZodForm } from '@/lib/form';

const CENTER_TYPES = ['RESIDENCIA', 'CENTRO_DIA', 'VIVIENDA_TUTELADA'] as const;

const centerSchema = z.object({
  name: z.string().trim().min(2, 'Indica el nombre del centro (mínimo 2 caracteres).').max(120),
});

export default function CentersPage() {
  const utils = api.useUtils();
  const toast = useToast();
  const { t } = useT();
  const me = api.me.useQuery();
  const centers = api.centers.list.useQuery();
  const canWrite = me.data?.permissions.includes('centers:write') ?? false;

  const [query, setQuery] = useState('');
  const [name, setName] = useState('');
  const [type, setType] = useState<(typeof CENTER_TYPES)[number]>('RESIDENCIA');
  const form = useZodForm(centerSchema);

  const create = api.centers.create.useMutation({
    onSuccess: async () => {
      setName('');
      form.clearErrors();
      await utils.centers.list.invalidate();
      toast.success(t('centers.created'));
    },
    onError: (e) => toast.error(e.message),
  });

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (centers.data ?? []).filter((c) => !q || c.name.toLowerCase().includes(q));
  }, [centers.data, query]);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold">{t('centers.title')}</h1>

      {canWrite && (
        <Card>
          <CardContent>
            <form
              className="flex flex-wrap items-end gap-3"
              noValidate
              onSubmit={(e) => {
                e.preventDefault();
                // UX-09: validación inline en cliente antes de llamar al servidor.
                if (!form.validate({ name })) return;
                create.mutate({ name: name.trim(), type });
              }}
            >
              <div className="flex-1">
                <Label htmlFor="name">{t('centers.form.name')}</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  aria-invalid={Boolean(form.errors.name)}
                  placeholder={t('centers.form.namePh')}
                />
                <FieldError>{form.errors.name}</FieldError>
              </div>
              <div>
                <Label htmlFor="type">{t('centers.form.type')}</Label>
                <Select id="type" value={type} onChange={(e) => setType(e.target.value as (typeof CENTER_TYPES)[number])}>
                  {CENTER_TYPES.map((ct) => (
                    <option key={ct} value={ct}>
                      {t(`center.type.${ct}`)}
                    </option>
                  ))}
                </Select>
              </div>
              <Button type="submit" disabled={create.isPending}>
                {create.isPending ? t('centers.form.creating') : t('centers.form.create')}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      <div className="max-w-sm">
        <Label htmlFor="q">{t('centers.search')}</Label>
        <Input
          id="q"
          type="search"
          placeholder={t('centers.searchPh')}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
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
                  <Th>{t('centers.table.name')}</Th>
                  <Th>{t('centers.table.type')}</Th>
                  <Th>{t('centers.table.units')}</Th>
                  <Th>{t('centers.table.residents')}</Th>
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
                      <Badge tone="blue">{t(`center.type.${c.type}`)}</Badge>
                    </Td>
                    <Td>{c._count.units}</Td>
                    <Td>{c._count.residents}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          ) : centers.data && centers.data.length > 0 ? (
            <EmptyState title={t('centers.empty.noResults')} description={t('centers.empty.noResultsDesc')} />
          ) : (
            <EmptyState
              title={t('centers.empty.none')}
              description={canWrite ? t('centers.empty.noneDesc') : undefined}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
