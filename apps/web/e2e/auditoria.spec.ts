/**
 * Suite UAT — Auditoría / Registro de actividad
 *
 * Cubre:
 *   - Tras un cambio de rol en /equipo, la traza aparece en /auditoria.
 *   - El cambio de rol se realiza dentro del mismo test para controlar
 *     la causalidad, y SE REVIERTE al final (try/finally): otros specs
 *     (MAR, /equipo) dependen de que el auxiliar siga siendo AUXILIAR.
 *
 * Prerequisitos:
 *   - App en :3000 con seed.
 *   - El usuario director tiene audit:read y users:write.
 */

import { expect, test, type Page } from '@playwright/test';
import { loginAs } from './helpers/auth';

const AUXILIAR_EMAIL = 'auxiliar@demo.vetlla.dev';

/**
 * Fija el rol de un usuario vía la API tRPC (con la sesión ya autenticada de
 * la página). Se usa para el TEARDOWN: el revert por UI puede hacer no-op
 * silencioso (la mutación no audita si el rol no cambia) y es más frágil.
 */
async function setRoleViaApi(page: Page, email: string, newRole: string): Promise<void> {
  const listRes = await page.request.get(
    '/api/trpc/users.list?batch=1&input=' + encodeURIComponent('{"0":{"json":null}}'),
  );
  const listJson = (await listRes.json()) as Array<{
    result: { data: { json: Array<{ id: string; email: string }> } };
  }>;
  const user = listJson[0]?.result.data.json.find((u) => u.email === email);
  if (!user) throw new Error(`setRoleViaApi: usuario no encontrado: ${email}`);
  const res = await page.request.post('/api/trpc/users.updateRole?batch=1', {
    data: { '0': { json: { userId: user.id, newRole } } },
  });
  if (!res.ok()) throw new Error(`setRoleViaApi: updateRole devolvió ${res.status()}`);
}

/** Cambia el rol de un usuario (identificado por email) desde /equipo. */
async function changeRole(page: Page, email: string, newRole: string): Promise<void> {
  await page.goto('/equipo');
  await page.waitForSelector('[data-testid="team-user-row"]', { timeout: 10_000 });

  const row = page.locator('[data-testid="team-user-row"]').filter({ hasText: email }).first();
  await row.getByRole('button', { name: /cambiar rol/i }).click();

  const roleDialog = page.getByRole('dialog');
  await expect(roleDialog).toBeVisible();
  await roleDialog.getByLabel(/nuevo rol/i).selectOption(newRole);
  await roleDialog
    .getByRole('button', { name: /cambiar rol/i })
    .last()
    .click();

  // Confirmar en el dialog del ConfirmProvider
  const confirmDialog = page.getByRole('dialog');
  await expect(confirmDialog).toContainText(/confirmar cambio de rol/i);
  await confirmDialog.getByRole('button', { name: /cambiar rol/i }).click();

  // Esperar a que el dialog se cierre (mutación completada)
  await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 8_000 });
}

test.describe('Auditoría — trazabilidad de cambio de rol', () => {
  test('cambio de rol aparece en /auditoria como entidad User', async ({ page }) => {
    test.setTimeout(90_000);
    await loginAs(page, 'director');

    try {
      // ── Paso 1: cambiar el rol del auxiliar (se revierte en finally) ────
      await changeRole(page, AUXILIAR_EMAIL, 'SANITARIO');

      // ── Paso 2: verificar la traza en /auditoria ────────────────────────
      await page.goto('/auditoria');
      await page.waitForSelector('table tbody tr', { timeout: 10_000 });

      // La traza del cambio aparece como summary "Rol cambiado de ... a ..."
      // (no usar \bUser\b: textContent() concatena celdas sin espacios).
      await expect(
        page
          .locator('table tbody tr')
          .filter({ hasText: /rol cambiado/i })
          .first(),
      ).toBeVisible({ timeout: 8_000 });
    } finally {
      // Revertir SIEMPRE (vía API, determinista): otros specs dependen del
      // rol AUXILIAR del seed.
      await setRoleViaApi(page, AUXILIAR_EMAIL, 'AUXILIAR');
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Caso: familiar no puede acceder a /auditoria
  // ─────────────────────────────────────────────────────────────────────────

  test('familiar no puede acceder a /auditoria', async ({ page }) => {
    await loginAs(page, 'familiar');
    await page.goto('/auditoria');

    // El familiar no tiene audit:read; debe ser redirigido o ver pantalla vacía
    // No debe ver la tabla de auditoría
    await page.waitForTimeout(3_000); // dar tiempo a la hidratación del cliente

    // La tabla de auditoría no debe aparecer
    const auditTable = page.locator('table');
    const tableVisible = await auditTable.isVisible().catch(() => false);

    if (tableVisible) {
      // Si la tabla existe, no debe tener filas (empty state)
      const rows = page.locator('table tbody tr');
      await expect(rows).toHaveCount(0);
    }
    // Alternativamente la página redirige — en cualquier caso, no hay datos visibles
  });
});
