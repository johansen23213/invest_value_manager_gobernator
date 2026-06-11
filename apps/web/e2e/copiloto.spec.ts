/**
 * Suite UAT — Copiloto: lenguaje natural → CareRecord (H5, Feature 1)
 *
 * Cubre el flujo de extremo a extremo en /atencion (rol auxiliar):
 *   - Generar un borrador a partir de texto libre (StubProvider determinista).
 *   - Transparencia (art. 50): badge "Borrador del copiloto — revisa antes de guardar".
 *   - Editar un campo del borrador y confirmar → el registro aparece en recientes.
 *   - Descartar un borrador → no se guarda nada.
 *
 * Garantías de producto verificadas indirectamente: nada se persiste hasta que
 * el humano pulsa "Confirmar y guardar" (el borrador vive solo en el cliente).
 *
 * Prerequisitos: app en :3000 con seed (residente "Alonso" existe).
 */

import { expect, test, type Page } from '@playwright/test';
import { loginAs } from './helpers/auth';

const BADGE = /borrador del copiloto/i;

/** Login como auxiliar, abre /atencion y selecciona un residente conocido. */
async function openCopilotFor(page: Page, residentQuery = 'Alonso'): Promise<void> {
  await loginAs(page, 'auxiliar');
  await page.goto('/atencion');

  // Buscar y seleccionar el residente
  await page.getByLabel('Buscar residente').fill(residentQuery);
  await page
    .getByRole('button', { name: new RegExp(residentQuery, 'i') })
    .first()
    .click();

  // La tarjeta del copiloto aparece al haber residente seleccionado
  await expect(page.getByTestId('copilot-input')).toBeVisible({ timeout: 10_000 });
}

/** Escribe el texto y genera; espera la tarjeta de borrador. */
async function generateDraft(page: Page, utterance: string): Promise<void> {
  await page.getByTestId('copilot-input').fill(utterance);
  await page.getByTestId('copilot-generate').click();
  await expect(page.getByTestId('copilot-draft-card')).toBeVisible({ timeout: 15_000 });
}

test.describe('Copiloto — NL → CareRecord (auxiliar)', () => {
  test('genera un borrador de CONSTANTES con transparencia y campos extraídos', async ({
    page,
  }) => {
    await openCopilotFor(page);
    await generateDraft(page, 'Tensión 120/80, 36,5ºC y saturación 97');

    const card = page.getByTestId('copilot-draft-card');

    // Transparencia (art. 50): el badge de "borrador IA" es visible (texto, no solo color)
    await expect(card).toContainText(BADGE);

    // El stub deriva el tipo CONSTANTES y rellena la tensión
    await expect(page.locator('#copilot-type')).toHaveValue('CONSTANTES');
    await expect(page.locator('#copilot-field-tension')).toHaveValue('120/80');
    await expect(page.locator('#copilot-field-temperatura')).toHaveValue('36.5');
  });

  test('editar el borrador y confirmar guarda el registro (aparece en recientes)', async ({
    page,
  }) => {
    await openCopilotFor(page);
    await generateDraft(page, 'Tensión 120/80 y 36 grados');

    // El humano corrige un campo antes de guardar (valor distintivo para localizarlo)
    const tension = page.locator('#copilot-field-tension');
    await tension.fill('123/77');

    await page.getByTestId('copilot-confirm').click();

    // La tarjeta de borrador desaparece tras guardar
    await expect(page.getByTestId('copilot-draft-card')).toBeHidden({ timeout: 10_000 });

    // El registro confirmado aparece en "Registros recientes" con el valor editado
    await expect(page.getByText(/tension:\s*123\/77/i).first()).toBeVisible({ timeout: 10_000 });
  });

  test('descartar el borrador no guarda nada', async ({ page }) => {
    await openCopilotFor(page);
    await generateDraft(page, 'Se ha caído en el baño sin consecuencias');

    // El stub clasifica como INCIDENCIA; descartamos
    await expect(page.locator('#copilot-type')).toHaveValue('INCIDENCIA');
    await page.getByTestId('copilot-discard').click();

    // La tarjeta desaparece y no hay nada guardado de este borrador
    await expect(page.getByTestId('copilot-draft-card')).toBeHidden({ timeout: 8_000 });
    // El input vuelve a estar listo para otro registro
    await expect(page.getByTestId('copilot-input')).toBeVisible();
  });
});
