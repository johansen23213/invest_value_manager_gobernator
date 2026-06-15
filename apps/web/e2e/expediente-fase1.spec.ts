/**
 * Suite e2e — Expediente Fase 1 (Ola B)
 *
 * Cubre:
 *   EXP-1  Como sanitario → el residente con disfagia del seed tiene chips de seguridad
 *          visibles en la cabecera sticky: chip de dieta (Dieta triturada) y chip de
 *          dispositivo (Sonda nasogástrica).
 *   EXP-2  Las pestañas nuevas del expediente (Cuidados, Clínico+, Administrativo) son
 *          visibles en el expediente del residente.
 *
 * Residente "disfagia" del seed (idx=0):
 *   - dietType: TRITURADA   → label "Dieta triturada"
 *   - liquidTexture: NECTAR → label "Líquidos néctar (IDDSI 2)"
 *   - device: SONDA_NASOGASTRICA → label "Sonda nasogástrica"
 *
 * Estrategia de localización del residente:
 *   - Ir a /residentes, buscar el primero cuya cabecera sticky muestre el chip
 *     "Dieta triturada". El test itera los primeros resultados de la tabla hasta
 *     encontrarlo (el seed genera 28 residentes; el de disfagia es el de firstName
 *     'Dolores' que aparece en las primeras posiciones de la lista).
 *   - Para no acoplar el test al orden de paginación, se abre directamente el
 *     expediente de cada residente hasta encontrar el chip de dieta.
 *
 * Prerequisitos:
 *   - App corriendo en :3000 con seed aplicado.
 */

import { expect, test } from '@playwright/test';
import { loginAs } from './helpers/auth';

// ---------------------------------------------------------------------------
// Helper: navega por la lista de residentes hasta encontrar el que tiene el
// chip de "Dieta triturada" en la cabecera sticky.
// Devuelve la URL del expediente del residente encontrado.
// ---------------------------------------------------------------------------
async function goToDisfagiaResident(
  page: import('@playwright/test').Page,
): Promise<string> {
  await page.goto('/residentes');
  await page.waitForSelector('table tbody tr', { timeout: 10_000 });

  const rows = page.locator('table tbody tr');
  const count = await rows.count();

  // Escaneamos TODAS las filas (no solo 10): la lista /residentes no garantiza un
  // orden determinista, así que el residente de disfagia puede caer en cualquier
  // posición entre runs (BD fresca). Comprobamos los chips (no el nombre) para
  // ignorar al homónimo idx=24 ("Dolores García Pérez" sin datos de disfagia).
  for (let i = 0; i < count; i++) {
    const link = rows.nth(i).getByRole('link').first();
    await link.click();

    // Esperar a que cargue la cabecera
    await page.waitForSelector('[data-testid="resident-sticky-header"]', { timeout: 8_000 });

    const safetyChips = page.getByTestId('safety-chips');
    const hasChips = await safetyChips.isVisible().catch(() => false);

    if (hasChips) {
      const chipText = await safetyChips.textContent();
      if (chipText?.includes('Dieta triturada') || chipText?.includes('triturada')) {
        return page.url();
      }
    }

    // No es el residente buscado, volver a la lista
    await page.goto('/residentes');
    await page.waitForSelector('table tbody tr', { timeout: 10_000 });
  }

  // Si no se encontró tras recorrer toda la lista, fallar con mensaje claro
  throw new Error(
    `No se encontró el residente con disfagia (Dieta triturada) tras recorrer ${count} residentes. ` +
      'Verifica que el seed se ha aplicado correctamente.',
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Como SANITARIO
// ═══════════════════════════════════════════════════════════════════════════

test.describe('Expediente Fase 1 — como sanitario', () => {
  test.beforeEach(async ({ page }) => {
    // Recorrer hasta 28 expedientes (navegar dentro/fuera) puede pasar de los 45s
    // por defecto; ampliamos el timeout para este flujo de búsqueda.
    test.setTimeout(120_000);
    await loginAs(page, 'sanitario');
  });

  test('EXP-1 — chips de seguridad visibles: dieta+textura y dispositivo (disfagia)', async ({
    page,
  }) => {
    await goToDisfagiaResident(page);

    // La cabecera sticky está presente
    const header = page.getByTestId('resident-sticky-header');
    await expect(header).toBeVisible();

    // Los chips de seguridad están presentes
    const safetyChips = page.getByTestId('safety-chips');
    await expect(safetyChips).toBeVisible();

    // El chip de dieta muestra "Dieta triturada" (DIET_TYPE_LABELS.TRITURADA)
    await expect(safetyChips).toContainText('Dieta triturada');

    // El chip de textura muestra la restricción de líquidos
    // LIQUID_TEXTURE_LABELS.NECTAR = 'Líquidos néctar (IDDSI 2)'
    await expect(safetyChips).toContainText('Líquidos néctar');

    // El chip del dispositivo muestra la sonda nasogástrica
    // DEVICE_TYPE_LABELS.SONDA_NASOGASTRICA = 'Sonda nasogástrica'
    await expect(safetyChips).toContainText('Sonda nasogástrica');
  });

  test('EXP-2 — pestañas Cuidados, Clínico+ y Administrativo visibles en el expediente', async ({
    page,
  }) => {
    await goToDisfagiaResident(page);

    // Estamos en el expediente — verificar que las pestañas nuevas de Ola B existen
    // Los TabsTrigger usan role="tab" en shadcn/ui

    // Pestaña Cuidados (exp.care.title = 'Cuidados')
    await expect(page.getByRole('tab', { name: 'Cuidados' })).toBeVisible();

    // Pestaña Clínico+ (exp.clinical.title = 'Clínico+')
    await expect(page.getByRole('tab', { name: 'Clínico+' })).toBeVisible();

    // Pestaña Administrativo (exp.admin.title = 'Administrativo')
    await expect(page.getByRole('tab', { name: 'Administrativo' })).toBeVisible();

    // Navegar a la pestaña Cuidados y verificar su contenido básico
    await page.getByRole('tab', { name: 'Cuidados' }).click();

    // El título de dieta y nutrición (exp.care.diet = 'Dieta y nutrición')
    await expect(page.getByText('Dieta y nutrición')).toBeVisible();

    // La sección de riesgos (exp.care.risks = 'Riesgos y alertas')
    await expect(page.getByText('Riesgos y alertas')).toBeVisible();

    // Navegar a la pestaña Clínico+ y verificar que muestra "Dispositivos"
    await page.getByRole('tab', { name: 'Clínico+' }).click();

    // exp.clinical.devices = 'Dispositivos'
    await expect(page.getByText('Dispositivos').first()).toBeVisible();
  });
});
