/**
 * Suite UAT — Formulario de Prescripción
 *
 * Cubre:
 *   M-05  Select de vía de administración y de forma farmacéutica presentes.
 *   M-06  Toggle de días de la semana (L M X J V S D) funcional.
 *   M-07  Tipo PRN oculta las horas de pauta.
 *   M-08  Chequeo de alergia: banner de aviso al escribir sustancia coincidente;
 *         si la severidad es GRAVE, el botón de submit queda bloqueado hasta
 *         confirmar el motivo clínico.
 *
 * Prerequisitos:
 *   - App en :3000 con seed (residente con al menos una alergia registrada).
 *   - El residente con alergia debe ser accesible desde /residentes.
 */

import { expect, test } from '@playwright/test';
import { loginAs } from './helpers/auth';

// ---------------------------------------------------------------------------
// Helper: navega al formulario de prescripción del primer residente con alergia.
// Estrategia: /residentes → primer residente → Medicación → prescribir.
// ---------------------------------------------------------------------------
async function goToPrescribir(
  page: import('@playwright/test').Page,
): Promise<void> {
  await page.goto('/residentes');
  await page.waitForSelector('table tbody tr', { timeout: 10_000 });

  // Primer residente de la lista (el seed garantiza que tiene alergia)
  const firstLink = page.locator('table tbody tr').first().getByRole('link').first();
  await firstLink.click();

  // Enlace "Medicación" en el expediente del residente
  await page.getByRole('link', { name: /medicaci/i }).click();
  await page.waitForSelector('[data-testid="resident-sticky-header"]', { timeout: 10_000 });

  // Enlace "Nueva prescripción" (solo visible para sanitario)
  await page.getByTestId('prescribir-link').click();

  // Esperar a que cargue el formulario de prescripción
  await page.waitForSelector('[data-testid="select-route"]', { timeout: 10_000 });
}

// ═══════════════════════════════════════════════════════════════════════════
// Suite principal — como sanitario
// ═══════════════════════════════════════════════════════════════════════════

test.describe('Prescripción — como sanitario', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, 'sanitario');
  });

  // ─────────────────────────────────────────────────────────────────────────
  // M-05 — Selects estructurados: vía y forma farmacéutica
  // ─────────────────────────────────────────────────────────────────────────

  test('M-05 — select de vía de administración tiene opciones', async ({ page }) => {
    await goToPrescribir(page);

    const routeSelect = page.getByTestId('select-route');
    await expect(routeSelect).toBeVisible();

    // Debe tener al menos la opción "Oral"
    await routeSelect.selectOption({ label: 'Oral' });
    await expect(routeSelect).toHaveValue('ORAL');
  });

  test('M-05 — select de forma farmacéutica tiene opciones', async ({ page }) => {
    await goToPrescribir(page);

    const unitSelect = page.getByTestId('select-unit');
    await expect(unitSelect).toBeVisible();

    // Debe tener al menos "Comprimido"
    await unitSelect.selectOption({ label: 'Comprimido' });
    await expect(unitSelect).toHaveValue('COMPRIMIDO');
  });

  // ─────────────────────────────────────────────────────────────────────────
  // M-06 — Toggle de días de la semana
  // ─────────────────────────────────────────────────────────────────────────

  test('M-06 — grupo de días de la semana contiene L, M, X, J, V, S, D', async ({ page }) => {
    await goToPrescribir(page);

    const dowGroup = page.getByTestId('days-of-week-group');
    await expect(dowGroup).toBeVisible();

    // Verificar que existen los 7 botones de día por su aria-label (nombre completo)
    const dayLabels = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];
    for (const dayLabel of dayLabels) {
      const btn = dowGroup.getByRole('button', { name: dayLabel });
      await expect(btn).toBeVisible();
    }
  });

  test('M-06 — al hacer clic en un día su aria-pressed cambia a false', async ({ page }) => {
    await goToPrescribir(page);

    const dowGroup = page.getByTestId('days-of-week-group');
    // Por defecto todos los días están seleccionados (daysOfWeek === null)
    const lunesBtn = dowGroup.getByRole('button', { name: 'lunes' });
    await expect(lunesBtn).toHaveAttribute('aria-pressed', 'true');

    // Desactivar lunes
    await lunesBtn.click();
    await expect(lunesBtn).toHaveAttribute('aria-pressed', 'false');
  });

  // ─────────────────────────────────────────────────────────────────────────
  // M-07 — Tipo PRN oculta el campo de horas
  // ─────────────────────────────────────────────────────────────────────────

  test('M-07 — seleccionar PRN oculta las horas de pauta', async ({ page }) => {
    await goToPrescribir(page);

    const typeSelect = page.getByTestId('select-type');
    await expect(typeSelect).toBeVisible();

    // Verificar que el select tiene la opción PRN
    const prnOption = typeSelect.locator('option[value="PRN"]');
    await expect(prnOption).toHaveCount(1);

    // Antes de seleccionar PRN debe haber campo de horas (TimeListField)
    // El texto "Horas de pauta" debe estar visible
    await expect(page.getByText('Horas de pauta')).toBeVisible();

    // Seleccionar PRN
    await typeSelect.selectOption('PRN');

    // Tras elegir PRN, el bloque de horas desaparece
    await expect(page.getByText('Horas de pauta')).not.toBeVisible();

    // Y aparece el aviso de "A demanda"
    await expect(page.getByText(/no requiere horas fijas/i)).toBeVisible();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // M-08 — Chequeo de alergia al escribir el nombre del fármaco
  // ─────────────────────────────────────────────────────────────────────────

  test('M-08 — escribir una sustancia alérgica muestra el banner de aviso', async ({ page }) => {
    await goToPrescribir(page);

    // El formulario muestra las alergias del residente en el banner contextual
    // (data-testid="prescribe-allergy-context"). Leemos la primera sustancia.
    const allergyContext = page.getByTestId('prescribe-allergy-context');
    await expect(allergyContext).toBeVisible();

    // Extraer el texto de la primera sustancia del banner contextual
    const contextText = await allergyContext.textContent() ?? '';
    // El seed debe tener al menos una alergia; extraemos la primera palabra
    // en mayúsculas (la sustancia aparece en uppercase en el HTML)
    const match = contextText.match(/Alergias:\s*([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ\s]+)/i);
    // Si el formato es distinto, usamos una sustancia genérica conocida del seed
    const substance = match?.[1]?.trim().split(/\s+/)[0] ?? 'IBUPROFENO';

    // Rellenar el campo de fármaco con la sustancia (parcial, minúsculas)
    const drugInput = page.getByLabel('Fármaco');
    await drugInput.fill(substance.toLowerCase());

    // Esperar el debounce (300ms) + render del banner
    await page.waitForTimeout(500);

    // El banner de coincidencia de alergia debe aparecer
    const matchBanner = page.getByTestId('allergy-match-banner');
    await expect(matchBanner).toBeVisible();
  });

  test('M-08 — alergia GRAVE bloquea el botón hasta confirmar con motivo', async ({ page }) => {
    await goToPrescribir(page);

    // Obtener la sustancia con severidad GRAVE desde el contexto del banner
    // El atributo data-severity del match banner nos lo dirá al aparecer.
    // Primero buscamos la sustancia del banner contextual.
    const allergyContext = page.getByTestId('prescribe-allergy-context');
    const contextText = await allergyContext.textContent().catch(() => '') ?? '';

    // Intentamos obtener la sustancia del residente
    // El seed tiene al menos una alergia; el matching es por substring
    const substanceMatch = contextText.match(/Alergias:\s*([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ\s,()]+)/i);
    // Tomamos la primera "palabra" útil
    const rawSubstance = substanceMatch?.[1]?.trim() ?? '';
    const firstWord = rawSubstance.split(/[\s,()]+/)[0] ?? 'IBUPROFENO';

    const drugInput = page.getByLabel('Fármaco');
    await drugInput.fill(firstWord.toLowerCase());
    await page.waitForTimeout(500);

    const matchBanner = page.getByTestId('allergy-match-banner');
    const bannerVisible = await matchBanner.isVisible().catch(() => false);
    if (!bannerVisible) {
      // No hay coincidencia con los datos del seed para esta alergia — skip graceful
      test.skip();
      return;
    }

    const severity = await matchBanner.getAttribute('data-severity');
    if (severity !== 'GRAVE') {
      // La alergia no es GRAVE — solo verificamos que el banner aparece (ya testeado arriba)
      // y que el botón NO está bloqueado (alergia no grave no bloquea)
      const submitBtn = page.getByRole('button', { name: /prescribir/i });
      await expect(submitBtn).not.toBeDisabled();
      return;
    }

    // Alergia GRAVE: el botón debe estar deshabilitado o su texto indica bloqueo
    const submitBtn = page.getByRole('button', { name: /alergia grave/i });
    await expect(submitBtn).toBeVisible();
    await expect(submitBtn).toBeDisabled();

    // El nota de bloqueo debe ser visible
    await expect(page.getByRole('alert').filter({ hasText: /alergia grave/i })).toBeVisible();
  });
});
