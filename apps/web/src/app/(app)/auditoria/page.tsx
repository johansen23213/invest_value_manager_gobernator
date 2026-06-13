'use client';

import { Badge, Card, CardContent, EmptyState, PageHeader, Skeleton, Table, Td, Th } from '@vetlla/ui';
import { api } from '@/trpc/react';
import { useT } from '@/i18n/provider';
import { formatDateTime } from '@/lib/format';
import { AUDIT_ACTION_LABELS } from '@/lib/labels';

const ACTION_TONE: Record<string, 'green' | 'amber' | 'red' | 'blue' | 'neutral'> = {
  CREATE: 'green',
  UPDATE: 'blue',
  DELETE: 'red',
  ADMINISTER: 'blue',
  RECORD: 'neutral',
  LOGIN: 'neutral',
};

export default function AuditPage() {
  const { locale } = useT();
  const logs = api.audit.list.useQuery({ limit: 100 });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Registro de actividad"
        subtitle="Trazabilidad de las acciones sobre datos personales (RGPD). Registro inmutable."
        accent
      />

      <Card>
        <CardContent>
          {logs.isLoading ? (
            <div className="flex flex-col gap-2">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-9 w-full" />
              ))}
            </div>
          ) : logs.data && logs.data.length > 0 ? (
            <Table>
              <thead className="bg-brand-50">
                <tr>
                  <Th className="text-brand-700">Fecha</Th>
                  <Th className="text-brand-700">Usuario</Th>
                  <Th className="text-brand-700">Acción</Th>
                  <Th className="text-brand-700">Entidad</Th>
                  <Th className="text-brand-700">Detalle</Th>
                </tr>
              </thead>
              <tbody>
                {logs.data.map((l) => (
                  <tr key={l.id}>
                    <Td className="whitespace-nowrap text-[#1A3A3F]/60">
                      {formatDateTime(locale, l.createdAt)}
                    </Td>
                    <Td>{l.actorEmail ?? '—'}</Td>
                    <Td>
                      <Badge tone={ACTION_TONE[l.action] ?? 'neutral'}>
                        {AUDIT_ACTION_LABELS[l.action] ?? l.action}
                      </Badge>
                    </Td>
                    <Td>{l.entity}</Td>
                    <Td>{l.summary ?? '—'}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          ) : (
            <EmptyState
              title="Sin actividad registrada"
              description="Las acciones sobre datos personales aparecerán aquí."
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
