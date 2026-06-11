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
