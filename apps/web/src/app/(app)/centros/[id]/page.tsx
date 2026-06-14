'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { Badge, Button, Card, CardContent, CardTitle, Input, Label, Select } from '@vetlla/ui';
import { api } from '@/trpc/react';
import { BED_STATUS_LABELS, CENTER_TYPE_LABELS } from '@/lib/labels';
import { useToast } from '@/components/toast';
import { useConfirm } from '@/components/confirm';
import { useT } from '@/i18n/provider';

export default function CenterDetailPage() {
  const params = useParams<{ id: string }>();
  const centerId = params.id;
  const utils = api.useUtils();
  const toast = useToast();
  const confirm = useConfirm();
  const { t } = useT();
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
      toast.success(t('centers.detail.unit.created'));
    },
    onError: (e) => toast.error(e.message),
  });
  const createBed = api.beds.create.useMutation({
    onSuccess: async () => {
      setBedCode('');
      await refresh();
      toast.success(t('centers.detail.bed.created'));
    },
    onError: (e) => toast.error(e.message),
  });
  const deleteBed = api.beds.delete.useMutation({
    onSuccess: async () => {
      await refresh();
      toast.success(t('centers.detail.bed.deleted'));
    },
    onError: (e) => toast.error(e.message),
  });
  const deleteUnit = api.units.delete.useMutation({
    onSuccess: async () => {
      await refresh();
      toast.success(t('centers.detail.unit.deleted'));
    },
    onError: (e) => toast.error(e.message),
  });

  async function confirmDeleteUnit(id: string, name: string) {
    const ok = await confirm({
      title: t('centers.detail.deleteUnit.title', { name }),
      description: t('centers.detail.deleteUnit.desc'),
      confirmLabel: t('centers.detail.deleteUnit.confirm'),
      tone: 'danger',
    });
    if (ok) deleteUnit.mutate({ id });
  }

  async function confirmDeleteBed(id: string, code: string) {
    const ok = await confirm({
      title: t('centers.detail.deleteBed.title', { code }),
      description: t('centers.detail.deleteBed.desc'),
      confirmLabel: t('centers.detail.deleteBed.confirm'),
      tone: 'danger',
    });
    if (ok) deleteBed.mutate({ id });
  }

  if (center.isLoading) return <p className="text-[#1A3A3F]/60">{t('centers.detail.loading')}</p>;
  if (!center.data) return <p className="text-[#1A3A3F]/60">{t('centers.detail.notFound')}</p>;

  const c = center.data;
  const totalBeds = c.units.reduce((n, u) => n + u.beds.length, 0);
  const occupied = c.units.reduce((n, u) => n + u.beds.filter((b) => b.resident).length, 0);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/centros" className="text-sm text-brand-700 hover:underline">
          {t('centers.detail.backToCenters')}
        </Link>
        <h1 className="mt-1 text-2xl font-bold">{c.name}</h1>
        <p className="text-[#1A3A3F]/60">
          <Badge tone="blue">{CENTER_TYPE_LABELS[c.type]}</Badge>{' '}
          {[c.address, c.city].filter(Boolean).join(', ')}
        </p>
        <p className="mt-1 text-sm text-[#1A3A3F]/60">
          {t('centers.detail.occupancy', { occupied, total: totalBeds, residents: c._count.residents })}
        </p>
      </div>

      {canWrite && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Card>
            <CardContent>
              <CardTitle className="mb-3 text-base">{t('centers.detail.addUnit')}</CardTitle>
              <form
                className="flex flex-col gap-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  createUnit.mutate({ centerId, name: unitName, floor: unitFloor || undefined });
                }}
              >
                <div>
                  <Label htmlFor="unitName">{t('centers.detail.unit.name')}</Label>
                  <Input id="unitName" value={unitName} onChange={(e) => setUnitName(e.target.value)} required placeholder="Planta 1" />
                </div>
                <div>
                  <Label htmlFor="unitFloor">{t('centers.detail.unit.floor')}</Label>
                  <Input id="unitFloor" value={unitFloor} onChange={(e) => setUnitFloor(e.target.value)} />
                </div>
                <Button type="submit" disabled={createUnit.isPending}>
                  {t('centers.detail.unit.submit')}
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardContent>
              <CardTitle className="mb-3 text-base">{t('centers.detail.addBed')}</CardTitle>
              <form
                className="flex flex-col gap-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  createBed.mutate({ unitId: bedUnitId, code: bedCode });
                }}
              >
                <div>
                  <Label htmlFor="bedUnit">{t('centers.detail.bed.unit')}</Label>
                  <Select id="bedUnit" value={bedUnitId} onChange={(e) => setBedUnitId(e.target.value)} required>
                    <option value="">{t('centers.detail.bed.unitPh')}</option>
                    {c.units.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name}
                      </option>
                    ))}
                  </Select>
                </div>
                <div>
                  <Label htmlFor="bedCode">{t('centers.detail.bed.code')}</Label>
                  <Input id="bedCode" value={bedCode} onChange={(e) => setBedCode(e.target.value)} required placeholder="101-A" />
                </div>
                <Button type="submit" disabled={createBed.isPending || !bedUnitId}>
                  {t('centers.detail.bed.submit')}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      )}

      {c.units.length === 0 ? (
        <p className="text-[#1A3A3F]/60">{t('centers.detail.noUnits')}</p>
      ) : (
        c.units.map((u) => (
          <Card key={u.id}>
            <CardContent>
              <div className="mb-3 flex items-center justify-between">
                <CardTitle className="text-base">
                  {u.name} {u.floor ? <span className="text-[#1A3A3F]/40">· {u.floor}</span> : null}
                </CardTitle>
                {canWrite && u.beds.length === 0 && (
                  <Button variant="ghost" size="sm" onClick={() => confirmDeleteUnit(u.id, u.name)}>
                    {t('centers.detail.deleteUnit')}
                  </Button>
                )}
              </div>
              {u.beds.length === 0 ? (
                <p className="text-sm text-[#1A3A3F]/60">{t('centers.detail.noBeds')}</p>
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
                        <Badge tone="green">{t('centers.detail.bed.free')}</Badge>
                      )}
                      {canWrite && !b.resident && (
                        <button
                          type="button"
                          aria-label={t('centers.detail.deleteBed.aria', { code: b.code })}
                          className="text-[#1A3A3F]/40 hover:text-red-600"
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
