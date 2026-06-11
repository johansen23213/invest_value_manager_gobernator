# Suite E2E de Vetlla — Playwright

## Prerequisitos

- Postgres local con el seed de demo ejecutado (`pnpm --filter @vetlla/db seed`).
- Variables de entorno disponibles en `.env` en la raíz del monorepo.
- Puerto 3000 libre. Si está ocupado, libéralo o ajusta `baseURL` y `webServer.url`
  en `apps/web/playwright.config.ts`.

## Primera vez: instalar Chromium

```bash
pnpm --filter @vetlla/web exec playwright install chromium
```

## Ejecutar la suite

```bash
# Construir la app y lanzar los tests
pnpm --filter @vetlla/web build
pnpm --filter @vetlla/web test:e2e
```

O desde la raíz del monorepo:

```bash
pnpm build && pnpm --filter @vetlla/web test:e2e
```

## Estructura de la suite

| Fichero                  | Área              | Criterios cubiertos                              |
|--------------------------|-------------------|--------------------------------------------------|
| `helpers/auth.ts`        | Helper de login   | `login()`, `loginAs()`                          |
| `smoke.spec.ts`          | Login             | Formulario de login visible                      |
| `medicacion-mar.spec.ts` | MAR               | M-01, M-02, M-03, M-04 (positivo/negativo), M-07 |
| `prescripcion.spec.ts`   | Prescripción      | M-05, M-06, M-07 (PRN oculta horas), M-08       |
| `equipo-rbac.spec.ts`    | Equipo / RBAC     | R-01, R-02, R-03, R-04; negativos auxiliar/familiar |
| `auditoria.spec.ts`      | Auditoría         | Traza de cambio de rol; negativo familiar        |

## Usuarios demo (seed)

| Rol       | Email                         | Contraseña  |
|-----------|-------------------------------|-------------|
| Director  | `direccion@demo.vetlla.dev`   | `vetlla1234` |
| Sanitario | `sanitario@demo.vetlla.dev`   | `vetlla1234` |
| Auxiliar  | `auxiliar@demo.vetlla.dev`    | `vetlla1234` |
| Familiar  | `familiar@demo.vetlla.dev`    | `vetlla1234` |

## Nota sobre los datos del seed

Algunos tests (M-08, auditoría) requieren que el seed incluya:
- Al menos un residente con una alergia registrada.
- Al menos un usuario con rol AUXILIAR (para el test de cambio de rol).

Si el seed no cumple estos requisitos, los tests afectados se omiten con
`test.skip()` sin romper la suite.
