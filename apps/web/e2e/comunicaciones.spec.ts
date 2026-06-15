/**
 * Suite e2e — Comunicaciones (COM-001..COM-011)
 *
 * Cubre:
 *   COM-PUB   Como director → publicar comunicado TODO_EL_CENTRO con requiresAck.
 *   COM-ACK   Como familiar → ver comunicado en /portal/comunicados y confirmar lectura;
 *             verificar que el botón de acuse desaparece tras confirmar.
 *   COM-MSG1  Como familiar → abrir hilo del seed y enviar un mensaje.
 *   COM-MSG2  Como director → ver hilo en /comunicacion/mensajes.
 *
 * Prerequisitos:
 *   - App corriendo en :3000 con seed aplicado.
 *   - Seed crea:
 *       · Comunicado "Bienvenidos al portal de familias de Vetlla" (requiresAck=true)
 *       · Hilo "Consulta sobre medicación de la semana" con 3 mensajes.
 */

import { expect, test } from '@playwright/test';
import { loginAs } from './helpers/auth';

// ═══════════════════════════════════════════════════════════════════════════
// Como DIRECTOR — publicar comunicado
// ═══════════════════════════════════════════════════════════════════════════

test.describe('Comunicaciones — como director', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, 'director');
  });

  test('COM-PUB — publicar comunicado TODO_EL_CENTRO con requiresAck', async ({ page }) => {
    await page.goto('/comunicacion/comunicados/nueva');

    // Título del formulario
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Publicar comunicado');

    // Título del comunicado
    await page.getByLabel('Título').fill('Comunicado e2e de prueba automatizada');

    // Contenido
    await page.locator('textarea[name="body"]').fill(
      'Este comunicado ha sido publicado por el test e2e de Vetlla.',
    );

    // Categoría → GENERAL (viene por defecto, pero lo aseguramos)
    await page.locator('#nc-category').selectOption('GENERAL');

    // Audiencia → TODO_EL_CENTRO (viene por defecto)
    await page.locator('#nc-audience').selectOption('TODO_EL_CENTRO');

    // Marcar requiresAck
    await page.locator('#nc-ack').check();

    // Publicar
    await page.getByRole('button', { name: 'Publicar' }).click();

    // Toast de éxito y redirección a la lista
    await expect(page.getByText('Comunicado publicado.')).toBeVisible({ timeout: 10_000 });
    await page.waitForURL('/comunicacion/comunicados', { timeout: 15_000 });
  });

  test('COM-MSG2 — director ve hilo del seed en /comunicacion/mensajes', async ({ page }) => {
    await page.goto('/comunicacion/mensajes');

    // Título de la sección de staff
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Mensajería');

    // El hilo del seed debe aparecer
    await expect(
      page.getByText('Consulta sobre medicación de la semana').first(),
    ).toBeVisible({ timeout: 10_000 });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Como FAMILIAR — portal de comunicados y mensajería
// ═══════════════════════════════════════════════════════════════════════════

test.describe('Comunicaciones — como familiar', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, 'familiar');
  });

  test('COM-ACK — ver comunicado del seed con acuse pendiente y confirmar lectura', async ({
    page,
  }) => {
    await page.goto('/portal/comunicados');

    // Título de la sección del portal
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Comunicados');

    // El comunicado del seed debe estar visible
    await expect(
      page.getByText('Bienvenidos al portal de familias de Vetlla').first(),
    ).toBeVisible({ timeout: 10_000 });

    // El botón de acuse de recibo debe aparecer (requiresAck=true en el seed).
    // El botón lleva aria-label con el título del comunicado (a11y), por lo que
    // getByRole('button', { name: 'Confirmar que lo he leído' }) no lo encuentra
    // (el accessible name es el aria-label, no el texto visible). Usamos
    // getByText para el contenido visible del botón.
    const ackButton = page
      .getByText('Confirmar que lo he leído', { exact: true })
      .first();

    // Solo intentar confirmar si el botón está visible (el seed puede haberse aplicado
    // en una sesión anterior y ya estar confirmado)
    const ackVisible = await ackButton.isVisible().catch(() => false);
    if (ackVisible) {
      await ackButton.click();
      // Toast de confirmación. exact:true para no coincidir con el span aria-live
      // de Radix ("Notification Confirmado.") destinado a lectores de pantalla.
      await expect(page.getByText('Confirmado.', { exact: true })).toBeVisible({ timeout: 10_000 });
      // El botón de acuse desaparece o cambia tras confirmar
      await expect(ackButton).not.toBeVisible({ timeout: 5_000 });
    } else {
      // Ya estaba confirmado en una sesión anterior — verificar que aparece "Confirmado"
      await expect(
        page.getByText(/confirmado el/i).first(),
      ).toBeVisible({ timeout: 5_000 });
    }
  });

  test('COM-MSG1 — familiar abre hilo del seed y envía un mensaje', async ({ page }) => {
    await page.goto('/portal/mensajes');

    // Título de mensajes del portal
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Mensajes');

    // El hilo del seed debe aparecer
    await expect(
      page.getByText('Consulta sobre medicación de la semana').first(),
    ).toBeVisible({ timeout: 10_000 });

    // Abrir el hilo (click en el asunto o en la tarjeta)
    await page.getByText('Consulta sobre medicación de la semana').first().click();

    // Estamos en el detalle del hilo — escribir un mensaje
    await page.getByLabel('Tu mensaje').fill('Mensaje de prueba enviado por el test e2e.');

    // Enviar
    await page.getByRole('button', { name: 'Enviar' }).click();

    // Toast de éxito. exact:true para no coincidir con el span aria-live de Radix
    // que anuncia "Notification Mensaje enviado." para lectores de pantalla (a11y).
    await expect(page.getByText('Mensaje enviado.', { exact: true })).toBeVisible({ timeout: 10_000 });
  });
});
