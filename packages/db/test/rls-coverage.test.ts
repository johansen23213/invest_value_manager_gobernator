/**
 * Test meta de cobertura RLS por tabla (estático, sin BD).
 *
 * Propósito:
 *   Evitar que una tabla nueva con datos de tenant se cuele en producción sin
 *   el aislamiento RLS activo. El test parsea el schema.prisma, extrae todos
 *   los modelos que declaran un campo `tenantId` (campo Prisma) / `tenant_id`
 *   (columna SQL) y verifica que en alguna migración aparecen los tres
 *   elementos obligatorios para esa tabla:
 *     1. ENABLE ROW LEVEL SECURITY
 *     2. FORCE ROW LEVEL SECURITY
 *     3. CREATE POLICY  (cualquier política sobre esa tabla)
 *
 *   Estrategia de búsqueda: las migraciones pueden usar el nombre de tabla
 *   directamente ("ALTER TABLE \"users\"") o en un bloque DO $$ con un array
 *   de tablas (como hacen las migraciones H2-H4). Ambos patrones se detectan.
 *
 * Limitaciones declaradas:
 *   - No comprueba que las políticas sean correctas semánticamente (eso
 *     requiere Postgres). Solo verifica presencia en texto de migración.
 *   - No verifica que las migraciones se hayan aplicado (eso lo hace el job
 *     de CI con "pnpm --filter @vetlla/db migrate:deploy" antes de los tests
 *     de integración). Este test es la red de seguridad estructural.
 *
 * Cuándo falla:
 *   - Se añade un modelo con tenantId al schema pero no se crea la migración
 *     RLS correspondiente. El test falla con el nombre de la tabla afectada.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// ---------------------------------------------------------------------------
// Rutas (relativas al repo, absolutas en runtime)
// ---------------------------------------------------------------------------

const DB_PKG = join(__dirname, '..');
const SCHEMA_PATH = join(DB_PKG, 'prisma', 'schema.prisma');
const MIGRATIONS_DIR = join(DB_PKG, 'prisma', 'migrations');

// ---------------------------------------------------------------------------
// Parser de schema.prisma — extrae (modelName, sqlTableName) para los modelos
// que declaran un campo tenantId.
//
// NOTA SOBRE EL PARSER:
//   No se usa un regex simple `[^}]+` para capturar el cuerpo del bloque
//   porque los comentarios inline del schema pueden contener `}` literales
//   (p. ej. `// array [{ "time": "HH:MM", "dose": "2 comp" }]`) que
//   terminarían el regex prematuramente. En su lugar, se usa un scanner
//   línea a línea que rastrea la profundidad de llaves para encontrar el
//   cierre correcto del bloque `model X { ... }`.
// ---------------------------------------------------------------------------

interface ModelInfo {
  modelName: string; // nombre Prisma (p. ej. "EmergencyContact")
  sqlTable: string;  // nombre de tabla SQL según @@map (p. ej. "emergency_contacts")
}

/**
 * Extrae el cuerpo completo del primer bloque `model <name> { ... }` que
 * comience en o después de `startIndex`, respetando el balance de llaves.
 * Devuelve { name, body, endIndex } o null si no hay más modelos.
 */
function extractNextModelBlock(
  lines: string[],
  startLine: number,
): { name: string; body: string; endLine: number } | null {
  const headerRe = /^model\s+(\w+)\s*\{/;

  for (let i = startLine; i < lines.length; i++) {
    const headerMatch = headerRe.exec(lines[i]!);
    if (!headerMatch) continue;

    const modelName = headerMatch[1]!;
    const bodyLines: string[] = [lines[i]!];
    let depth = (lines[i]!.split('{').length - 1) - (lines[i]!.split('}').length - 1);

    for (let j = i + 1; j < lines.length; j++) {
      const line = lines[j]!;
      // Contar llaves solo fuera de strings (aproximación suficiente para el
      // formato estricto de schema.prisma, que no tiene strings multilínea).
      // Para evitar contar llaves dentro de comentarios de línea (// ...) o
      // de strings entre comillas dobles, procesamos el segmento antes de //.
      const commentStart = line.indexOf('//');
      const effectiveLine = commentStart >= 0 ? line.substring(0, commentStart) : line;
      depth += (effectiveLine.split('{').length - 1) - (effectiveLine.split('}').length - 1);
      bodyLines.push(line);
      if (depth <= 0) {
        return { name: modelName, body: bodyLines.join('\n'), endLine: j };
      }
    }
    // Bloque sin cerrar: esquema malformado.
    break;
  }

  return null;
}

function parseTenantModels(schemaContent: string): ModelInfo[] {
  const results: ModelInfo[] = [];
  const lines = schemaContent.split('\n');
  let cursor = 0;

  while (cursor < lines.length) {
    const block = extractNextModelBlock(lines, cursor);
    if (!block) break;
    cursor = block.endLine + 1;

    const { name: modelName, body } = block;

    // El modelo debe tener un campo tenantId (Prisma) que mapea a tenant_id.
    // Forma canónica en este repo: `tenantId  String  @map("tenant_id")`.
    // También acepta el campo sin @map explícito siempre que se llame tenantId
    // (Prisma lo convierte a tenant_id por convención camelCase→snake_case).
    if (!/\btenantId\b/.test(body)) continue;

    // Extraer la tabla SQL: busca @@map("tabla") en el cuerpo del bloque.
    // Si no hay @@map, Prisma usa el nombre del modelo en minúsculas; no
    // ocurre en este repo (todos los modelos tienen @@map explícito), pero
    // se maneja como fallback para robustez futura.
    const mapMatch = /@@map\("([^"]+)"\)/.exec(body);
    const sqlTable = mapMatch ? mapMatch[1]! : modelName.toLowerCase();

    results.push({ modelName, sqlTable });
  }

  return results;
}

// ---------------------------------------------------------------------------
// Lector de migraciones — concatena todo el SQL de las carpetas de migraciones.
// ---------------------------------------------------------------------------

function readAllMigrationsSql(migrationsDir: string): string {
  let combined = '';
  let entries: string[] = [];

  try {
    entries = readdirSync(migrationsDir, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort(); // orden lexicográfico = orden de aplicación
  } catch {
    // Si el directorio no existe, retorna vacío; los asserts del test
    // producirán mensajes de error descriptivos para cada tabla.
    return '';
  }

  for (const dir of entries) {
    const sqlPath = join(migrationsDir, dir, 'migration.sql');
    try {
      combined += '\n' + readFileSync(sqlPath, 'utf-8');
    } catch {
      // Migración sin SQL (raro, pero no fatal para el parser).
    }
  }

  return combined;
}

// ---------------------------------------------------------------------------
// Comprobadores de presencia RLS para una tabla concreta.
//
// Las migraciones de Vetlla usan dos patrones:
//
//  A) Inline (H1 + FamilyLink + AuditLog):
//       ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;
//       ALTER TABLE "users" FORCE ROW LEVEL SECURITY;
//       CREATE POLICY tenant_isolation ON "users" ...
//
//  B) DO $$ … ARRAY['centers', 'units', ...] (H2, H3, H4):
//       Buscar el nombre de tabla en algún array DO $$.
//       Si aparece en un bloque que contiene ENABLE ROW LEVEL SECURITY y
//       FORCE ROW LEVEL SECURITY, se considera cubierto.
//
// Para la política, en el patrón B el `CREATE POLICY` opera sobre `%I` con
// EXECUTE format(). Detectamos esto comprobando que el bloque DO $$ que
// contiene la tabla también contiene 'CREATE POLICY'.
// ---------------------------------------------------------------------------

function tableHasEnableRls(sql: string, table: string): boolean {
  // Patrón A: ALTER TABLE "tabla" ENABLE ROW LEVEL SECURITY
  const inlineRe = new RegExp(
    `ALTER\\s+TABLE\\s+"${table}"\\s+ENABLE\\s+ROW\\s+LEVEL\\s+SECURITY`,
    'i',
  );
  if (inlineRe.test(sql)) return true;

  // Patrón B: nombre de tabla literal dentro de un bloque DO $$ que contiene
  // ENABLE ROW LEVEL SECURITY (el EXECUTE format lo aplica dinámicamente).
  return tableInDoBlockWith(sql, table, 'ENABLE ROW LEVEL SECURITY');
}

function tableHasForceRls(sql: string, table: string): boolean {
  const inlineRe = new RegExp(
    `ALTER\\s+TABLE\\s+"${table}"\\s+FORCE\\s+ROW\\s+LEVEL\\s+SECURITY`,
    'i',
  );
  if (inlineRe.test(sql)) return true;

  return tableInDoBlockWith(sql, table, 'FORCE ROW LEVEL SECURITY');
}

function tableHasPolicy(sql: string, table: string): boolean {
  // Patrón A: CREATE POLICY … ON "tabla"
  const inlineRe = new RegExp(
    `CREATE\\s+POLICY\\s+\\w+\\s+ON\\s+"${table}"`,
    'i',
  );
  if (inlineRe.test(sql)) return true;

  // Patrón B: el bloque DO $$ contiene la tabla Y CREATE POLICY (con EXECUTE format)
  return tableInDoBlockWith(sql, table, 'CREATE POLICY');
}

/**
 * Devuelve true si algún bloque DO $$ ... $$ del SQL contiene el nombre de
 * tabla (como literal de cadena SQL, p. ej. 'emergency_contacts') Y también
 * contiene la palabra clave buscada.
 */
function tableInDoBlockWith(sql: string, table: string, keyword: string): boolean {
  // Extraer bloques DO $$ ... $$
  const doBlockRe = /DO\s+\$\$[\s\S]*?\$\$/gi;
  let blockMatch: RegExpExecArray | null;

  while ((blockMatch = doBlockRe.exec(sql)) !== null) {
    const block = blockMatch[0]!;
    // El nombre de tabla aparece como string SQL: 'emergency_contacts' o "emergency_contacts"
    const tableInBlock =
      block.includes(`'${table}'`) || block.includes(`"${table}"`);
    const keywordInBlock = new RegExp(keyword, 'i').test(block);

    if (tableInBlock && keywordInBlock) return true;
  }

  return false;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('RLS coverage — cobertura estructural por tabla (sin BD)', () => {
  const schemaContent = readFileSync(SCHEMA_PATH, 'utf-8');
  const allMigrationsSql = readAllMigrationsSql(MIGRATIONS_DIR);
  const tenantModels = parseTenantModels(schemaContent);

  it('detecta al menos un modelo con tenantId en el schema', () => {
    // Sanidad: si el parser está roto, este test lo evidencia antes que los
    // demás fallen con mensajes confusos.
    expect(tenantModels.length).toBeGreaterThan(0);
  });

  it('lista completa de modelos con tenantId (inventario)', () => {
    // Este test es informativo: si añades un modelo aquí aparece en la lista.
    // No falla; sirve de inventario visible en los logs del CI.
    const tableNames = tenantModels.map((m) => m.sqlTable).sort();
    // Verifica que están las tablas conocidas del MVP (H0-H6).
    const expectedKnown = [
      'allergies',
      'announcement_receipts',
      'announcements',
      'assessments',
      'audit_logs',
      'beds',
      'care_plan_goals',
      'care_plan_reviews',
      'care_plans',
      'care_records',
      'centers',
      'consent_records',
      'diagnoses',
      'discharge_records',
      'intake_records',
      'emergency_contacts',
      'fall_records',
      'family_links',
      'life_stories',
      'medical_notes',
      'medication_administrations',
      'medication_sync_conflicts',
      'medications',
      'menu_items',
      'message_threads',
      'messages',
      'nursing_notes',
      'pressure_ulcers',
      'resident_devices',
      'residents',
      'restraints',
      'service_request_comments',
      'service_requests',
      'social_reports',
      'sync_conflicts',
      'treatments',
      'units',
      'upp_curings',
      'users',
      'vaccines',
      'visit_slot_configs',
      'visits',
      'weight_records',
      'wellbeing_profiles',
    ].sort();
    // Si aparece una tabla nueva (o falta alguna esperada), este test lo muestra.
    expect(tableNames).toEqual(expectedKnown);
  });

  // Genera un test por tabla con tenantId: cualquier tabla sin RLS hace fallar la suite.
  for (const { modelName, sqlTable } of tenantModels) {
    it(`${sqlTable} (model ${modelName}) — ENABLE ROW LEVEL SECURITY`, () => {
      const hasEnable = tableHasEnableRls(allMigrationsSql, sqlTable);
      expect(
        hasEnable,
        `FALTA: no se encontró "ALTER TABLE "${sqlTable}" ENABLE ROW LEVEL SECURITY" ` +
          `ni el equivalente en bloque DO $$ en ninguna migración. ` +
          `Añade una migración RLS para la tabla "${sqlTable}".`,
      ).toBe(true);
    });

    it(`${sqlTable} (model ${modelName}) — FORCE ROW LEVEL SECURITY`, () => {
      const hasForce = tableHasForceRls(allMigrationsSql, sqlTable);
      expect(
        hasForce,
        `FALTA: no se encontró "ALTER TABLE "${sqlTable}" FORCE ROW LEVEL SECURITY" ` +
          `ni el equivalente en bloque DO $$ en ninguna migración. ` +
          `FORCE es obligatorio (garantiza que el propietario de la tabla también queda aislado). ` +
          `Añade una migración RLS para la tabla "${sqlTable}".`,
      ).toBe(true);
    });

    it(`${sqlTable} (model ${modelName}) — CREATE POLICY`, () => {
      const hasPolicy = tableHasPolicy(allMigrationsSql, sqlTable);
      expect(
        hasPolicy,
        `FALTA: no se encontró ninguna política RLS (CREATE POLICY ... ON "${sqlTable}") ` +
          `ni el equivalente en bloque DO $$ en ninguna migración. ` +
          `Sin política, RLS bloquea todo el acceso (fallo en cerrado total). ` +
          `Añade una migración con CREATE POLICY para la tabla "${sqlTable}".`,
      ).toBe(true);
    });
  }
});
