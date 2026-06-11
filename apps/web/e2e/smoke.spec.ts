import { expect, test } from '@playwright/test';

test('la página de login muestra el formulario', async ({ page }) => {
  await page.goto('/login');
  // El wordmark "Vetlla" del Logo (no es un heading desde el rediseño UX-07).
  await expect(page.getByText('Vetlla', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Email')).toBeVisible();
  await expect(page.getByLabel('Contraseña')).toBeVisible();
  await expect(page.getByRole('button', { name: /entrar/i })).toBeVisible();
});
