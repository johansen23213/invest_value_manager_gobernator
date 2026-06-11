'use client';

import type { ReactNode } from 'react';
import { useParams } from 'next/navigation';
import { ResidentChrome } from './resident-chrome';

/**
 * Layout compartido de las subpáginas del residente (Expediente / Medicación / PIA).
 * Renderiza el chrome persistente (migas + cabecera + sub-nav) una sola vez por encima
 * del contenido de cada página (UX-11).
 */
export default function ResidentLayout({ children }: { children: ReactNode }) {
  const params = useParams<{ id: string }>();
  return (
    <div className="flex flex-col gap-6">
      <ResidentChrome residentId={params.id} />
      {children}
    </div>
  );
}
