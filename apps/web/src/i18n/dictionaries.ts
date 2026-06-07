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
