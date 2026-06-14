/**
 * Tests unitarios para la construcción de payloads push (RF-NOT-001..005).
 * Módulo puro: sin BD, sin efectos secundarios, sin variables de entorno.
 */

import { describe, expect, it } from 'vitest';
import { buildPushPayload } from './payload';
import type { AnnouncementEvent, ServiceRequestStatusEvent } from './payload';

// ---------------------------------------------------------------------------
// Evento de tipo announcement
// ---------------------------------------------------------------------------

describe('buildPushPayload — announcement', () => {
  const base: AnnouncementEvent = {
    type:           'announcement',
    title:          'Reunión de familias',
    body:           'Os invitamos a la reunión trimestral de familias el próximo jueves.',
    announcementId: 'ann-123',
  };

  it('genera título con prefijo "Comunicado:"', () => {
    const payload = buildPushPayload(base);
    expect(payload.title).toBe('Comunicado: Reunión de familias');
  });

  it('usa el body completo si es menor de 120 caracteres', () => {
    const payload = buildPushPayload(base);
    expect(payload.body).toBe(base.body);
    expect(payload.body.length).toBeLessThanOrEqual(120);
  });

  it('trunca el body a 120 caracteres + ellipsis si es muy largo', () => {
    const longBody = 'A'.repeat(200);
    const payload = buildPushPayload({ ...base, body: longBody });
    expect(payload.body.length).toBe(120);
    expect(payload.body.endsWith('…')).toBe(true);
  });

  it('genera URL /comunicados', () => {
    const payload = buildPushPayload(base);
    expect(payload.url).toBe('/comunicados');
  });

  it('genera tag con el announcementId', () => {
    const payload = buildPushPayload(base);
    expect(payload.tag).toBe('announcement-ann-123');
  });

  it('distintos announcementId generan distintos tags (sin colisión)', () => {
    const p1 = buildPushPayload({ ...base, announcementId: 'ann-1' });
    const p2 = buildPushPayload({ ...base, announcementId: 'ann-2' });
    expect(p1.tag).not.toBe(p2.tag);
  });
});

// ---------------------------------------------------------------------------
// Evento de tipo service_request_status
// ---------------------------------------------------------------------------

describe('buildPushPayload — service_request_status', () => {
  const base: ServiceRequestStatusEvent = {
    type:         'service_request_status',
    requestId:    'req-456',
    requestTitle: 'Necesitamos más pañales para mi madre',
    newStatus:    'RESUELTA',
    residentName: 'Carmen López',
  };

  it('genera título "Solicitud actualizada"', () => {
    const payload = buildPushPayload(base);
    expect(payload.title).toBe('Solicitud actualizada');
  });

  it('incluye el título de la solicitud truncado a 60 chars', () => {
    const payload = buildPushPayload(base);
    expect(payload.body).toContain('Necesitamos más pañales para mi madre');
  });

  it('incluye la etiqueta legible del estado', () => {
    const payload = buildPushPayload(base);
    expect(payload.body).toContain('Resuelta');
  });

  it('incluye el nombre del residente', () => {
    const payload = buildPushPayload(base);
    expect(payload.body).toContain('Carmen López');
  });

  it('genera URL /solicitudes/{requestId}', () => {
    const payload = buildPushPayload(base);
    expect(payload.url).toBe('/solicitudes/req-456');
  });

  it('genera tag con el requestId', () => {
    const payload = buildPushPayload(base);
    expect(payload.tag).toBe('request-req-456');
  });

  it('trunca el título de la solicitud a 60 chars + ellipsis', () => {
    const longTitle = 'T'.repeat(100);
    const payload = buildPushPayload({ ...base, requestTitle: longTitle });
    // El título truncado tiene 60 chars: 59 + '…'
    expect(payload.body).toContain('…');
    // El body completo no supera un tamaño razonable
    expect(payload.body.length).toBeLessThan(300);
  });

  it('todos los estados conocidos tienen etiqueta legible (no el literal del enum)', () => {
    const statuses = [
      ['RECIBIDA',       'Recibida'],
      ['ASIGNADA',       'Asignada'],
      ['EN_CURSO',       'En curso'],
      ['PENDIENTE_INFO', 'Pendiente de información'],
      ['RESUELTA',       'Resuelta'],
      ['CERRADA',        'Cerrada'],
      ['REABIERTA',      'Reabierta'],
    ] as const;

    for (const [status, label] of statuses) {
      const payload = buildPushPayload({ ...base, newStatus: status });
      expect(payload.body, `estado ${status} debería mostrar "${label}"`).toContain(label);
    }
  });

  it('estado desconocido muestra el literal como fallback', () => {
    const payload = buildPushPayload({ ...base, newStatus: 'ESTADO_RARO' });
    expect(payload.body).toContain('ESTADO_RARO');
  });
});

// ---------------------------------------------------------------------------
// Propiedades estructurales del payload
// ---------------------------------------------------------------------------

describe('PushPayload — estructura', () => {
  it('siempre tiene title, body, url y tag (nunca undefined)', () => {
    const events = [
      {
        type:           'announcement' as const,
        title:          'T',
        body:           'B',
        announcementId: 'id',
      },
      {
        type:         'service_request_status' as const,
        requestId:    'r',
        requestTitle: 'RT',
        newStatus:    'RESUELTA',
        residentName: 'Nombre',
      },
    ];

    for (const event of events) {
      const payload = buildPushPayload(event);
      expect(payload.title).toBeDefined();
      expect(payload.body).toBeDefined();
      expect(payload.url).toBeDefined();
      expect(payload.tag).toBeDefined();
    }
  });
});
