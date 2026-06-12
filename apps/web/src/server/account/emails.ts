// Plantillas de los correos de cuenta. Texto sobrio, es-ES; el enlace caduca.
// La base URL sale de AUTH_URL (o localhost en dev).

function baseUrl(): string {
  return process.env.AUTH_URL ?? process.env.NEXTAUTH_URL ?? 'http://localhost:3000';
}

export function passwordResetEmail(token: string) {
  const url = `${baseUrl()}/restablecer?token=${token}`;
  return {
    subject: 'Restablece tu contraseña de Vetlla',
    text: [
      'Has solicitado restablecer tu contraseña de Vetlla.',
      '',
      `Abre este enlace para crear una nueva (caduca en 1 hora):`,
      url,
      '',
      'Si no has sido tú, ignora este correo: tu contraseña no cambiará.',
    ].join('\n'),
  };
}

export function invitationEmail(token: string, orgName: string) {
  const url = `${baseUrl()}/restablecer?token=${token}`;
  return {
    subject: `Te han dado acceso a Vetlla (${orgName})`,
    text: [
      `Te han creado una cuenta en Vetlla para ${orgName}.`,
      '',
      'Abre este enlace para establecer tu contraseña y entrar (caduca en 7 días):',
      url,
    ].join('\n'),
  };
}

// Etiquetas en español para los estados de solicitud (email transaccional).
const REQUEST_STATUS_LABELS: Record<string, string> = {
  RECIBIDA: 'Recibida',
  ASIGNADA: 'Asignada al equipo',
  EN_CURSO: 'En curso',
  PENDIENTE_INFO: 'Pendiente de información',
  RESUELTA: 'Resuelta',
  CERRADA: 'Cerrada',
  REABIERTA: 'Reabierta',
};

// ---------------------------------------------------------------------------
// Comunicaciones — plantillas de email (COM-007)
// ---------------------------------------------------------------------------

/**
 * Notificación al familiar cuando hay un nuevo mensaje del staff en su hilo.
 * El email es no-throw en el router; un fallo no interrumpe la operación.
 */
export function newMessageEmail(opts: {
  threadSubject: string;
  threadId: string;
  residentName: string;
}) {
  const url = `${baseUrl()}/portal/mensajes/${opts.threadId}`;
  return {
    subject: `Nuevo mensaje: ${opts.threadSubject}`,
    text: [
      `El centro ha respondido en el hilo "${opts.threadSubject}" (${opts.residentName}).`,
      '',
      'Puedes leer la respuesta y continuar la conversación en:',
      url,
      '',
      'Si tienes dudas, contacta directamente con el centro.',
    ].join('\n'),
  };
}

/**
 * Notificación interna cuando un familiar envía un mensaje al centro.
 * Se usa opcionalmente para alertar al email genérico del centro (si está configurado).
 */
export function familyMessageEmail(opts: {
  threadSubject: string;
  threadId: string;
  familyName: string;
  residentName: string;
}) {
  const url = `${baseUrl()}/comunicacion/mensajes/${opts.threadId}`;
  return {
    subject: `Mensaje de familiar — ${opts.threadSubject}`,
    text: [
      `${opts.familyName} ha enviado un mensaje en el hilo "${opts.threadSubject}" (${opts.residentName}).`,
      '',
      'Puedes leer y responder desde el backoffice en:',
      url,
    ].join('\n'),
  };
}

// ---------------------------------------------------------------------------
// Visitas (VIS-001..VIS-010) — plantillas de email
// ---------------------------------------------------------------------------

/**
 * Confirmación de visita al familiar — incluye el CÓDIGO QR de forma visible.
 * Enviado al confirmar (auto-approve o aprobación manual).
 */
export function visitConfirmedEmail(opts: {
  residentName: string;
  scheduledAt:  string; // fecha y hora formateada en es-ES
  visitorNames: string[];
  qrCode:       string;
  visitId:      string;
}) {
  const url = `${baseUrl()}/portal/visitas/${opts.visitId}`;
  const visitorsLine = opts.visitorNames.length > 0
    ? `Visitantes: ${opts.visitorNames.join(', ')}`
    : 'Solo el solicitante.';
  return {
    subject: `Visita confirmada — ${opts.residentName}`,
    text: [
      `Tu visita a ${opts.residentName} ha sido confirmada.`,
      '',
      `Fecha y hora: ${opts.scheduledAt}`,
      visitorsLine,
      '',
      '──────────────────────────────',
      `  CÓDIGO DE VISITA: ${opts.qrCode}`,
      '──────────────────────────────',
      '',
      'Presenta este código en recepción al llegar. El código es válido únicamente el día de la visita.',
      '',
      'Puedes consultar los detalles de tu visita en:',
      url,
      '',
      'Si necesitas cancelarla, hazlo con antelación desde el portal.',
    ].join('\n'),
  };
}

/**
 * Visita rechazada — notifica al familiar con el motivo.
 */
export function visitRejectedEmail(opts: {
  residentName: string;
  scheduledAt:  string;
  reason?:      string;
  visitId:      string;
}) {
  const url = `${baseUrl()}/portal/visitas`;
  return {
    subject: `Visita no aprobada — ${opts.residentName}`,
    text: [
      `Lamentamos informarte de que tu solicitud de visita a ${opts.residentName} (${opts.scheduledAt}) no ha podido ser aprobada.`,
      '',
      ...(opts.reason ? [`Motivo: ${opts.reason}`, ''] : []),
      'Puedes solicitar una nueva visita en:',
      url,
      '',
      'Si tienes dudas, contacta directamente con el centro.',
    ].join('\n'),
  };
}

/**
 * Visita cancelada — notifica a la otra parte.
 * Se envía al familiar cuando cancela el staff, y al staff (email del centro)
 * cuando cancela el familiar (si el centro tiene email configurado).
 */
export function visitCancelledEmail(opts: {
  residentName: string;
  scheduledAt:  string;
  reason?:      string;
  cancelledBy:  'familiar' | 'staff';
}) {
  const who = opts.cancelledBy === 'staff' ? 'el equipo del centro' : 'el solicitante';
  return {
    subject: `Visita cancelada — ${opts.residentName}`,
    text: [
      `La visita a ${opts.residentName} del ${opts.scheduledAt} ha sido cancelada por ${who}.`,
      '',
      ...(opts.reason ? [`Motivo: ${opts.reason}`, ''] : []),
      'Puedes solicitar una nueva visita desde el portal de familias.',
    ].join('\n'),
  };
}

export function requestStatusChangedEmail(opts: {
  requestTitle: string;
  requestId: string;
  newStatus: string;
}) {
  const statusLabel = REQUEST_STATUS_LABELS[opts.newStatus] ?? opts.newStatus;
  const url = `${baseUrl()}/portal/solicitudes/${opts.requestId}`;
  return {
    subject: `Tu solicitud ha cambiado de estado: ${statusLabel}`,
    text: [
      `Tu solicitud "${opts.requestTitle}" ha sido actualizada.`,
      '',
      `Nuevo estado: ${statusLabel}`,
      '',
      'Puedes consultar el detalle y añadir comentarios en:',
      url,
      '',
      'Si tienes dudas, contacta directamente con el centro.',
    ].join('\n'),
  };
}
