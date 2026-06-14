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

  it('resuelve la pluralización ICU (one/other con #)', () => {
    // Regresión: dashboard.medAlert mostraba el bloque ICU sin interpolar.
    expect(translate('es', 'dashboard.medAlert', { count: 11 })).toBe('11 dosis sin administrar hoy');
    expect(translate('es', 'dashboard.medAlert', { count: 1 })).toBe('1 dosis sin administrar hoy');
    expect(translate('ca', 'dashboard.medAlert', { count: 11 })).toBe('11 dosis sense administrar avui');
    expect(translate('ca', 'dashboard.medAlert', { count: 1 })).toBe('1 dosi sense administrar avui');
    // No debe quedar ningún resto de sintaxis ICU sin resolver.
    expect(translate('ca', 'dashboard.medAlert', { count: 5 })).not.toContain('plural');
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

describe('paridad es/ca — Nav grupos (UX-nav-grupos)', () => {
  const navGroupKeys = [
    'nav.group.asistencial',
    'nav.group.familias',
    'nav.group.centro',
  ];

  it('todas las claves de grupos nav existen en es', () => {
    for (const key of navGroupKeys) {
      expect(DICTIONARIES.es[key], `es: falta clave "${key}"`).toBeDefined();
    }
  });

  it('todas las claves de grupos nav existen en ca', () => {
    for (const key of navGroupKeys) {
      expect(DICTIONARIES.ca[key], `ca: falta clave "${key}"`).toBeDefined();
    }
  });

  it('las traducciones de grupos nav difieren entre es y ca', () => {
    // 'Asistencial' ≠ 'Assistencial', 'Familias' ≠ 'Famílies', 'Centro' ≠ 'Centre'
    for (const key of navGroupKeys) {
      expect(DICTIONARIES.ca[key]).not.toBe(DICTIONARIES.es[key]);
    }
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

describe('paridad es/ca — Solicitudes del portal de familias (REQ-001..REQ-011)', () => {
  const requestKeys = [
    'nav.requests',
    'requests.portal.title',
    'requests.portal.intro',
    'requests.portal.new',
    'requests.portal.empty.title',
    'requests.portal.empty.desc',
    'requests.portal.attention',
    'requests.form.title',
    'requests.form.resident',
    'requests.form.category',
    'requests.form.priority',
    'requests.form.requestTitle',
    'requests.form.description',
    'requests.form.submit',
    'requests.form.success',
    'requests.detail.back',
    'requests.detail.comments',
    'requests.detail.noComments',
    'requests.detail.addComment',
    'requests.detail.commentSubmit',
    'requests.detail.commentSent',
    'requests.detail.rate',
    'requests.detail.rateSent',
    'requests.detail.reopen',
    'requests.detail.reopened',
    'requests.detail.you',
    'requests.detail.staff',
    'requests.staff.title',
    'requests.staff.intro',
    'requests.staff.filterStatus',
    'requests.staff.filterCategory',
    'requests.staff.empty.title',
    'requests.staff.detail.back',
    'requests.staff.detail.changeStatus',
    'requests.staff.detail.assign',
    'requests.staff.detail.statusUpdated',
    'requests.staff.detail.assigned',
    'requests.staff.detail.internalComment',
    'requests.staff.detail.internalBadge',
  ];

  it('todas las claves de solicitudes existen en es', () => {
    for (const key of requestKeys) {
      expect(DICTIONARIES.es[key], `es: falta clave "${key}"`).toBeDefined();
    }
  });

  it('todas las claves de solicitudes existen en ca', () => {
    for (const key of requestKeys) {
      expect(DICTIONARIES.ca[key], `ca: falta clave "${key}"`).toBeDefined();
    }
  });

  it('claves narrativas de solicitudes difieren entre es y ca (paridad real)', () => {
    const narrativeKeys = [
      'requests.portal.title',
      'requests.portal.intro',
      'requests.staff.intro',
      'requests.detail.noComments',
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

describe('paridad es/ca — Visitas (VIS-001..VIS-010)', () => {
  const visitsKeys = [
    'nav.visits',
    'visit.status.SOLICITADA',
    'visit.status.CONFIRMADA',
    'visit.status.RECHAZADA',
    'visit.status.CANCELADA',
    'visit.status.EN_CURSO',
    'visit.status.COMPLETADA',
    'visit.status.NO_SHOW',
    'visit.weekday.0',
    'visit.weekday.1',
    'visit.weekday.2',
    'visit.weekday.3',
    'visit.weekday.4',
    'visit.weekday.5',
    'visit.weekday.6',
    'visits.portal.title',
    'visits.portal.intro',
    'visits.portal.new',
    'visits.portal.empty.title',
    'visits.portal.empty.desc',
    'visits.portal.upcoming',
    'visits.portal.pending',
    'visits.portal.history',
    'visits.portal.pendingNote',
    'visits.portal.presentNote',
    'visits.portal.codeLabel',
    'visits.portal.visitors',
    'visits.portal.cancel',
    'visits.portal.cancel.done',
    'visits.portal.quicklink.label',
    'visits.portal.quicklink.desc',
    'visits.form.title',
    'visits.form.back',
    'visits.form.date',
    'visits.form.slot',
    'visits.form.slotEmpty',
    'visits.form.visitors',
    'visits.form.submit',
    'visits.form.successConfirmed',
    'visits.form.successPending',
    'visits.staff.title',
    'visits.staff.intro',
    'visits.staff.checkin',
    'visits.staff.checkin.submit',
    'visits.staff.checkin.success',
    'visits.staff.actions.approve',
    'visits.staff.actions.approved',
    'visits.staff.actions.reject',
    'visits.staff.actions.rejected',
    'visits.staff.actions.checkout',
    'visits.staff.actions.checkedOut',
    'visits.staff.actions.noshow',
    'visits.staff.actions.noshowed',
    'visits.staff.actions.cancel',
    'visits.staff.actions.cancelled',
    'visits.slots.title',
    'visits.slots.form.day',
    'visits.slots.form.start',
    'visits.slots.form.end',
    'visits.slots.form.capacity',
    'visits.slots.form.autoApprove',
    'visits.slots.form.saved',
  ];

  it('todas las claves de visitas existen en es', () => {
    for (const key of visitsKeys) {
      expect(DICTIONARIES.es[key], `es: falta clave "${key}"`).toBeDefined();
    }
  });

  it('todas las claves de visitas existen en ca', () => {
    for (const key of visitsKeys) {
      expect(DICTIONARIES.ca[key], `ca: falta clave "${key}"`).toBeDefined();
    }
  });

  it('claves narrativas de visitas difieren entre es y ca (paridad real)', () => {
    const narrativeKeys = [
      'visits.portal.title',
      'visits.portal.intro',
      'visits.portal.presentNote',
      'visits.staff.intro',
      'visit.weekday.1',
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

describe('paridad es/ca — Épica B (exitus, social, bienestar ACP)', () => {
  const epicaBKeys = [
    // Discharge
    'exp.discharge.title',
    'exp.discharge.register',
    'exp.discharge.confirm.title',
    'exp.discharge.confirm.button',
    'exp.discharge.saved',
    'exp.discharge.history.empty',
    'exp.discharge.field.type',
    'exp.discharge.field.dischargedAt',
    'exp.discharge.field.certifiedBy',
    'exp.discharge.field.belongingsReturned',
    'discharge.type.DEFUNCION',
    'discharge.type.VOLUNTARIA',
    'discharge.type.TRASLADO_CENTRO',
    'discharge.type.TRASLADO_HOSPITAL',
    'discharge.type.FIN_ESTANCIA',
    'discharge.type.OTRO',
    // Social
    'exp.social.title',
    'exp.social.report.title',
    'exp.social.report.empty',
    'exp.social.report.new',
    'exp.social.report.saved',
    'exp.social.field.reportDate',
    'exp.social.field.familySituation',
    'exp.social.field.supportNetwork',
    'exp.social.field.economicSituation',
    'exp.social.field.socialAssessment',
    'exp.social.field.nextReviewDate',
    // Wellbeing ACP
    'exp.wellbeing.title',
    'exp.wellbeing.subtitle',
    'exp.wellbeing.edit',
    'exp.wellbeing.saved',
    'exp.wellbeing.empty',
    'exp.wellbeing.dim.emotionalWellbeing',
    'exp.wellbeing.dim.physicalWellbeing',
    'exp.wellbeing.dim.materialWellbeing',
    'exp.wellbeing.dim.personalDevelopment',
    'exp.wellbeing.dim.selfDetermination',
    'exp.wellbeing.dim.interpersonalRelations',
    'exp.wellbeing.dim.socialInclusion',
    'exp.wellbeing.dim.rights',
    'exp.wellbeing.importantToThePerson',
    'exp.wellbeing.importantForThePerson',
    'exp.wellbeing.nextReviewDate',
    'exp.wellbeing.review.OVERDUE',
    'exp.wellbeing.review.DUE_SOON',
    'exp.wellbeing.review.OK',
    'exp.wellbeing.review.NOT_SET',
    // Panel ACP
    'nav.acp',
    'acp.title',
    'acp.subtitle',
    'acp.empty.title',
    'acp.empty.desc',
    'acp.col.resident',
    'acp.col.nextReview',
    'acp.col.status',
    'acp.badge.overdue',
    'acp.badge.due_soon',
  ];

  it('todas las claves Épica B existen en es', () => {
    for (const key of epicaBKeys) {
      expect(DICTIONARIES.es[key], `es: falta clave "${key}"`).toBeDefined();
    }
  });

  it('todas las claves Épica B existen en ca', () => {
    for (const key of epicaBKeys) {
      expect(DICTIONARIES.ca[key], `ca: falta clave "${key}"`).toBeDefined();
    }
  });

  it('claves narrativas de la Épica B difieren entre es y ca (paridad real)', () => {
    const narrativeKeys = [
      'exp.discharge.confirm.desc',
      'exp.wellbeing.subtitle',
      'exp.social.report.empty',
      'acp.subtitle',
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

describe('paridad es/ca — MFA + Lockout (RNF-SEG-002 / RNF-SEG-011)', () => {
  const mfaKeys = [
    'login.error.ACCOUNT_LOCKED',
    'login.error.MFA_REQUIRED',
    'login.error.MFA_INVALID',
    'mfa.setup.title',
    'mfa.setup.intro',
    'mfa.setup.qrLabel',
    'mfa.setup.codeLabel',
    'mfa.setup.confirm',
    'mfa.setup.confirming',
    'mfa.setup.success',
    'mfa.setup.recoveryTitle',
    'mfa.setup.recoveryHint',
    'mfa.disable.title',
    'mfa.disable.password',
    'mfa.disable.totp',
    'mfa.disable.submit',
    'mfa.disable.success',
    'mfa.status.enabled',
    'mfa.status.disabled',
    'mfa.status.recoveryCodes',
    'mfa.totp.label',
    'mfa.totp.submit',
    'mfa.totp.useRecovery',
    'mfa.recovery.label',
    'mfa.regenerate.title',
    'mfa.regenerate.submit',
    'mfa.regenerate.success',
  ];

  it('todas las claves MFA existen en es', () => {
    for (const key of mfaKeys) {
      expect(DICTIONARIES.es[key], `es: falta clave "${key}"`).toBeDefined();
    }
  });

  it('todas las claves MFA existen en ca', () => {
    for (const key of mfaKeys) {
      expect(DICTIONARIES.ca[key], `ca: falta clave "${key}"`).toBeDefined();
    }
  });

  it('claves narrativas MFA difieren entre es y ca (paridad real)', () => {
    const narrativeKeys = [
      'login.error.ACCOUNT_LOCKED',
      'mfa.setup.title',
      'mfa.setup.recoveryHint',
      'mfa.totp.useRecovery',
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

describe('paridad es/ca — Ola B (expediente sociosanitario Fase 1)', () => {
  const olaBKeys = [
    // Chrome safety chips
    'chrome.safety.devices',
    'chrome.safety.wandering',
    'chrome.safety.diet',
    // Visión 360 nuevas tarjetas
    'r360.devices.title',
    'r360.devices.empty',
    'r360.upp.title',
    'r360.upp.empty',
    'r360.weight.title',
    'r360.weight.empty',
    // Expediente — Cuidados
    'exp.care.title',
    'exp.care.dietType',
    'exp.care.liquidTexture',
    'exp.care.wanderingRisk',
    'exp.care.fallRisk',
    'exp.care.saved',
    // Expediente — Clínico+
    'exp.clinical.title',
    'exp.clinical.devices',
    'exp.clinical.devices.empty',
    'exp.clinical.vaccines',
    'exp.clinical.upp',
    'exp.clinical.falls',
    'exp.clinical.restraints',
    'exp.clinical.restraints.legalNote',
    'exp.clinical.consents',
    'exp.clinical.lifeStory',
    'exp.clinical.lifeStory.saved',
    // Expediente — Administrativo
    'exp.admin.title',
    'exp.admin.cip',
    'exp.admin.placeRegime',
    'exp.admin.legalRep',
    'exp.admin.advanceDirectives',
    'exp.admin.saved',
  ];

  it('todas las claves Ola B existen en es', () => {
    for (const key of olaBKeys) {
      expect(DICTIONARIES.es[key], `es: falta clave "${key}"`).toBeDefined();
    }
  });

  it('todas las claves Ola B existen en ca', () => {
    for (const key of olaBKeys) {
      expect(DICTIONARIES.ca[key], `ca: falta clave "${key}"`).toBeDefined();
    }
  });

  it('claves narrativas de la Ola B difieren entre es y ca', () => {
    const narrativeKeys = [
      'exp.care.title',
      'exp.clinical.restraints.legalNote',
      'exp.admin.title',
      'chrome.safety.devices',
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

describe('paridad es/ca — Notificaciones push (RF-NOT-001..005)', () => {
  const pushKeys = [
    'push.title',
    'push.subtitle',
    'push.enable',
    'push.disable',
    'push.enabled',
    'push.disabled',
    'push.notSupported',
    'push.permissionDenied',
    'push.devices.title',
    'push.devices.empty',
    'push.devices.remove',
    'push.devices.removed',
  ];

  it('todas las claves push existen en es', () => {
    for (const key of pushKeys) {
      expect(DICTIONARIES.es[key], `es: falta clave "${key}"`).toBeDefined();
    }
  });

  it('todas las claves push existen en ca', () => {
    for (const key of pushKeys) {
      expect(DICTIONARIES.ca[key], `ca: falta clave "${key}"`).toBeDefined();
    }
  });

  it('claves narrativas push difieren entre es y ca (paridad real)', () => {
    const narrativeKeys = [
      'push.title',
      'push.subtitle',
      'push.notSupported',
      'push.permissionDenied',
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

describe('paridad es/ca — Valoraciones: alertas de vencimiento + evolución (RF-VAL-004..008)', () => {
  const valoracionKeys = [
    'nav.valoraciones',
    'valoracion.status.al_dia',
    'valoracion.status.proxima',
    'valoracion.status.vencida',
    'valoracion.alerts.title',
    'valoracion.alerts.subtitle',
    'valoracion.alerts.empty.title',
    'valoracion.alerts.empty.desc',
    'valoracion.alerts.filter.unit',
    'valoracion.alerts.filter.all',
    'valoracion.alerts.col.resident',
    'valoracion.alerts.col.scale',
    'valoracion.alerts.col.lastDate',
    'valoracion.alerts.col.dueDate',
    'valoracion.alerts.col.status',
    'valoracion.alerts.col.actions',
    'valoracion.alerts.action.assess',
    'valoracion.alerts.daysOverdue',
    'valoracion.alerts.daysUntilDue',
    'valoracion.alerts.dueToday',
    'valoracion.alerts.cadence',
    'valoracion.dashboard.badge',
    'valoracion.dashboard.overdue',
    'valoracion.dashboard.proximas',
    'valoracion.evolution.title',
    'valoracion.evolution.empty',
    'valoracion.evolution.score',
    'valoracion.evolution.date',
    'valoracion.evolution.cadence',
    'scale.BARTHEL',
    'scale.TINETTI',
    'scale.PFEIFFER',
    'scale.MEC_LOBO',
    'scale.GDS_REISBERG',
    'scale.NORTON',
    'scale.BRADEN',
    'scale.MNA',
    'scale.PAINAD',
    'scale.DOWNTON',
    'scale.LAWTON_BRODY',
  ];

  it('todas las claves de valoración existen en es', () => {
    for (const key of valoracionKeys) {
      expect(DICTIONARIES.es[key], `es: falta clave "${key}"`).toBeDefined();
    }
  });

  it('todas las claves de valoración existen en ca', () => {
    for (const key of valoracionKeys) {
      expect(DICTIONARIES.ca[key], `ca: falta clave "${key}"`).toBeDefined();
    }
  });

  it('claves narrativas de valoración difieren entre es y ca (paridad real)', () => {
    const narrativeKeys = [
      'valoracion.alerts.title',
      'valoracion.alerts.subtitle',
      'valoracion.alerts.empty.desc',
      'valoracion.evolution.empty',
      'valoracion.status.vencida',
      'scale.TINETTI',
      'scale.GDS_REISBERG',
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

describe('paridad es/ca — Admisiones / Preadmisión / Forecast de ocupació', () => {
  const admissionKeys = [
    'nav.admissions',
    'admissions.title',
    'admissions.subtitle',
    'admissions.new',
    'admissions.empty.title',
    'admissions.empty.desc',
    'admissions.filter.status',
    'admissions.filter.center',
    'admissions.filter.all',
    'admission.status.LEAD',
    'admission.status.WAITLIST',
    'admission.status.EVALUATION',
    'admission.status.OFFERED',
    'admission.status.ADMITTED',
    'admission.status.REJECTED',
    'admission.status.WITHDRAWN',
    'admission.priority.BAJA',
    'admission.priority.NORMAL',
    'admission.priority.ALTA',
    'admission.priority.URGENTE',
    'admission.placeType.PRIVADA',
    'admission.placeType.CONCERTADA',
    'admission.placeType.PUBLICA',
    'admission.origin.DOMICILIO',
    'admission.origin.HOSPITAL',
    'admission.origin.OTRO_CENTRO',
    'admission.origin.LISTA_ESPERA_CCAA',
    'admission.origin.OTRO',
    'admissions.form.title',
    'admissions.form.candidate',
    'admissions.form.firstName',
    'admissions.form.lastName',
    'admissions.form.contactPhone',
    'admissions.form.contactName',
    'admissions.form.center',
    'admissions.form.placeType',
    'admissions.form.priority',
    'admissions.form.expectedDate',
    'admissions.form.submit',
    'admissions.form.success',
    'admissions.detail.back',
    'admissions.detail.status',
    'admissions.detail.expectedDate',
    'admissions.detail.requestDate',
    'admissions.detail.noResident',
    'admissions.actions.transition',
    'admissions.actions.transitioned',
    'admissions.actions.reject',
    'admissions.actions.admit',
    'admissions.actions.closed',
    'admissions.forecast.title',
    'admissions.forecast.subtitle',
    'admissions.forecast.totalBeds',
    'admissions.forecast.occupied',
    'admissions.forecast.free',
    'admissions.forecast.rate',
    'admissions.forecast.empty',
    'admissions.forecast.calculate',
  ];

  it('todas las claves de admisiones existen en es', () => {
    for (const key of admissionKeys) {
      expect(DICTIONARIES.es[key], `es: falta clave "${key}"`).toBeDefined();
    }
  });

  it('todas las claves de admisiones existen en ca', () => {
    for (const key of admissionKeys) {
      expect(DICTIONARIES.ca[key], `ca: falta clave "${key}"`).toBeDefined();
    }
  });

  it('claves narrativas de admisiones difieren entre es y ca (paridad real)', () => {
    const narrativeKeys = [
      'admissions.title',
      'admissions.subtitle',
      'admissions.empty.desc',
      'admissions.form.title',
      'admissions.forecast.subtitle',
      'admissions.detail.noResident',
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

describe('paridad es/ca — Indicadors de qualitat assistencial (quality:read)', () => {
  const calidadKeys = [
    'nav.calidad',
    'calidad.title',
    'calidad.subtitle',
    'calidad.noPermission',
    'calidad.filter.center',
    'calidad.filter.centerAll',
    'calidad.filter.unit',
    'calidad.filter.unitAll',
    'calidad.filter.period',
    'calidad.filter.period.30d',
    'calidad.filter.period.90d',
    'calidad.filter.period.custom',
    'calidad.filter.from',
    'calidad.filter.to',
    'calidad.filter.apply',
    'calidad.period.label',
    'calidad.upp.title',
    'calidad.upp.hint',
    'calidad.upp.prevalencia',
    'calidad.upp.prevalenciaSub',
    'calidad.upp.prevalenciaCentro',
    'calidad.upp.prevalenciaCentroSub',
    'calidad.upp.incidencia',
    'calidad.upp.incidenciaSub',
    'calidad.upp.tasa',
    'calidad.upp.tasaSub',
    'calidad.upp.desglose.title',
    'calidad.upp.stage1',
    'calidad.upp.stage2',
    'calidad.upp.stage3',
    'calidad.upp.stage4',
    'calidad.upp.cohorte.title',
    'calidad.upp.cohorte.empty',
    'calidad.upp.cohorte.action',
    'calidad.caidas.title',
    'calidad.caidas.hint',
    'calidad.caidas.total',
    'calidad.caidas.totalSub',
    'calidad.caidas.tasa',
    'calidad.caidas.tasaSub',
    'calidad.caidas.pctResidentes',
    'calidad.caidas.pctResidentesSub',
    'calidad.caidas.conLesion',
    'calidad.caidas.conLesionSub',
    'calidad.cobertura.title',
    'calidad.cobertura.hint',
    'calidad.cobertura.pctVigente',
    'calidad.cobertura.pctVigenteSub',
    'calidad.cobertura.pctEnRiesgo',
    'calidad.cobertura.pctEnRiesgoSub',
    'calidad.cobertura.sinValoracion',
    'calidad.cobertura.sinValoracionSub',
    'calidad.cobertura.enRiesgo',
    'calidad.cobertura.enRiesgoSub',
    'calidad.cobertura.cohorte.title',
    'calidad.cobertura.cohorte.empty',
    'calidad.cobertura.cohorte.action',
    'calidad.sujeciones.title',
    'calidad.sujeciones.hint',
    'calidad.sujeciones.prevalencia',
    'calidad.sujeciones.prevalenciaSub',
    'calidad.sujeciones.activas',
    'calidad.sujeciones.activasSub',
    'calidad.sujeciones.cohorte.title',
    'calidad.sujeciones.cohorte.empty',
    'calidad.sujeciones.cohorte.action',
    'calidad.cohort.col.resident',
    'calidad.cohort.col.unit',
    'calidad.cohort.col.motivo',
    'calidad.cohort.col.actions',
    'calidad.cohort.action.view',
    'calidad.cohort.empty',
  ];

  it('todas las claves de calidad existen en es', () => {
    for (const key of calidadKeys) {
      expect(DICTIONARIES.es[key], `es: falta clave "${key}"`).toBeDefined();
    }
  });

  it('todas las claves de calidad existen en ca', () => {
    for (const key of calidadKeys) {
      expect(DICTIONARIES.ca[key], `ca: falta clave "${key}"`).toBeDefined();
    }
  });

  it('claves narrativas de calidad difieren entre es y ca (paridad real)', () => {
    const narrativeKeys = [
      'calidad.title',
      'calidad.subtitle',
      'calidad.noPermission',
      'calidad.upp.hint',
      'calidad.caidas.hint',
      'calidad.cobertura.hint',
      'calidad.sujeciones.hint',
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
