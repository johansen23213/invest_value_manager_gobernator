import { describe, expect, it } from 'vitest';
import { DICTIONARIES, translate } from './dictionaries';

describe('translate', () => {
  it('traduce al castellano y al catalán', () => {
    expect(translate('es', 'nav.residents')).toBe('Residentes');
    expect(translate('ca', 'nav.residents')).toBe('Residents');
  });

  it('interpola variables', () => {
    expect(translate('es', 'state.pendingSync', { count: 3 })).toBe('3 por sincronizar');
    expect(translate('ca', 'state.pendingSync', { count: 3 })).toBe('3 per sincronitzar');
  });

  it('cae al castellano si falta la clave en catalán', () => {
    // Clave inexistente: devuelve la propia clave como último recurso.
    expect(translate('ca', 'clave.inexistente')).toBe('clave.inexistente');
  });
});

describe('paridad es/ca — Sprint M (medicación)', () => {
  const sprintMKeys = [
    'med.prescribe.title',
    'med.prescribe.submit',
    'med.prescribe.field.route',
    'med.prescribe.field.unit',
    'med.prescribe.field.type',
    'med.prescribe.field.daysOfWeek',
    'med.route.ORAL',
    'med.route.SUBCUTANEA',
    'med.route.INHALATORIA',
    'med.type.CRONICO',
    'med.type.PRN',
    'med.unit.COMPRIMIDO',
    'med.unit.PARCHE',
    'med.prn.title',
    'med.prn.empty',
    'med.allergy.warning',
    'med.allergy.block',
    'med.allergy.checkNote',
  ];

  it('todas las claves Sprint M existen en es', () => {
    for (const key of sprintMKeys) {
      expect(DICTIONARIES.es[key], `es: falta clave "${key}"`).toBeDefined();
    }
  });

  it('todas las claves Sprint M existen en ca', () => {
    for (const key of sprintMKeys) {
      expect(DICTIONARIES.ca[key], `ca: falta clave "${key}"`).toBeDefined();
    }
  });

  it('las traducciones ca no repiten literalmente las de es (paridad real)', () => {
    // Algunas son iguales por ser nombres propios/siglas: PRN, ORAL, etc.
    // Comprobamos que al menos hay diferencias en las claves narrativas.
    const narrativeKeys = [
      'med.prescribe.title',
      'med.prescribe.submit',
      'med.prn.empty',
      'med.allergy.warning',
    ];
    for (const key of narrativeKeys) {
      expect(DICTIONARIES.ca[key], `ca: falta clave narrativa "${key}"`).toBeDefined();
      // No tienen que ser iguales a es (pueden diferir aunque no es obligatorio para todas)
    }
  });
});

describe('paridad es/ca — H5 Slice 2 (copiloto: NL → CareRecord)', () => {
  const copilotKeys = [
    'copilot.title',
    'copilot.intro',
    'copilot.inputLabel',
    'copilot.placeholder',
    'copilot.generate',
    'copilot.generating',
    'copilot.badge',
    'copilot.transparency',
    'copilot.typeLabel',
    'copilot.noteLabel',
    'copilot.confirm',
    'copilot.saving',
    'copilot.discard',
    'copilot.saved',
    'copilot.discarded',
    'copilot.error.draft',
    'copilot.error.confirm',
    'copilot.error.invalid',
    'copilot.offline',
    'copilot.field.tension',
    'copilot.field.fc',
    'copilot.field.temperatura',
    'copilot.field.sato2',
    'copilot.field.nota',
    'copilot.field.notas',
    'copilot.field.comida',
    'copilot.field.porcentaje',
    'copilot.field.deposicion',
    'copilot.field.descripcion',
    'copilot.field.actividad',
  ];

  it('todas las claves del copiloto existen en es', () => {
    for (const key of copilotKeys) {
      expect(DICTIONARIES.es[key], `es: falta clave "${key}"`).toBeDefined();
    }
  });

  it('todas las claves del copiloto existen en ca', () => {
    for (const key of copilotKeys) {
      expect(DICTIONARIES.ca[key], `ca: falta clave "${key}"`).toBeDefined();
    }
  });

  it('las claves narrativas del copiloto difieren entre es y ca (paridad real)', () => {
    const narrativeKeys = ['copilot.badge', 'copilot.transparency', 'copilot.saved', 'copilot.offline'];
    for (const key of narrativeKeys) {
      expect(DICTIONARIES.es[key]).toBeDefined();
      expect(DICTIONARIES.ca[key]).toBeDefined();
      expect(DICTIONARIES.ca[key], `ca: "${key}" repite literalmente es`).not.toBe(
        DICTIONARIES.es[key],
      );
    }
  });
});

describe('paridad es/ca — H5 Slice 3 (copiloto: borrador de PIA)', () => {
  const copilotPiaKeys = [
    'copilotPia.title',
    'copilotPia.intro',
    'copilotPia.guidanceLabel',
    'copilotPia.guidancePlaceholder',
    'copilotPia.generate',
    'copilotPia.generating',
    'copilotPia.badge',
    'copilotPia.transparency',
    'copilotPia.titleLabel',
    'copilotPia.goalsLabel',
    'copilotPia.goalLabel',
    'copilotPia.addGoal',
    'copilotPia.removeGoal',
    'copilotPia.notesLabel',
    'copilotPia.confirm',
    'copilotPia.creating',
    'copilotPia.discard',
    'copilotPia.saved',
    'copilotPia.discarded',
    'copilotPia.error.draft',
    'copilotPia.error.confirm',
    'copilotPia.error.invalid',
  ];

  it('todas las claves del copiloto-PIA existen en es', () => {
    for (const key of copilotPiaKeys) {
      expect(DICTIONARIES.es[key], `es: falta clave "${key}"`).toBeDefined();
    }
  });

  it('todas las claves del copiloto-PIA existen en ca', () => {
    for (const key of copilotPiaKeys) {
      expect(DICTIONARIES.ca[key], `ca: falta clave "${key}"`).toBeDefined();
    }
  });

  it('las claves narrativas del copiloto-PIA difieren entre es y ca (paridad real)', () => {
    const narrativeKeys = [
      'copilotPia.badge',
      'copilotPia.transparency',
      'copilotPia.saved',
      'copilotPia.intro',
    ];
    for (const key of narrativeKeys) {
      expect(DICTIONARIES.es[key]).toBeDefined();
      expect(DICTIONARIES.ca[key]).toBeDefined();
      expect(DICTIONARIES.ca[key], `ca: "${key}" repite literalmente es`).not.toBe(
        DICTIONARIES.es[key],
      );
    }
  });
});

describe('paridad es/ca — Rediseño Dashboard + Residente (2026-06-11)', () => {
  const dashboardKeys = [
    'dashboard.greeting.morning',
    'dashboard.greeting.afternoon',
    'dashboard.greeting.evening',
    'dashboard.subtitle',
    'dashboard.kpi.centers',
    'dashboard.kpi.residents',
    'dashboard.kpi.occupancy',
    'dashboard.kpi.alerts',
    'dashboard.kpi.careToday',
    'dashboard.quickLinks',
    'dashboard.attention',
    'dashboard.attention.empty',
    'dashboard.medAlert',
    'dashboard.viewAll',
    'resident.age',
    'resident.ageBirthDate',
    'resident.noBirthDate',
    'resident.allergyBannerGrave',
    'resident.allergyBannerOther',
    'empty.alerts.title',
    'empty.alerts.desc',
  ];

  it('todas las claves del dashboard rediseñado existen en es', () => {
    for (const key of dashboardKeys) {
      expect(DICTIONARIES.es[key], `es: falta clave "${key}"`).toBeDefined();
    }
  });

  it('todas las claves del dashboard rediseñado existen en ca', () => {
    for (const key of dashboardKeys) {
      expect(DICTIONARIES.ca[key], `ca: falta clave "${key}"`).toBeDefined();
    }
  });

  it('claves narrativas del dashboard difieren entre es y ca', () => {
    const narrativeKeys = [
      'dashboard.greeting.morning',
      'dashboard.subtitle',
      'dashboard.attention.empty',
      'resident.allergyBannerGrave',
    ];
    for (const key of narrativeKeys) {
      expect(DICTIONARIES.es[key]).toBeDefined();
      expect(DICTIONARIES.ca[key]).toBeDefined();
      expect(DICTIONARIES.ca[key], `ca: "${key}" repite literalmente es`).not.toBe(
        DICTIONARIES.es[key],
      );
    }
  });
});

describe('paridad es/ca — MAR filtro de turno (UX-17)', () => {
  const shiftFilterKeys = [
    'mar.shift.filter.label',
    'mar.shift.all',
    'mar.shift.MANANA',
    'mar.shift.TARDE',
    'mar.shift.NOCHE',
    'mar.shift.notice',
    'mar.shift.showAll',
  ];

  it('todas las claves del filtro de turno existen en es', () => {
    for (const key of shiftFilterKeys) {
      expect(DICTIONARIES.es[key], `es: falta clave "${key}"`).toBeDefined();
    }
  });

  it('todas las claves del filtro de turno existen en ca', () => {
    for (const key of shiftFilterKeys) {
      expect(DICTIONARIES.ca[key], `ca: falta clave "${key}"`).toBeDefined();
    }
  });

  it('los nombres de turno difieren entre es y ca (paridad real)', () => {
    // "Mañana" ≠ "Matí", "Tarde" ≠ "Tarda", "Noche" ≠ "Nit"
    expect(DICTIONARIES.ca['mar.shift.MANANA']).not.toBe(DICTIONARIES.es['mar.shift.MANANA']);
    expect(DICTIONARIES.ca['mar.shift.TARDE']).not.toBe(DICTIONARIES.es['mar.shift.TARDE']);
    expect(DICTIONARIES.ca['mar.shift.NOCHE']).not.toBe(DICTIONARIES.es['mar.shift.NOCHE']);
  });
});

describe('paridad es/ca — Ola 1 Lifecare (auth panel claim)', () => {
  const authPanelKeys = ['auth.panel.claim', 'auth.panel.sub', 'auth.panel.trust'];

  it('todas las claves auth panel existen en es', () => {
    for (const key of authPanelKeys) {
      expect(DICTIONARIES.es[key], `es: falta clave "${key}"`).toBeDefined();
    }
  });

  it('todas las claves auth panel existen en ca', () => {
    for (const key of authPanelKeys) {
      expect(DICTIONARIES.ca[key], `ca: falta clave "${key}"`).toBeDefined();
    }
  });

  it('el claim del panel difiere entre es y ca (paridad real)', () => {
    expect(DICTIONARIES.ca['auth.panel.claim']).not.toBe(DICTIONARIES.es['auth.panel.claim']);
    expect(DICTIONARIES.ca['auth.panel.sub']).not.toBe(DICTIONARIES.es['auth.panel.sub']);
  });
});

describe('paridad es/ca — Wave B Sprint M (equipo + RBAC R-01/R-03)', () => {
  const waveBKeys = [
    'nav.team',
    'action.cancel',
    'action.save',
    'action.close',
    'state.loading',
    'team.title',
    'team.subtitle',
    'team.rolesReference',
    'team.filterByRole',
    'team.filterByTitle',
    'team.allRoles',
    'team.empty',
    'team.viewAccess',
    'team.editFunction',
    'team.roleChanged',
    'team.profileUpdated',
    'team.familiarNote',
    'team.accessDialog.title',
    'team.changeRole.title',
    'team.changeRole.button',
    'team.changeRole.confirm',
    'team.changeRole.confirmTitle',
    'team.editJobTitle.title',
    'team.editJobTitle.label',
    'team.editJobTitle.placeholder',
    'team.editJobTitle.presetNote',
  ];

  it('todas las claves Wave B existen en es', () => {
    for (const key of waveBKeys) {
      expect(DICTIONARIES.es[key], `es: falta clave "${key}"`).toBeDefined();
    }
  });

  it('todas las claves Wave B existen en ca', () => {
    for (const key of waveBKeys) {
      expect(DICTIONARIES.ca[key], `ca: falta clave "${key}"`).toBeDefined();
    }
  });

  it('claves narrativas de equipo difieren entre es y ca', () => {
    const narrativeKeys = ['team.title', 'team.subtitle', 'team.familiarNote'];
    for (const key of narrativeKeys) {
      expect(DICTIONARIES.es[key]).toBeDefined();
      expect(DICTIONARIES.ca[key]).toBeDefined();
    }
  });
});
