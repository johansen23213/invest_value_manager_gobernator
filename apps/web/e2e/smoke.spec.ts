import { expect, test } from '@playwright/test';

test('la página de login muestra el formulario', async ({ page }) => {
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: 'Vetlla' })).toBeVisible();
  await expect(page.getByLabel('Email')).toBeVisible();
  await expect(page.getByLabel('Contraseña')).toBeVisible();
  await expect(page.getByRole('button', { name: /entrar/i })).toBeVisible();
});
