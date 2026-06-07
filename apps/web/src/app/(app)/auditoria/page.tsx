'use client';

import { Badge, Card, CardContent, EmptyState, Skeleton, Table, Td, Th } from '@vetlla/ui';
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
      <div>
        <h1 className="text-2xl font-bold">Registro de actividad</h1>
        <p className="text-sm text-slate-500">
          Trazabilidad de las acciones sobre datos personales (RGPD). Registro inmutable.
        </p>
      </div>

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
              <thead>
                <tr>
                  <Th>Fecha</Th>
                  <Th>Usuario</Th>
                  <Th>Acción</Th>
                  <Th>Entidad</Th>
                  <Th>Detalle</Th>
                </tr>
              </thead>
              <tbody>
                {logs.data.map((l) => (
                  <tr key={l.id}>
                    <Td className="whitespace-nowrap text-slate-500">
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
