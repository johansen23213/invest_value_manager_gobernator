/**
 * Construcción del payload de notificación push (RF-NOT-001..005).
 *
 * Módulo PURO (sin efectos secundarios, sin BD, sin imports de Node).
 * Cada tipo de evento de dominio mapea a un payload tipado que el service
 * worker del cliente sabe interpretar.
 *
 * El cliente espera recibir un JSON con esta forma en el evento `push`:
 *
 *   {
 *     title:  string,   // título de la notificación
 *     body:   string,   // cuerpo visible
 *     url:    string,   // URL a abrir al hacer clic (relativa a la raíz)
 *     tag:    string,   // tag para agrupar notificaciones del mismo tipo
 *     icon?:  string,   // icono (opcional; el SW puede usar el default del manifest)
 *   }
 *
 * El tag evita que múltiples notificaciones del mismo tipo se acumulen:
 * el navegador reemplaza la anterior con la nueva si el tag coincide.
 */

export interface PushPayload {
  title: string;
  body:  string;
  url:   string;
  tag:   string;
  icon?: string;
}

// ---------------------------------------------------------------------------
// Tipos de eventos de dominio que pueden generar una notificación push
// ---------------------------------------------------------------------------

export type AnnouncementEvent = {
  type: 'announcement';
  title: string;
  body: string;
  announcementId: string;
};

export type ServiceRequestStatusEvent = {
  type: 'service_request_status';
  requestId: string;
  requestTitle: string;
  newStatus: string;
  residentName: string;
};

export type DomainEvent = AnnouncementEvent | ServiceRequestStatusEvent;

// ---------------------------------------------------------------------------
// Construcción de payload (función pura testable)
// ---------------------------------------------------------------------------

/**
 * Construye el PushPayload a partir de un evento de dominio.
 * Función pura: sin efectos secundarios, determinista, testable sin BD.
 */
export function buildPushPayload(event: DomainEvent): PushPayload {
  switch (event.type) {
    case 'announcement':
      return {
        title: `Comunicado: ${event.title}`,
        body:  truncate(event.body, 120),
        url:   '/comunicados',
        tag:   `announcement-${event.announcementId}`,
      };

    case 'service_request_status':
      return {
        title: `Solicitud actualizada`,
        body:  `"${truncate(event.requestTitle, 60)}" — ${formatStatus(event.newStatus)} · ${event.residentName}`,
        url:   `/solicitudes/${event.requestId}`,
        tag:   `request-${event.requestId}`,
      };
  }
}

// ---------------------------------------------------------------------------
// Helpers privados
// ---------------------------------------------------------------------------

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen - 1) + '…';
}

/**
 * Etiqueta legible del estado de una solicitud.
 * No usa el enum de Prisma para mantener el módulo puro (sin dep de BD).
 */
function formatStatus(status: string): string {
  const labels: Record<string, string> = {
    RECIBIDA:      'Recibida',
    ASIGNADA:      'Asignada',
    EN_CURSO:      'En curso',
    PENDIENTE_INFO: 'Pendiente de información',
    RESUELTA:      'Resuelta',
    CERRADA:       'Cerrada',
    REABIERTA:     'Reabierta',
  };
  return labels[status] ?? status;
}
