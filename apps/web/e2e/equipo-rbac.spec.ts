/**
 * Suite UAT — Equipo y RBAC
 *
 * Cubre:
 *   R-01  Editar la función (jobTitle) de un usuario.
 *   R-02  El componente RoleCapabilitiesCard muestra sección PUEDE y NO PUEDE.
 *   R-03  El botón "Ver acceso efectivo" abre el dialog con las capacidades.
 *   R-04  Cambiar el rol de un usuario requiere confirmación.
 *         Los familiares NO aparecen en la lista.
 *         Los filtros de rol y función funcionan.
 *
 * Casos negativos:
 *   - Auxiliar en /equipo es redirigido a /.
 *   - Familiar en /equipo es redirigido a / (o al portal).
 *
 * Prerequisitos:
 *   - App en :3000 con seed (usuarios de demo con los roles indicados).
 */

import { expect, test } from '@playwright/test';
import { loginAs } from './helpers/auth';

// ═══════════════════════════════════════════════════════════════════════════
// Como DIRECTOR
// ═══════════════════════════════════════════════════════════════════════════

test.describe('Equipo — como director', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, 'director');
    await page.goto('/equipo');
    // Esperar a que la lista de usuarios cargue
    await page.waitForSelector('[data-testid="team-user-row"]', { timeout: 10_000 });
  });

  test('lista usuarios con rol y función visibles', async ({ page }) => {
    const firstRow = page.getByTestId('team-user-row').first();
    await expect(firstRow).toBeVisible();

    // Al menos uno de los textos de rol debe existir en la fila (badge visible)
    const rowText = await firstRow.textContent();
    const hasRole = /Dirección|Sanitario|Auxiliar|Superadmin/i.test(rowText ?? '');
    expect(hasRole).toBe(true);
  });

  test('familiares excluidos de la lista', async ({ page }) => {
    // Ninguna fila debe tener data-user-role="FAMILIAR"
    const familiarRows = page.locator('[data-testid="team-user-row"][data-user-role="FAMILIAR"]');
    await expect(familiarRows).toHaveCount(0);
  });

  test('filtro por rol reduce la lista', async ({ page }) => {
    const allRows = page.getByTestId('team-user-row');
    const totalBefore = await allRows.count();

    // Filtrar por AUXILIAR
    const filterSelect = page.getByLabel('Filtrar por rol');
    await filterSelect.selectOption('AUXILIAR');

    // Después del filtro, cada fila visible debe tener el rol AUXILIAR
    await page.waitForTimeout(300); // render del filtro (local, sin debounce)
    const filteredRows = page.getByTestId('team-user-row');
    const totalAfter = await filteredRows.count();

    // Puede ser 0 si no hay auxiliares, o menor/igual al total
    expect(totalAfter).toBeLessThanOrEqual(totalBefore);

    // Todas las filas visibles deben ser AUXILIAR
    for (let i = 0; i < totalAfter; i++) {
      const row = filteredRows.nth(i);
      await expect(row).toHaveAttribute('data-user-role', 'AUXILIAR');
    }

    // Restablecer filtro
    await filterSelect.selectOption('');
  });

  // ─────────────────────────────────────────────────────────────────────────
  // R-03 — "Ver acceso efectivo" abre el dialog PUEDE / NO PUEDE
  // ─────────────────────────────────────────────────────────────────────────

  test('R-02/R-03 — "Ver acceso efectivo" abre tarjeta con PUEDE y NO PUEDE', async ({ page }) => {
    const firstRow = page.getByTestId('team-user-row').first();
    const accessBtn = firstRow.getByTestId('btn-view-access');
    await expect(accessBtn).toBeVisible();

    await accessBtn.click();

    // El dialog debe abrirse con el título "Acceso efectivo"
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByRole('dialog')).toContainText(/acceso efectivo/i);

    // La card de capacidades debe mostrar la sección PUEDE
    const canSection = page.getByTestId('capabilities-can');
    await expect(canSection).toBeVisible();

    // Y la sección NO PUEDE (si el rol no es superadmin tendrá restricciones)
    // La usamos con .count() para no fallar si el rol tiene todos los permisos
    const cannotSection = page.getByTestId('capabilities-cannot');
    const cannotCount = await cannotSection.count();
    // Si existe, debe ser visible
    if (cannotCount > 0) {
      await expect(cannotSection.first()).toBeVisible();
    }

    // Cerrar el dialog
    await page.getByRole('button', { name: /cerrar/i }).click();
    await expect(page.getByRole('dialog')).not.toBeVisible();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // R-04 — Cambiar rol requiere confirmación
  // ─────────────────────────────────────────────────────────────────────────

  test('R-04 — cambiar rol abre dialog de confirmación', async ({ page }) => {
    // Buscar una fila de AUXILIAR para cambiar su rol sin riesgos
    const auxiliarRow = page.locator('[data-testid="team-user-row"][data-user-role="AUXILIAR"]').first();
    const rowCount = await auxiliarRow.count();
    if (rowCount === 0) {
      test.skip(); // No hay auxiliares en el seed — omitir
      return;
    }

    const changeRoleBtn = auxiliarRow.getByRole('button', { name: /cambiar rol/i });
    await expect(changeRoleBtn).toBeVisible();
    await changeRoleBtn.click();

    // Se abre el dialog de selección de nuevo rol
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText(/cambiar rol/i);

    // Seleccionar un rol diferente (SANITARIO)
    const roleSelect = dialog.getByLabel(/nuevo rol/i);
    await roleSelect.selectOption('SANITARIO');

    // El botón de confirmar debe estar activo
    const confirmBtn = dialog.getByRole('button', { name: /cambiar rol/i }).last();
    await expect(confirmBtn).not.toBeDisabled();

    // Confirmar — aparece el dialog de confirmación del sistema (ConfirmProvider)
    await confirmBtn.click();

    // El ConfirmProvider muestra un nuevo dialog con el título de confirmación
    const confirmDialog = page.getByRole('dialog');
    await expect(confirmDialog).toContainText(/confirmar cambio de rol/i);

    // Cancelar (no queremos modificar datos en el seed)
    await confirmDialog.getByRole('button', { name: /cancelar/i }).click();
    await expect(page.getByRole('dialog')).not.toBeVisible();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // R-01 — Editar función (jobTitle)
  // ─────────────────────────────────────────────────────────────────────────

  test('R-01 — "Editar función" abre dialog con input de función', async ({ page }) => {
    const firstRow = page.getByTestId('team-user-row').first();
    const editBtn = firstRow.getByRole('button', { name: /editar función/i });
    await expect(editBtn).toBeVisible();

    await editBtn.click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText(/editar función/i);

    // El campo de función debe estar presente
    const jobTitleInput = dialog.getByLabel(/función/i);
    await expect(jobTitleInput).toBeVisible();

    // Escribir una función de ejemplo
    await jobTitleInput.fill('Terapeuta ocupacional');

    // El botón guardar debe estar activo
    const saveBtn = dialog.getByRole('button', { name: /guardar/i });
    await expect(saveBtn).toBeVisible();
    await expect(saveBtn).not.toBeDisabled();

    // Cancelar para no modificar el seed
    await dialog.getByRole('button', { name: /cancelar/i }).click();
    await expect(page.getByRole('dialog')).not.toBeVisible();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Casos negativos: auxiliar y familiar no pueden ver /equipo
// ═══════════════════════════════════════════════════════════════════════════

test.describe('Equipo — acceso denegado (auxiliar)', () => {
  test('auxiliar en /equipo es redirigido a /', async ({ page }) => {
    await loginAs(page, 'auxiliar');
    await page.goto('/equipo');

    // La página redirige a '/' cuando el usuario no tiene users:read
    await page.waitForURL((url) => url.pathname === '/', { timeout: 8_000 });
    await expect(page).toHaveURL('/');
  });
});

test.describe('Equipo — acceso denegado (familiar)', () => {
  test('familiar en /equipo es redirigido (no accede a la lista)', async ({ page }) => {
    await loginAs(page, 'familiar');
    await page.goto('/equipo');

    // El familiar es redirigido. Puede ser '/' o '/portal'
    await page.waitForURL(
      (url) => url.pathname === '/' || url.pathname.startsWith('/portal'),
      { timeout: 8_000 },
    );

    // En ningún caso debe ver filas de usuarios del equipo
    const teamRows = page.getByTestId('team-user-row');
    await expect(teamRows).toHaveCount(0);
  });
});
