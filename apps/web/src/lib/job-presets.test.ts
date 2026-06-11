/**
 * Tests para los presets función→rol (R-01).
 *
 * Verifica que:
 * - Cada función habitual sugiere un rol correcto.
 * - Funciones desconocidas no tienen preset (sin sugerencia forzada).
 * - La lista de opciones cubre los arquetipos del dominio.
 */
import { describe, expect, it } from 'vitest';
import { JOB_TITLE_OPTIONS, JOB_TITLE_ROLE_PRESETS, suggestRoleForJobTitle } from './job-presets';

describe('presets función→rol (R-01)', () => {
  it('Director/a sugiere DIRECTOR', () => {
    expect(suggestRoleForJobTitle('Director/a')).toBe('DIRECTOR');
  });

  it('Médico/a sugiere SANITARIO', () => {
    expect(suggestRoleForJobTitle('Médico/a')).toBe('SANITARIO');
  });

  it('Enfermero/a (DUE) sugiere SANITARIO', () => {
    expect(suggestRoleForJobTitle('Enfermero/a (DUE)')).toBe('SANITARIO');
  });

  it('Fisioterapeuta sugiere SANITARIO', () => {
    expect(suggestRoleForJobTitle('Fisioterapeuta')).toBe('SANITARIO');
  });

  it('Terapeuta ocupacional sugiere SANITARIO', () => {
    expect(suggestRoleForJobTitle('Terapeuta ocupacional')).toBe('SANITARIO');
  });

  it('Trabajador/a social sugiere SANITARIO', () => {
    expect(suggestRoleForJobTitle('Trabajador/a social')).toBe('SANITARIO');
  });

  it('Auxiliar de atención directa sugiere AUXILIAR', () => {
    expect(suggestRoleForJobTitle('Auxiliar de atención directa')).toBe('AUXILIAR');
  });

  it('Animador/a sociocultural sugiere AUXILIAR', () => {
    expect(suggestRoleForJobTitle('Animador/a sociocultural')).toBe('AUXILIAR');
  });

  it('Mantenimiento sugiere AUXILIAR', () => {
    expect(suggestRoleForJobTitle('Mantenimiento')).toBe('AUXILIAR');
  });

  it('Familiar sugiere FAMILIAR', () => {
    expect(suggestRoleForJobTitle('Familiar')).toBe('FAMILIAR');
  });

  it('Recepcionista sugiere DIRECTOR (revisable, R5)', () => {
    expect(suggestRoleForJobTitle('Recepcionista')).toBe('DIRECTOR');
  });

  it('función desconocida no tiene preset', () => {
    expect(suggestRoleForJobTitle('Chef de cocina')).toBeUndefined();
    expect(suggestRoleForJobTitle('')).toBeUndefined();
    expect(suggestRoleForJobTitle('Limpieza')).toBeUndefined();
  });

  it('JOB_TITLE_OPTIONS cubre los arquetipos del dominio', () => {
    // Los roles reales del sector deben estar presentes
    const required = ['Médico/a', 'Enfermero/a (DUE)', 'Fisioterapeuta', 'Auxiliar de atención directa'];
    for (const title of required) {
      expect(JOB_TITLE_OPTIONS).toContain(title);
    }
  });

  it('todos los JOB_TITLE_OPTIONS tienen un preset de rol', () => {
    for (const title of JOB_TITLE_OPTIONS) {
      expect(
        JOB_TITLE_ROLE_PRESETS[title],
        `Falta preset para "${title}"`,
      ).toBeDefined();
    }
  });

  it('todos los presets tienen un rol válido', () => {
    const validRoles = new Set(['DIRECTOR', 'SANITARIO', 'AUXILIAR', 'FAMILIAR', 'SUPERADMIN']);
    for (const [title, role] of Object.entries(JOB_TITLE_ROLE_PRESETS)) {
      expect(validRoles.has(role), `Rol inválido "${role}" para "${title}"`).toBe(true);
    }
  });
});
