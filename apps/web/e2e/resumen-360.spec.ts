/**
 * Suite UAT — Visión 360 del residente (R-360)
 *
 * Cubre:
 *   R-360.1  La sub-navegación del residente incluye "Resumen" y lleva a /resumen.
 *   R-360.2  La pantalla tiene el título "Visión 360" y tres pestañas (Hoy/Salud/Atención).
 *   R-360.3  Pestaña Hoy: tarjeta de medicación + acciones rápidas (constantes, incidencia)
 *            para roles con care:write.
 *   R-360.4  Navegación entre pestañas: Salud (alergias/escalas/diagnósticos) y
 *            Atención (PIA + histórico) renderizan su contenido.
 *
 * Prerequisitos:
 *   - App construida y en :3000 (`pnpm build && pnpm start`).
 *   - Postgres con seed (al menos un residente).
 */

import { expect, test, type Page } from '@playwright/test';
import { loginAs } from './helpers/auth';

/** Abre la visión 360 del primer residente del listado vía la sub-nav "Resumen". */
async function goToFirstResident360(page: Page): Promise<void> {
  await page.goto('/residentes');
  await page.waitForSelector('table tbody tr', { timeout: 10_000 });
  await page.locator('table tbody tr').first().getByRole('link').first().click();
  // Desde el expediente, la sub-nav del ResidentChrome ofrece "Resumen".
  await page.getByRole('link', { name: 'Resumen' }).click();
  await page.waitForURL(/\/residentes\/.+\/resumen$/, { timeout: 10_000 });
  await expect(page.getByRole('heading', { name: 'Visión 360' })).toBeVisible();
}

test.describe('Visión 360 — como sanitario', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, 'sanitario');
  });

  test('R-360.1/2 — sub-nav Resumen y tres pestañas', async ({ page }) => {
    await goToFirstResident360(page);
    await expect(page.getByRole('tab', { name: 'Hoy' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Salud' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Atención' })).toBeVisible();
  });

  test('R-360.3 — pestaña Hoy: medicación + acciones rápidas', async ({ page }) => {
    await goToFirstResident360(page);
    const hoy = page.getByRole('tabpanel');
    // Tarjeta de medicación de hoy.
    await expect(hoy.getByText('Medicación de hoy')).toBeVisible();
    // Acciones rápidas (care:write): constantes e incidencia.
    await expect(hoy.getByRole('button', { name: 'Registrar constantes' })).toBeVisible();
    await expect(hoy.getByRole('button', { name: 'Registrar incidencia' })).toBeVisible();
  });

  test('R-360.4 — navegación entre pestañas Salud y Atención', async ({ page }) => {
    await goToFirstResident360(page);

    // Acotamos al tabpanel activo: el banner de alergias de la cabecera queda fuera.
    await page.getByRole('tab', { name: 'Salud' }).click();
    const salud = page.getByRole('tabpanel');
    // Strict mode: el tabpanel tiene un <h2>Alergias</h2> y también un <p> o span
    // con "Alergias" como etiqueta. Acotamos al heading para unicidad.
    await expect(salud.getByRole('heading', { name: 'Alergias' })).toBeVisible();
    await expect(salud.getByText('Escalas')).toBeVisible();
    await expect(salud.getByText('Diagnósticos')).toBeVisible();

    await page.getByRole('tab', { name: 'Atención' }).click();
    const atencion = page.getByRole('tabpanel');
    await expect(atencion.getByText('Plan de atención (PIA)')).toBeVisible();
    await expect(atencion.getByText('Histórico de cuidado')).toBeVisible();
  });
});

test.describe('Visión 360 — como auxiliar', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, 'auxiliar');
  });

  test('R-360.3 — el auxiliar también ve las acciones rápidas (care:write)', async ({ page }) => {
    await goToFirstResident360(page);
    await expect(page.getByRole('button', { name: 'Registrar constantes' })).toBeVisible();
  });
});
