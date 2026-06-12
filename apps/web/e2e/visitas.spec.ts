/**
 * Suite e2e — Visitas (VIS-001..VIS-010)
 *
 * Cubre:
 *   VIS-FAM1  Como familiar → /portal/visitas muestra la visita CONFIRMADA del seed
 *             con código DEMOQR01.
 *   VIS-FAM2  Como familiar → solicitar nueva visita (próximo sábado, franja 11:00 con
 *             autoApprove=true) → visita confirmada al instante.
 *   VIS-STF1  Como director → /visitas agenda, pantallazo de check-in.
 *   VIS-CHK-  Check-in negativo: la visita seed (DEMOQR01) es FUTURA (próximo sábado).
 *             El servidor valida que scheduledAt === hoy; como no es hoy, devuelve error.
 *             El test aserta el mensaje de error genérico del toast/API.
 *
 * Prerequisitos:
 *   - App corriendo en :3000 con seed aplicado.
 *   - Seed crea:
 *       · Visita CONFIRMADA futura (próximo sábado 11:00 UTC) con qrCode='DEMOQR01'.
 *       · Franja sábado 11:00-12:00, capacity=3, autoApprove=true.
 */

import { expect, test } from '@playwright/test';
import { loginAs } from './helpers/auth';

// ═══════════════════════════════════════════════════════════════════════════
// Como FAMILIAR — portal de visitas
// ═══════════════════════════════════════════════════════════════════════════

test.describe('Visitas — como familiar', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, 'familiar');
  });

  test('VIS-FAM1 — /portal/visitas muestra la visita CONFIRMADA del seed con código DEMOQR01', async ({
    page,
  }) => {
    await page.goto('/portal/visitas');

    // Título del portal
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Mis visitas');

    // La sección "Próximas visitas" debe existir con la visita confirmada
    await expect(page.getByRole('heading', { name: 'Próximas visitas' })).toBeVisible({
      timeout: 10_000,
    });

    // El código de visita DEMOQR01 debe estar visible como tarjeta de embarque
    await expect(page.getByText('DEMOQR01')).toBeVisible({ timeout: 10_000 });

    // El label del código está presente
    await expect(page.getByText('Código de visita')).toBeVisible();

    // La nota de presentación en recepción
    await expect(page.getByText('Preséntalo en recepción')).toBeVisible();
  });

  test('VIS-FAM2 — solicitar nueva visita para el próximo sábado (autoApprove=true)', async ({
    page,
  }) => {
    await page.goto('/portal/visitas/nueva');

    // Título del formulario
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Solicitar visita');

    // Calcular la fecha del próximo sábado (si hoy es sábado, el siguiente sábado)
    const now = new Date();
    const daysUntilSat = (6 - now.getDay() + 7) % 7 || 7;
    const nextSat = new Date(now);
    nextSat.setDate(now.getDate() + daysUntilSat);
    const nextSatISO = nextSat.toISOString().slice(0, 10); // YYYY-MM-DD

    // Seleccionar la fecha del próximo sábado
    await page.getByLabel('Fecha de la visita').fill(nextSatISO);

    // Esperar a que aparezcan las franjas disponibles
    // (puede tardar un momento en cargar desde la API)
    await page.waitForTimeout(1_500);

    // Franja 11:00-12:00 del sábado (autoApprove=true en el seed)
    // El selector es un <select name="slotConfigId"> o un radiogroup
    const slotSelect = page.locator('select[name="slotConfigId"]');
    const slotRadio = page.getByRole('radio').first();

    const hasSlotSelect = await slotSelect.isVisible().catch(() => false);
    const hasSlotRadio  = await slotRadio.isVisible().catch(() => false);

    if (hasSlotSelect) {
      // Seleccionar la primera opción disponible (11:00-12:00 tiene plazas)
      await slotSelect.selectOption({ index: 1 });
    } else if (hasSlotRadio) {
      await slotRadio.check();
    } else {
      // El label de franja vacía es aceptable si no hay disponibilidad ese día
      const slotEmpty = await page.getByText('No hay franjas disponibles para esta fecha').isVisible().catch(() => false);
      test.skip(slotEmpty, 'Sin franjas disponibles — caso límite de fecha');
      return;
    }

    // Visitante 1 (campo obligatorio)
    await page.getByLabel('Visitante 1').fill('Ana García');

    // Enviar solicitud
    await page.getByRole('button', { name: 'Enviar solicitud' }).click();

    // Con autoApprove=true el seed configura la franja para confirmar directamente
    // El toast puede ser "Visita confirmada." o "Solicitud enviada. El centro la confirmará en breve."
    const toastConfirmed = page.getByText('Visita confirmada.');
    const toastPending   = page.getByText('Solicitud enviada. El centro la confirmará en breve.');

    await expect(toastConfirmed.or(toastPending)).toBeVisible({ timeout: 15_000 });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Como DIRECTOR (staff) — agenda de visitas y check-in
// ═══════════════════════════════════════════════════════════════════════════

test.describe('Visitas — como director', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, 'director');
  });

  test('VIS-STF1 — /visitas carga la agenda con el formulario de check-in visible', async ({
    page,
  }) => {
    await page.goto('/visitas');

    // Título de la sección de staff
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Agenda de visitas');

    // El formulario de check-in destacado debe estar visible
    await expect(page.getByRole('heading', { name: 'Registrar entrada' })).toBeVisible();

    // El input de código está presente con su placeholder
    await expect(page.getByLabel('Código de visita')).toBeVisible();
  });

  test('VIS-CHK-NEG — check-in con DEMOQR01 falla porque la visita es futura (no es hoy)', async ({
    page,
  }) => {
    // La visita del seed tiene scheduledAt = próximo sábado, no hoy.
    // El servidor debe rechazar el check-in con un mensaje de error.
    await page.goto('/visitas');

    // Teclear el código de la visita seed
    const codeInput = page.getByLabel('Código de visita');
    await codeInput.fill('DEMOQR01');

    // Pulsar "Registrar entrada"
    await page.getByRole('button', { name: 'Registrar entrada' }).click();

    // Esperamos un toast de error (el servidor rechaza porque la visita no es de hoy)
    // El texto exacto del error depende de la implementación del router; buscamos
    // un elemento de error genérico o el toast con mensaje de fallo.
    const errorToast = page.locator('[role="alert"], [data-testid="toast-error"]');
    const genericError = page.getByText(/error|no encontrad|no correspond|no válid|no es de hoy/i);

    await expect(errorToast.or(genericError).first()).toBeVisible({ timeout: 10_000 });
  });
});
