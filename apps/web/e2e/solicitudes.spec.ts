/**
 * Suite e2e — Solicitudes (REQ-001..REQ-011)
 *
 * Cubre:
 *   FAM-1  Como familiar → ver "Mis solicitudes" con las 3 solicitudes del seed.
 *   FAM-2  Como familiar → crear nueva solicitud y verla en la lista.
 *   STF-1  Como director → ver bandeja /solicitudes con solicitudes del tenant.
 *   STF-2  Como director → abrir detalle, añadir comentario interno, cambiar estado.
 *
 * Prerequisitos:
 *   - App corriendo en :3000 con seed aplicado.
 *   - Seed crea 3 solicitudes para familiar@demo.vetlla.dev:
 *       · "Grifo del lavabo con pequeña fuga" (RECIBIDA / MANTENIMIENTO)
 *       · "Revisión de la dieta — preferencias nuevas" (EN_CURSO / ALIMENTACION)
 *       · "Copia del contrato de ingreso" (RESUELTA / DOCUMENTACION)
 */

import { expect, test } from '@playwright/test';
import { loginAs } from './helpers/auth';

// ═══════════════════════════════════════════════════════════════════════════
// Como FAMILIAR
// ═══════════════════════════════════════════════════════════════════════════

test.describe('Solicitudes — como familiar', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, 'familiar');
  });

  test('FAM-1 — /portal/solicitudes muestra las solicitudes del seed', async ({ page }) => {
    await page.goto('/portal/solicitudes');

    // Título de la página
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Mis solicitudes');

    // Deben aparecer las 3 solicitudes del seed
    await expect(page.getByText('Grifo del lavabo con pequeña fuga')).toBeVisible();
    await expect(page.getByText('Revisión de la dieta — preferencias nuevas')).toBeVisible();
    await expect(page.getByText('Copia del contrato de ingreso')).toBeVisible();

    // El botón de nueva solicitud existe
    await expect(page.getByRole('link', { name: 'Nueva solicitud' })).toBeVisible();
  });

  test('FAM-2 — crear una nueva solicitud y verla en la lista', async ({ page }) => {
    await page.goto('/portal/solicitudes/nueva');

    // Título del formulario
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Nueva solicitud');

    // Rellenar categoría (primer select: categoría)
    await page.getByLabel('Tipo de solicitud').selectOption('ACTIVIDADES');

    // Rellenar asunto
    await page.getByLabel('Asunto').fill('Solicitud e2e de prueba automatizada');

    // Rellenar descripción (textarea)
    await page.locator('textarea[name="description"]').fill(
      'Descripción de la solicitud creada por el test e2e de Vitest/Playwright.',
    );

    // Enviar
    await page.getByRole('button', { name: 'Enviar solicitud' }).click();

    // Tras éxito se redirige a la lista
    await page.waitForURL('/portal/solicitudes', { timeout: 15_000 });

    // La nueva solicitud aparece en la lista
    await expect(page.getByText('Solicitud e2e de prueba automatizada')).toBeVisible();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Como DIRECTOR (bandeja de staff)
// ═══════════════════════════════════════════════════════════════════════════

test.describe('Solicitudes — como director', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, 'director');
  });

  test('STF-1 — /solicitudes muestra la bandeja con solicitudes del tenant', async ({ page }) => {
    await page.goto('/solicitudes');

    // Título de la sección de staff
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Solicitudes');

    // Deben aparecer al menos las solicitudes del seed
    await expect(page.getByText('Grifo del lavabo con pequeña fuga').first()).toBeVisible();

    // Los filtros de estado y categoría están presentes
    await expect(page.locator('#filter-status')).toBeVisible();
    await expect(page.locator('#filter-category')).toBeVisible();
  });

  test('STF-2 — detalle: añadir comentario interno y cambiar estado', async ({ page }) => {
    await page.goto('/solicitudes');

    // Abrir la primera solicitud de la lista (RECIBIDA)
    await page.getByText('Grifo del lavabo con pequeña fuga').first().click();

    // Estamos en el detalle
    await expect(page.getByRole('heading', { level: 1 })).toContainText(
      'Grifo del lavabo con pequeña fuga',
    );

    // Escribir un comentario interno
    await page.locator('#staff-comment').fill('Comentario interno de prueba e2e.');

    // Marcar como interno
    await page.getByRole('checkbox', {
      name: 'Comentario interno (no visible para la familia)',
    }).check();

    // Enviar comentario
    await page.getByRole('button', { name: 'Enviar' }).click();

    // Toast de éxito. exact:true para no coincidir con el span aria-live de Radix
    // que anuncia "Notification Comentario enviado." para lectores de pantalla.
    await expect(page.getByText('Comentario enviado.', { exact: true })).toBeVisible({ timeout: 10_000 });

    // Cambiar estado a EN_CURSO (válido desde RECIBIDA)
    await page.locator('#status-select').selectOption('EN_CURSO');
    await page.getByRole('button', { name: /guardar/i }).first().click();

    // Toast de estado actualizado
    await expect(page.getByText('Estado actualizado.')).toBeVisible({ timeout: 10_000 });
  });
});
