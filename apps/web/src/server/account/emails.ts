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
