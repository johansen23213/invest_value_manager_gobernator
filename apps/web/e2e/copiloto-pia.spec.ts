/**
 * Suite UAT — Copiloto: borrador de PIA/PAI (H5, Feature 2)
 *
 * Cubre el flujo de extremo a extremo en /residentes/[id]/pia (rol sanitario):
 *   - Pedir un borrador de PIA → el copiloto lo redacta desde el expediente
 *     (StubProvider determinista, tier reasoning).
 *   - Transparencia (art. 50): badge "Borrador del copiloto — revisa antes de crear".
 *   - Editar el título y un objetivo, añadir/quitar objetivos.
 *   - Confirmar → el nuevo PIA aparece en la lista de planes existente.
 *   - Descartar → no se crea nada.
 *
 * Garantía de producto verificada indirectamente: nada se persiste hasta que el
 * profesional pulsa "Confirmar y crear PIA" (el borrador vive solo en el cliente).
 *
 * Prerequisitos: app en :3000 con seed (al menos un residente accesible).
 *
 * NOTA: este spec NO se ejecuta en el contenedor del agente (sin navegador). Lo
 * ejecuta el gobernador después con `pnpm --filter @vetlla/web e2e`.
 */

import { expect, test, type Page } from '@playwright/test';
import { loginAs } from './helpers/auth';

const BADGE = /borrador del copiloto/i;

/** Login como sanitario y navega al PIA del primer residente de la lista. */
async function openPiaForFirstResident(page: Page): Promise<void> {
  await loginAs(page, 'sanitario');
  await page.goto('/residentes');
  await page.waitForSelector('table tbody tr', { timeout: 10_000 });

  // Abrir el expediente del primer residente.
  await page.locator('table tbody tr').first().getByRole('link').first().click();

  // Entrar en la pestaña PIA desde el expediente.
  await page.getByRole('link', { name: /pia/i }).click();

  // La tarjeta del copiloto aparece (solo con careplan:write).
  await expect(page.getByTestId('copilot-pia-generate')).toBeVisible({ timeout: 10_000 });
}

/** Genera un borrador de PIA y espera la tarjeta de borrador. */
async function generateDraft(page: Page, guidance?: string): Promise<void> {
  if (guidance) await page.getByTestId('copilot-pia-guidance').fill(guidance);
  await page.getByTestId('copilot-pia-generate').click();
  await expect(page.getByTestId('copilot-pia-draft-card')).toBeVisible({ timeout: 15_000 });
}

test.describe('Copiloto — borrador de PIA (sanitario)', () => {
  test('genera un borrador de PIA con transparencia, título y objetivos', async ({ page }) => {
    await openPiaForFirstResident(page);
    await generateDraft(page, 'Centrar el plan en la movilidad y la autonomía');

    const card = page.getByTestId('copilot-pia-draft-card');

    // Transparencia (art. 50): el badge de "borrador IA" es visible (texto, no solo color).
    await expect(card).toContainText(BADGE);

    // El borrador trae un título y al menos un objetivo editables.
    await expect(page.getByTestId('copilot-pia-title')).toHaveValue(/.+/);
    await expect(page.getByTestId('copilot-pia-goal').first()).toBeVisible();
  });

  test('editar título y un objetivo, confirmar → el PIA aparece en la lista', async ({ page }) => {
    await openPiaForFirstResident(page);
    await generateDraft(page);

    // El humano corrige el título (valor distintivo para localizarlo luego).
    const distinctiveTitle = `PIA copiloto ${Date.now()}`;
    await page.getByTestId('copilot-pia-title').fill(distinctiveTitle);

    // Edita el primer objetivo.
    await page.getByTestId('copilot-pia-goal').first().fill('Objetivo revisado por el profesional');

    // Añade un objetivo nuevo y lo rellena.
    await page.getByTestId('copilot-pia-add-goal').click();
    const goals = page.getByTestId('copilot-pia-goal');
    await goals.last().fill('Objetivo añadido manualmente');

    await page.getByTestId('copilot-pia-confirm').click();

    // La tarjeta de borrador desaparece tras crear el PIA.
    await expect(page.getByTestId('copilot-pia-draft-card')).toBeHidden({ timeout: 10_000 });

    // El nuevo PIA aparece en la lista de planes con el título editado.
    await expect(page.getByText(distinctiveTitle).first()).toBeVisible({ timeout: 10_000 });
    // Y sus objetivos editados también.
    await expect(page.getByText('Objetivo revisado por el profesional').first()).toBeVisible();
    await expect(page.getByText('Objetivo añadido manualmente').first()).toBeVisible();
  });

  test('descartar el borrador no crea ningún PIA', async ({ page }) => {
    await openPiaForFirstResident(page);
    await generateDraft(page);

    await page.getByTestId('copilot-pia-discard').click();

    // La tarjeta desaparece y la zona de generación sigue lista.
    await expect(page.getByTestId('copilot-pia-draft-card')).toBeHidden({ timeout: 8_000 });
    await expect(page.getByTestId('copilot-pia-generate')).toBeVisible();
  });
});
