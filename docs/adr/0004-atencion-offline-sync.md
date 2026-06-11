# ADR 0004 — Atención directa offline-first y sincronización

- **Estado:** Aceptada
- **Fecha:** 2026-06-07
- **Hito:** H3

## Contexto

El auxiliar registra a pie de cama desde tablet, a menudo sin red. Requisito de
aceptación: registrar sin conexión y que los datos aparezcan al volver online
**sin duplicados**, con resolución de conflictos.

## Decisión

- **Cola local en IndexedDB** (`outbox`, vía `idb`). Al registrar, el dato se escribe
  primero en local (UX instantánea offline) y se intenta sincronizar.
- **Idempotencia por `clientId`** (uuid generado en el dispositivo). El servidor hace
  upsert por `(tenant_id, client_id)`: reenviar el mismo registro **no duplica**. Es la
  garantía central frente a reintentos/redes intermitentes.
- **Last-write-wins por campo + registro de conflictos.** Cada registro lleva
  `fieldTimestamps` (campo → ISO). Al fusionar, gana el timestamp más reciente por campo;
  toda divergencia se persiste en `SyncConflict` (valor servidor, valor cliente, ganador).
  La función `mergeCareRecord` es **pura** (testeada de forma exhaustiva, sin BD).
- **Lógica de sync en `packages/db`** (`applyCareRecordPush`): la usa el router tRPC y la
  testean las pruebas de integración. Acotada al tenant (RLS) y verifica que el residente
  pertenece al tenant.
- **Motor de sync en el cliente** (`src/offline`): empuja pendientes al recuperar red
  (evento `online`), en intervalo, y tras cada registro. Cliente tRPC "vanilla" para
  operar fuera de React.
- **PWA**: `manifest.webmanifest` + service worker network-first (nunca cachea `/api/`).
  El SW da offline de la *navegación*; la capacidad offline de los *datos* es la cola
  IndexedDB, independiente del SW.
- **RBAC**: el auxiliar tiene `care:read`/`care:write` (es su trabajo); también sanitario y
  dirección.

## Alternativas consideradas

- **CRDTs / Yjs:** sobredimensionado para registros de atención mayormente append-only.
  LWW-por-campo + log de conflictos cubre el caso con coste mínimo.
- **Background Sync API:** útil pero con soporte desigual; usamos eventos `online` +
  intervalo, y queda la puerta abierta a Background Sync.

## Consecuencias

- Verificado: merge puro (5 tests), integración BD —idempotencia, LWW+conflicto, RLS—
  (3 tests), y push idempotente end-to-end por HTTP (mismo clientId → 1 registro).
- Conflictos quedan registrados pero su **revisión/resolución manual en UI** queda
  pendiente (hoy gana el más reciente y se audita). El histórico offline en la UI de
  atención hoy se muestra solo online (los pendientes se ven en el contador de la shell).
- Iconos PWA en SVG (sin pipeline de PNG); suficiente para instalar en navegadores modernos.
