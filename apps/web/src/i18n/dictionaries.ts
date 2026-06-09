import type { Locale } from './config';

// Catálogos de traducción. Claves planas con espacio de nombres por punto.
// es-ES y ca-ES cubren los flujos de entrada (login), la shell y el portal de
// familias (flujo destacado para accesibilidad e i18n del MVP).
const es: Record<string, string> = {
  'app.name': 'Vetlla',
  'action.logout': 'Salir',
  'action.login': 'Entrar',
  'state.online': 'En línea',
  'state.offline': 'Sin conexión',
  'state.pendingSync': '{count} por sincronizar',

  'nav.home': 'Inicio',
  'nav.centers': 'Centros',
  'nav.residents': 'Residentes',
  'nav.care': 'Atención',
  'nav.portal': 'Portal',

  'login.subtitle': 'Gestión sociosanitaria. Inicia sesión.',
  'login.email': 'Email',
  'login.password': 'Contraseña',
  'login.submit': 'Entrar',
  'login.loading': 'Entrando…',
  'login.error': 'Credenciales incorrectas.',
  'login.invalid': 'Introduce un email y una contraseña válidos.',

  'role.SUPERADMIN': 'Superadmin de plataforma',
  'role.DIRECTOR': 'Dirección / gestor',
  'role.SANITARIO': 'Sanitario',
  'role.AUXILIAR': 'Auxiliar',
  'role.FAMILIAR': 'Familiar',

  'portal.title': 'Portal de familias',
  'portal.noResident': 'No hay ningún residente vinculado a tu cuenta.',
  'portal.center': 'Centro',
  'portal.bed': 'Plaza',
  'portal.status': 'Estado',
  'portal.relationship': 'Parentesco',
  'portal.novedades': 'Novedades',
  'portal.noNovedades': 'Sin novedades recientes.',
  'portal.medication': 'Medicación actual',
  'portal.noMedication': 'Sin medicación activa.',
  'portal.allergies': 'Alergias',
  'portal.noAllergies': 'Sin alergias registradas.',
  'portal.assessments': 'Valoraciones recientes',
  'portal.noAssessments': 'Sin valoraciones.',

  'skip.toContent': 'Saltar al contenido',

  // Medicación — MAR (M-01, M-02, M-03)
  'med.allergies.none': 'Sin alergias registradas',
  'med.allergies.label': 'Alergias',
  'med.status.PENDIENTE': 'Pendiente',
  'med.status.RETRASADA': 'Retrasada',
  'med.status.ADMINISTRADO': 'Administrada',
  'med.status.NO_ADMINISTRADO': 'No administrada',
  'med.status.RECHAZADO': 'Rechazada',
  'med.status.PENDIENTE_SYNC': 'Pendiente sync',
  'med.today': 'Pauta de hoy (MAR)',
  'med.noDoses': 'Sin dosis pautadas para hoy.',
  'med.prescriptions': 'Prescripciones',
  'med.noPrescriptions': 'Sin prescripciones.',
  'med.prescribe': 'Prescribir medicación',
  'med.actions.administer': 'Administrar',
  'med.actions.rejected': 'Rechazada',
  'med.actions.notAdministered': 'No administrada',

  // RBAC — tarjetas de rol (R-02)
  'rbac.roles.title': 'Roles del equipo',
  'rbac.roles.subtitle': 'Permisos efectivos por cada rol del sistema.',
  'rbac.card.can': 'PUEDE',
  'rbac.card.cannot': 'NO PUEDE',
  'rbac.perm.tenant:read': 'Ver la información general del centro',
  'rbac.perm.tenant:manage': 'Gestionar la configuración del tenant',
  'rbac.perm.users:read': 'Ver el listado de usuarios del centro',
  'rbac.perm.users:write': 'Crear, editar y desactivar usuarios',
  'rbac.perm.centers:read': 'Ver centros, unidades y plazas',
  'rbac.perm.centers:write': 'Crear y modificar centros, unidades y plazas',
  'rbac.perm.residents:read': 'Ver el expediente del residente',
  'rbac.perm.residents:write': 'Modificar el expediente del residente',
  'rbac.perm.clinical:write': 'Registrar diagnósticos, alergias y valoraciones',
  'rbac.perm.care:read': 'Ver registros de atención directa',
  'rbac.perm.care:write': 'Registrar atención directa (constantes, ABVD, incidencias)',
  'rbac.perm.medication:read': 'Ver la pauta de medicación del residente',
  'rbac.perm.medication:prescribe': 'Prescribir o modificar medicación',
  'rbac.perm.medication:administer': 'Administrar medicación (pase de medicación, MAR)',
  'rbac.perm.careplan:read': 'Ver el Plan Individualizado de Atención (PIA)',
  'rbac.perm.careplan:write': 'Crear y modificar el PIA',
  'rbac.perm.portal:read': 'Acceder al portal de familias (residente vinculado)',
  'rbac.perm.audit:read': 'Ver el registro de actividad (auditoría RGPD)',
};

const ca: Record<string, string> = {
  'app.name': 'Vetlla',
  'action.logout': 'Surt',
  'action.login': 'Entra',
  'state.online': 'En línia',
  'state.offline': 'Sense connexió',
  'state.pendingSync': '{count} per sincronitzar',

  'nav.home': 'Inici',
  'nav.centers': 'Centres',
  'nav.residents': 'Residents',
  'nav.care': 'Atenció',
  'nav.portal': 'Portal',

  'login.subtitle': 'Gestió sociosanitària. Inicia la sessió.',
  'login.email': 'Correu electrònic',
  'login.password': 'Contrasenya',
  'login.submit': 'Entra',
  'login.loading': 'Entrant…',
  'login.error': 'Credencials incorrectes.',
  'login.invalid': "Introdueix un correu i una contrasenya vàlids.",

  'role.SUPERADMIN': 'Superadmin de plataforma',
  'role.DIRECTOR': 'Direcció / gestor',
  'role.SANITARIO': 'Sanitari',
  'role.AUXILIAR': 'Auxiliar',
  'role.FAMILIAR': 'Familiar',

  'portal.title': 'Portal de famílies',
  'portal.noResident': 'No hi ha cap resident vinculat al teu compte.',
  'portal.center': 'Centre',
  'portal.bed': 'Plaça',
  'portal.status': 'Estat',
  'portal.relationship': 'Parentiu',
  'portal.novedades': 'Novetats',
  'portal.noNovedades': 'Sense novetats recents.',
  'portal.medication': 'Medicació actual',
  'portal.noMedication': 'Sense medicació activa.',
  'portal.allergies': 'Al·lèrgies',
  'portal.noAllergies': "Sense al·lèrgies registrades.",
  'portal.assessments': 'Valoracions recents',
  'portal.noAssessments': 'Sense valoracions.',

  'skip.toContent': 'Salta al contingut',

  // Medicació — MAR (M-01, M-02, M-03)
  'med.allergies.none': 'Sense al·lèrgies registrades',
  'med.allergies.label': "Al·lèrgies",
  'med.status.PENDIENTE': 'Pendent',
  'med.status.RETRASADA': 'Retardada',
  'med.status.ADMINISTRADO': 'Administrada',
  'med.status.NO_ADMINISTRADO': 'No administrada',
  'med.status.RECHAZADO': 'Rebutjada',
  'med.status.PENDIENTE_SYNC': 'Pendent de sincronitzar',
  'med.today': "Pauta d'avui (MAR)",
  'med.noDoses': "Sense dosis pautades per avui.",
  'med.prescriptions': 'Prescripcions',
  'med.noPrescriptions': 'Sense prescripcions.',
  'med.prescribe': 'Prescriure medicació',
  'med.actions.administer': 'Administrar',
  'med.actions.rejected': 'Rebutjada',
  'med.actions.notAdministered': 'No administrada',

  // RBAC — targetes de rol (R-02)
  'rbac.roles.title': "Rols de l'equip",
  'rbac.roles.subtitle': 'Permisos efectius per cada rol del sistema.',
  'rbac.card.can': 'POT',
  'rbac.card.cannot': 'NO POT',
  'rbac.perm.tenant:read': 'Veure la informació general del centre',
  'rbac.perm.tenant:manage': 'Gestionar la configuració del tenant',
  'rbac.perm.users:read': "Veure el llistat d'usuaris del centre",
  'rbac.perm.users:write': 'Crear, editar i desactivar usuaris',
  'rbac.perm.centers:read': 'Veure centres, unitats i places',
  'rbac.perm.centers:write': 'Crear i modificar centres, unitats i places',
  'rbac.perm.residents:read': "Veure l'expedient del resident",
  'rbac.perm.residents:write': "Modificar l'expedient del resident",
  'rbac.perm.clinical:write': 'Registrar diagnòstics, al·lèrgies i valoracions',
  'rbac.perm.care:read': "Veure registres d'atenció directa",
  "rbac.perm.care:write": "Registrar atenció directa (constants, ABVD, incidències)",
  'rbac.perm.medication:read': 'Veure la pauta de medicació del resident',
  'rbac.perm.medication:prescribe': 'Prescriure o modificar medicació',
  'rbac.perm.medication:administer': 'Administrar medicació (passe de medicació, MAR)',
  'rbac.perm.careplan:read': "Veure el Pla Individualitzat d'Atenció (PIA)",
  'rbac.perm.careplan:write': 'Crear i modificar el PIA',
  'rbac.perm.portal:read': 'Accedir al portal de famílies (resident vinculat)',
  'rbac.perm.audit:read': "Veure el registre d'activitat (auditoria RGPD)",
};

export const DICTIONARIES: Record<Locale, Record<string, string>> = { es, ca };

/** Traduce una clave en el idioma dado, con interpolación simple de {variables}. */
export function translate(
  locale: Locale,
  key: string,
  vars?: Record<string, string | number>,
): string {
  const dict = DICTIONARIES[locale];
  let value = dict[key] ?? DICTIONARIES.es[key] ?? key;
  if (vars) {
    for (const [name, val] of Object.entries(vars)) {
      value = value.replace(`{${name}}`, String(val));
    }
  }
  return value;
}
