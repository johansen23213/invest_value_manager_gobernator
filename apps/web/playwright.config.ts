import { defineConfig, devices } from '@playwright/test';

// E2E de flujos críticos. Requiere app construida + Postgres con seed.
// PW_CHROMIUM permite inyectar un binario de Chromium propio (contenedores/CI
// sin acceso al CDN de Playwright).
const executablePath = process.env.PW_CHROMIUM;

export default defineConfig({
  testDir: './e2e',
  timeout: 45_000,
  fullyParallel: false,
  // La suite muta estado compartido del seed (roles, prescripciones): serial.
  workers: 1,
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    launchOptions: executablePath
      ? {
          executablePath,
          args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
        }
      : {},
  },
  webServer: {
    command: 'pnpm start',
    url: 'http://localhost:3000',
    // El job e2e de CI arranca la app por separado (y espera a :3000) antes de
    // lanzar Playwright; reutilizamos ese servidor siempre. Si no hay ninguno
    // (uso local directo), Playwright lo arranca con `command`.
    reuseExistingServer: true,
    timeout: 120_000,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
