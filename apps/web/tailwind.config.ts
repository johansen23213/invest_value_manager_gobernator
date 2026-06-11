import type { Config } from 'tailwindcss';

// UX para auxiliares: tipografía grande y objetivos táctiles amplios.
// Rediseño 2026-06-11: acento cálido (warm) para humanizar la marca en un
// contexto de cuidado de personas; teal se mantiene como color primario
// de acción; amber/warm como acento de jerarquía y calidez.
const config: Config = {
  content: ['./src/**/*.{ts,tsx}', '../../packages/ui/src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Marca Vetlla — teal sereno (cuidado/salud/confianza).
        brand: {
          50: '#f0fdfa',
          100: '#ccfbf1',
          200: '#99f6e4',
          300: '#5eead4',
          400: '#2dd4bf',
          500: '#14b8a6',
          600: '#0d9488',
          700: '#0f766e',
          800: '#115e59',
          900: '#134e4a',
        },
        // Acento cálido — para saludos, KPIs destacados y elementos "humanos".
        // Contraste AA garantizado sobre blanco (warm-700 y superiores ≥ 4.5:1).
        warm: {
          50: '#fff8f1',
          100: '#feecdc',
          200: '#fcd9bd',
          300: '#fdba8c',
          400: '#ff8a4c',
          500: '#ff5a1f',
          600: '#d03801',
          700: '#b43403',
          800: '#8a2c0d',
          900: '#771d1d',
        },
        // Superficie — fondo general más cálido que el puro blanco.
        surface: {
          DEFAULT: '#fafaf9',   // blanco hueso (base de página)
          card: '#ffffff',
          muted: '#f5f5f4',     // fondos de cards secundarias
        },
      },
      fontSize: {
        // Base un punto mayor de lo habitual para legibilidad a pie de cama.
        base: ['1.0625rem', { lineHeight: '1.6rem' }],
      },
      minHeight: {
        touch: '44px',  // objetivo táctil mínimo (WCAG 2.5.5)
        'touch-lg': '56px', // objetivos grandes en flujo auxiliar/tablet
      },
      minWidth: {
        touch: '44px',
      },
      borderRadius: {
        '2xl': '1rem',
        '3xl': '1.25rem',
      },
      boxShadow: {
        card: '0 1px 3px 0 rgb(0 0 0 / 0.06), 0 1px 2px -1px rgb(0 0 0 / 0.04)',
        'card-hover': '0 4px 12px 0 rgb(0 0 0 / 0.08), 0 2px 4px -1px rgb(0 0 0 / 0.04)',
        'kpi': '0 2px 8px 0 rgb(15 118 110 / 0.10)',
      },
    },
  },
  plugins: [],
};

export default config;
