import { expect, test } from '@playwright/test';

test('la página de login muestra el formulario', async ({ page }) => {
  await page.goto('/login');
  // El wordmark "Vetlla" del Logo (no es un heading desde el rediseño UX-07).
  // Tras el rediseño hay dos spans con "Vetlla" en el DOM (panel decorativo desktop
  // visible + logo mobile oculto en lg:hidden). Usamos .first() para evitar
  // strict mode violation — ambos tienen el mismo texto exacto.
  await expect(page.getByText('Vetlla', { exact: true }).first()).toBeVisible();
  await expect(page.getByLabel('Email')).toBeVisible();
  await expect(page.getByLabel('Contraseña')).toBeVisible();
  await expect(page.getByRole('button', { name: /entrar/i })).toBeVisible();
});
