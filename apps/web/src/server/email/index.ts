// Capa de email transaccional provider-agnóstica (misma filosofía que packages/ai):
// una interfaz, varios proveedores, selección por entorno. Sin dependencias nuevas
// (el proveedor HTTP usa fetch). Todo proveedor debe residir en la UE (RGPD).
//
//   EMAIL_PROVIDER=console  -> dev/CI: registra el correo (incluye el enlace) en el log.
//   EMAIL_PROVIDER=http     -> producción: POST a EMAIL_API_URL (p. ej. Scaleway TEM
//                              o la API transaccional de OVHcloud), Bearer EMAIL_API_KEY.
//
// Nunca se loguea el cuerpo en producción; el ConsoleProvider es solo para desarrollo.

import { logger } from '@/server/logger';

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export interface EmailProvider {
  readonly id: string;
  send(message: EmailMessage): Promise<void>;
}

const FROM = process.env.EMAIL_FROM ?? 'Vetlla <no-reply@vetlla.eu>';

/** Dev/CI: no envía nada; deja el correo (con el enlace) en el log para poder probar. */
class ConsoleEmailProvider implements EmailProvider {
  readonly id = 'console';
  async send(message: EmailMessage): Promise<void> {
    // En dev queremos VER el enlace; por eso esto no pasa por redactFields.
    console.info(
      `\n📧 [email:console] → ${message.to}\n   ${message.subject}\n   ${message.text}\n`,
    );
  }
}

/** Producción UE: POST genérico compatible con APIs transaccionales (UE). */
class HttpEmailProvider implements EmailProvider {
  readonly id = 'http';
  constructor(
    private readonly url: string,
    private readonly apiKey: string,
  ) {}

  async send(message: EmailMessage): Promise<void> {
    const res = await fetch(this.url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        from: FROM,
        to: message.to,
        subject: message.subject,
        text: message.text,
        html: message.html ?? message.text,
      }),
    });
    if (!res.ok) {
      // No logueamos el cuerpo (puede contener PII); solo el código y el destino hasheable.
      logger.error('email.send_failed', { provider: this.id, status: res.status });
      throw new Error(`El proveedor de email respondió ${res.status}.`);
    }
  }
}

let cached: EmailProvider | null = null;

export function getEmailProvider(): EmailProvider {
  if (cached) return cached;
  const kind = process.env.EMAIL_PROVIDER ?? 'console';
  if (kind === 'http') {
    const url = process.env.EMAIL_API_URL;
    const key = process.env.EMAIL_API_KEY;
    if (!url || !key) {
      logger.warn('email.http_misconfigured', { fallback: 'console' });
      cached = new ConsoleEmailProvider();
    } else {
      cached = new HttpEmailProvider(url, key);
    }
  } else {
    cached = new ConsoleEmailProvider();
  }
  return cached;
}

export async function sendEmail(message: EmailMessage): Promise<void> {
  await getEmailProvider().send(message);
}
