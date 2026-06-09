import { describe, expect, it } from 'vitest';
import {
  COPILOT_TOOLS,
  copilotToolDefinitions,
  parseToolInput,
  proposeCareRecordInput,
  listCareRecordsInput,
} from '../src/tools';

describe('COPILOT_TOOLS — registro', () => {
  it('incluye lecturas y escrituras-propuesta esperadas', () => {
    expect(Object.keys(COPILOT_TOOLS).sort()).toEqual(
      ['getResident', 'listCareRecords', 'proposeCareRecord', 'proposeCarePlan'].sort(),
    );
  });

  it('clasifica kind correctamente', () => {
    expect(COPILOT_TOOLS.getResident.kind).toBe('read');
    expect(COPILOT_TOOLS.listCareRecords.kind).toBe('read');
    expect(COPILOT_TOOLS.proposeCareRecord.kind).toBe('write-proposal');
    expect(COPILOT_TOOLS.proposeCarePlan.kind).toBe('write-proposal');
  });

  it('copilotToolDefinitions produce una definición por herramienta', () => {
    const defs = copilotToolDefinitions();
    expect(defs).toHaveLength(4);
    for (const d of defs) {
      expect(d.name).toBeTruthy();
      expect(d.description).toBeTruthy();
      expect(d.inputSchema).toEqual({ type: 'object' });
    }
  });
});

describe('Validación de esquemas Zod', () => {
  it('proposeCareRecord acepta input válido y aplica defaults', () => {
    const parsed = parseToolInput('proposeCareRecord', {
      residentId: 'r1',
      type: 'CONSTANTES',
      payload: { temperature: 37 },
    });
    expect(parsed).toMatchObject({ residentId: 'r1', type: 'CONSTANTES' });
  });

  it('proposeCareRecord rechaza type inválido', () => {
    expect(() =>
      proposeCareRecordInput.parse({ residentId: 'r1', type: 'NO_EXISTE', payload: {} }),
    ).toThrow();
  });

  it('proposeCareRecord rechaza residentId vacío', () => {
    expect(() =>
      proposeCareRecordInput.parse({ residentId: '', type: 'ABVD', payload: {} }),
    ).toThrow();
  });

  it('listCareRecords aplica limit por defecto y valida rango', () => {
    expect(listCareRecordsInput.parse({ residentId: 'r1' }).limit).toBe(50);
    expect(() => listCareRecordsInput.parse({ residentId: 'r1', limit: 0 })).toThrow();
    expect(() => listCareRecordsInput.parse({ residentId: 'r1', limit: 9999 })).toThrow();
  });

  it('proposeCarePlan aplica goals=[] por defecto', () => {
    const parsed = parseToolInput('proposeCarePlan', { residentId: 'r1', title: 'PIA' });
    expect(parsed).toMatchObject({ residentId: 'r1', title: 'PIA', goals: [] });
  });

  it('listCareRecords valida formato datetime', () => {
    expect(() => listCareRecordsInput.parse({ residentId: 'r1', from: 'no-es-fecha' })).toThrow();
    expect(
      listCareRecordsInput.parse({ residentId: 'r1', from: '2026-01-01T00:00:00.000Z' }),
    ).toBeTruthy();
  });
});
