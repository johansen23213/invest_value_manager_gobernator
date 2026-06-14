/**
 * Test meta de cobertura DSAR por tabla (estático, sin BD).
 *
 * Propósito:
 *   Evitar que una tabla nueva con datos del residente se cuele en producción
 *   sin que su autor haya decidido conscientemente su política DSAR (export art. 15
 *   y anonimización art. 17). El test parsea schema.prisma, extrae todos los
 *   modelos con campo `residentId` (directo, no solo relación) y verifica que
 *   cada uno está declarado en RESIDENT_DATA_TABLES (dsar-registry.ts).
 *
 *   Inspirado en el patrón ya establecido por rls-coverage.test.ts para RLS.
 *   Ver hallazgo H-2 del informe de revisión de arquitectura 2026-06-12.
 *
 * Estrategia:
 *   - Parseo estático del schema (mismo parser que rls-coverage.test.ts):
 *     extrae bloques `model X { ... }` respetando balance de llaves.
 *   - Filtra modelos que declaren un campo llamado `residentId` (línea con
 *     `residentId` como nombre de campo — no el campo del modelo Resident ni
 *     relaciones inversas).
 *   - Compara contra RESIDENT_DATA_TABLE_MAP (keyed por modelName).
 *
 * Cuándo falla:
 *   - Se añade un modelo con `residentId` al schema pero no se registra en
 *     RESIDENT_DATA_TABLES → CI rojo. El autor debe decidir la política.
 *   - Se registra un modelo en RESIDENT_DATA_TABLES que ya no existe en el
 *     schema → CI rojo. Limpiar el registro.
 *
 * Cuándo NO falla (exclusiones explícitas):
 *   - Modelos con `residentId` que son exclusiones deliberadas: deben aparecer
 *     en RESIDENT_DATA_TABLES con la política elegida (aunque sea export:false).
 *     La mera presencia en el registro documenta la decisión.
 *
 * Limitaciones:
 *   - Solo detecta `residentId` directo. Modelos hijo (p. ej. UPPCuring que solo
 *     tiene pressureUlcerId) quedan fuera del scanner; su cobertura DSAR la
 *     gestiona el padre (PressureUlcer ya registrado).
 *   - No verifica la corrección semántica del export/anonimización (requiere BD).
 *     Para eso están los tests de integración en dsar.integration.test.ts.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { RESIDENT_DATA_TABLE_MAP, RESIDENT_DATA_TABLES } from '../src/dsar-registry';

// ---------------------------------------------------------------------------
// Rutas
// ---------------------------------------------------------------------------

const DB_PKG     = join(__dirname, '..');
const SCHEMA_PATH = join(DB_PKG, 'prisma', 'schema.prisma');

// ---------------------------------------------------------------------------
// Parser de schema.prisma (reutiliza el mismo enfoque que rls-coverage.test.ts)
// ---------------------------------------------------------------------------

/**
 * Extrae el cuerpo del primer bloque `model <name> { ... }` desde `startLine`,
 * respetando el balance de llaves (necesario porque los comentarios inline
 * del schema pueden contener `}` literales).
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
      const commentStart = line.indexOf('//');
      const effectiveLine = commentStart >= 0 ? line.substring(0, commentStart) : line;
      depth += (effectiveLine.split('{').length - 1) - (effectiveLine.split('}').length - 1);
      bodyLines.push(line);
      if (depth <= 0) {
        return { name: modelName, body: bodyLines.join('\n'), endLine: j };
      }
    }
    break;
  }
  return null;
}

/**
 * Extrae todos los modelos del schema que declaran un campo `residentId`
 * como campo propio (no como campo de relación inversa ni como campo opcional
 * sin @map).
 *
 * Patrón que detecta:
 *   residentId   String   @map("resident_id")
 *   residentId   String?  @map("resident_id")
 *
 * Patrón que NO detecta (relaciones inversas, campos de otro modelo):
 *   resident     Resident  @relation(...)
 */
function parseResidentModels(schemaContent: string): string[] {
  const lines = schemaContent.split('\n');
  const results: string[] = [];
  let cursor = 0;

  // Regex: una línea con "residentId" como nombre de campo Prisma (no como
  // parte de un comentario ni de una anotación). Acepta opcional (String?) y
  // con o sin @map.
  const fieldRe = /^\s+residentId\s+String\??/;

  while (cursor < lines.length) {
    const block = extractNextModelBlock(lines, cursor);
    if (!block) break;
    cursor = block.endLine + 1;

    const bodyLines = block.body.split('\n');
    const hasResidentIdField = bodyLines.some((l) => fieldRe.test(l));
    if (hasResidentIdField) {
      results.push(block.name);
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('DSAR coverage — cobertura estructural por tabla con residentId (sin BD)', () => {
  const schemaContent = readFileSync(SCHEMA_PATH, 'utf-8');
  const modelsWithResidentId = parseResidentModels(schemaContent);

  it('detecta al menos un modelo con residentId en el schema (sanidad del parser)', () => {
    expect(modelsWithResidentId.length).toBeGreaterThan(0);
  });

  it('inventario completo de modelos con residentId (informativo)', () => {
    // Test informativo: no falla, pero lista los modelos detectados en el CI log.
    // Si aparece un modelo nuevo aquí sin estar en RESIDENT_DATA_TABLES, el test
    // de cobertura de abajo lo detectará.
    const sorted = [...modelsWithResidentId].sort();
    expect(sorted.length).toBeGreaterThan(0);
    // Verificar que están los modelos conocidos del MVP
    const expectedKnown = [
      'Allergy',
      'Announcement',
      'Assessment',
      'CarePlan',
      'CareRecord',
      'ConsentRecord',
      'Diagnosis',
      'DischargeRecord',
      'EmergencyContact',
      'FallRecord',
      'FamilyLink',
      'IntakeRecord',
      'Invoice',
      'LifeStory',
      'MedicalNote',
      'Medication',
      'MedicationAdministration',
      'MessageThread',
      'NursingNote',
      'PressureUlcer',
      'Restraint',
      'ResidentBillingProfile',
      'ResidentDevice',
      'ServiceRequest',
      'SocialReport',
      'Treatment',
      'Vaccine',
      'Visit',
      'WeightRecord',
      'WellbeingProfile',
    ].sort();
    expect(sorted).toEqual(expectedKnown);
  });

  // Un test por modelo: falla si el modelo no está en RESIDENT_DATA_TABLES.
  // Esto es el "CI rojo" que busca H-2.
  for (const modelName of modelsWithResidentId) {
    it(`${modelName} — declarado en RESIDENT_DATA_TABLES con política DSAR`, () => {
      const entry = RESIDENT_DATA_TABLE_MAP.get(modelName);
      expect(
        entry,
        `FALTA: el modelo "${modelName}" tiene campo residentId en schema.prisma pero ` +
          `no está en RESIDENT_DATA_TABLES (packages/db/src/dsar-registry.ts). ` +
          `Añade una entrada con export:true/false y anonymize:'delete'|'scrub'|'keep' ` +
          `y actualiza exportResidentData/anonymizeResident en dsar.ts.`,
      ).toBeDefined();

      // Cada entrada debe tener una razón explícita (no vacía).
      expect(
        entry?.reason.trim().length,
        `La entrada de "${modelName}" en RESIDENT_DATA_TABLES tiene 'reason' vacía.`,
      ).toBeGreaterThan(0);
    });
  }

  // Test inverso: cada entrada del registro debe corresponder a un modelo real del schema.
  // Previene registros obsoletos (tabla eliminada del schema pero sigue en el registro).
  it('todas las entradas de RESIDENT_DATA_TABLES corresponden a modelos existentes en el schema', () => {
    const schemaModelSet = new Set(modelsWithResidentId);
    for (const entry of RESIDENT_DATA_TABLES) {
      expect(
        schemaModelSet.has(entry.model),
        `OBSOLETO: "${entry.model}" está en RESIDENT_DATA_TABLES pero no tiene campo ` +
          `residentId en schema.prisma. Elimina la entrada del registro.`,
      ).toBe(true);
    }
  });

  // Test de alineación con dsar.ts: los modelos con export:true deben aparecer
  // referenciados en el código de exportResidentData (comprobación textual).
  it('modelos con export:true aparecen referenciados en dsar.ts (alineación)', () => {
    const dsarSrc = readFileSync(join(DB_PKG, 'src', 'dsar.ts'), 'utf-8');
    const exportTrue = RESIDENT_DATA_TABLES.filter((e) => e.export);

    for (const entry of exportTrue) {
      // Convertir PascalCase a camelCase para buscar db.modelName (Prisma client)
      // p. ej. ServiceRequest → serviceRequest, CareRecord → careRecord
      const camelCase = entry.model.charAt(0).toLowerCase() + entry.model.slice(1);
      const referenced = dsarSrc.includes(`db.${camelCase}`) || dsarSrc.includes(`db.${entry.model}`);
      expect(
        referenced,
        `DESALINEACIÓN: "${entry.model}" está marcado export:true en RESIDENT_DATA_TABLES ` +
          `pero no aparece referenciado en exportResidentData (dsar.ts). ` +
          `Asegúrate de incluirlo en el Promise.all del export.`,
      ).toBe(true);
    }
  });
});
