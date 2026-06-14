/**
 * Guardarraíl anti-regresión: ningún fichero 'use client' puede importar
 * desde '@/server/' (incluyendo routers, trpc, etc.).
 *
 * Este test escanea estáticamente el código fuente y falla si detecta la
 * combinación prohibida. No requiere bundler ni ejecución de los módulos:
 * es un análisis de texto que corre en CI con `pnpm --filter web test`.
 *
 * Causa raíz del bug P1 (2026-06-14):
 *   Ficheros 'use client' importaban Zod schemas / tipos desde
 *   '@/server/routers/*'. En producción, Next.js metía esos módulos de
 *   servidor en el bundle de cliente, arrastrando PrismaClient y provocando
 *   un crash de runtime en todas las páginas afectadas.
 *
 * Solución arquitectónica:
 *   Los schemas Zod reutilizables viven en '@/lib/schemas/<dominio>' (solo
 *   importan `zod` y `@prisma/client`). Los routers re-exportan desde ahí.
 *   Los ficheros cliente importan desde '@/lib/schemas/*', nunca desde
 *   '@/server/*'.
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// ---------------------------------------------------------------------------
// Configuración
// ---------------------------------------------------------------------------

/** Raíz del paquete web (relativa a este fichero). */
const WEB_SRC = path.resolve(__dirname, '../../../..');

/** Carpeta src del paquete web. */
const WEB_SRC_DIR = path.join(WEB_SRC, 'src');

/**
 * Carpeta a escanear: TODO src (no solo app/). Los componentes cliente viven
 * también en components/, y el cableado tRPC en trpc/ — la fuga puede estar
 * en cualquiera. Excluimos node_modules y .next automáticamente.
 */
const SCAN_DIR = WEB_SRC_DIR;

/** Import (de cualquier cosa) bajo @/server/ */
const SERVER_IMPORT_RE = /from\s+['"]@\/server\//;

/**
 * Import SOLO de tipos: `import type { X } from '@/server/...'`. Se borran en
 * compilación, así que NO arrastran código de servidor al bundle y son seguros
 * (p. ej. trpc/react.tsx importa el tipo AppRouter). El guardarraíl los permite.
 */
const TYPE_ONLY_IMPORT_RE = /^\s*import\s+type\s/;

/** Patrón que identifica la directiva 'use client' */
const USE_CLIENT_RE = /^['"]use client['"]/m;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function walkSync(dir: string, results: string[] = []): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      // Excluir node_modules y .next
      if (entry.name === 'node_modules' || entry.name === '.next') continue;
      walkSync(full, results);
    } else if (entry.isFile() && /\.(tsx?|jsx?)$/.test(entry.name)) {
      results.push(full);
    }
  }
  return results;
}

/** Devuelve true si el fichero tiene 'use client' en las primeras 5 líneas. */
function isClientFile(source: string): boolean {
  const lines = source.split('\n').slice(0, 5).join('\n');
  return USE_CLIENT_RE.test(lines);
}

/** Devuelve las líneas problemáticas (números de línea, 1-based). */
function findForbiddenImports(source: string): number[] {
  return source
    .split('\n')
    .map((line, idx) => ({ line, idx: idx + 1 }))
    // Import por VALOR desde @/server/ (excluye `import type`, que es seguro).
    .filter(({ line }) => SERVER_IMPORT_RE.test(line) && !TYPE_ONLY_IMPORT_RE.test(line))
    .map(({ idx }) => idx);
}

// ---------------------------------------------------------------------------
// Test
// ---------------------------------------------------------------------------

describe('Guardarraíl: ningún fichero "use client" puede importar desde @/server/', () => {
  it('no hay ficheros cliente con imports de servidor', () => {
    const allFiles = walkSync(SCAN_DIR);
    const violations: Array<{ file: string; lines: number[] }> = [];

    for (const file of allFiles) {
      const source = fs.readFileSync(file, 'utf-8');
      if (!isClientFile(source)) continue;

      const badLines = findForbiddenImports(source);
      if (badLines.length > 0) {
        violations.push({
          file: path.relative(WEB_SRC_DIR, file),
          lines: badLines,
        });
      }
    }

    if (violations.length > 0) {
      const report = violations
        .map(({ file, lines }) =>
          `  ${file} (líneas: ${lines.join(', ')})`,
        )
        .join('\n');

      throw new Error(
        `\n\n[GUARDARRAIL] Se detectaron ${violations.length} fichero(s) "use client" ` +
        `con imports desde "@/server/".\n` +
        `\nFicheros afectados:\n${report}\n\n` +
        `Solución: extrae los schemas Zod/tipos que necesita el cliente a ` +
        `"@/lib/schemas/<dominio>" (solo zod + @prisma/client) y actualiza ` +
        `el import en el fichero cliente.\n`,
      );
    }

    // Confirmar cuántos ficheros se escanearon para que sea obvio que el test corrió
    expect(allFiles.length).toBeGreaterThan(0);
    expect(violations).toHaveLength(0);
  });
});
