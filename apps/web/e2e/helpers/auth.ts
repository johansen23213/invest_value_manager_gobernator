/**
 * Helpers de autenticación para la suite E2E de Vetlla.
 *
 * Uso:
 *   import { login, loginAs } from './helpers/auth';
 *   await loginAs(page, 'sanitario');
 */

import type { Page } from '@playwright/test';

// Usuarios demo del seed. Contraseña compartida.
const DEMO_USERS = {
  director:  'direccion@demo.vetlla.dev',
  sanitario: 'sanitario@demo.vetlla.dev',
  auxiliar:  'auxiliar@demo.vetlla.dev',
  familiar:  'familiar@demo.vetlla.dev',
} as const;

const DEMO_PASSWORD = 'vetlla1234';

export type DemoRole = keyof typeof DEMO_USERS;

/**
 * Rellena el formulario de /login y espera a que la URL ya no sea /login.
 * Lanza si aparece el mensaje de error de credenciales.
 */
export async function login(
  page: Page,
  email: string,
  password: string = DEMO_PASSWORD,
): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Contraseña').fill(password);
  await page.getByRole('button', { name: /entrar/i }).click();

  // Esperar a salir de /login (redirect a dashboard o portal)
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 15_000 });
}

/**
 * Shortcut por rol demo.
 */
export async function loginAs(page: Page, role: DemoRole): Promise<void> {
  await login(page, DEMO_USERS[role]);
}
