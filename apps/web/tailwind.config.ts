import type { Config } from 'tailwindcss';

// UX para auxiliares: tipografía grande y objetivos táctiles amplios.
// Estos valores base se refinan en H3 (flujo tablet) y H6 (accesibilidad).
const config: Config = {
  content: ['./src/**/*.{ts,tsx}', '../../packages/ui/src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Marca Vetlla — teal sereno (cuidado/salud/confianza).
        // El verde puro se reserva para estados (activo/en línea).
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
      },
      fontSize: {
        // Base un punto mayor de lo habitual para legibilidad a pie de cama.
        base: ['1.0625rem', { lineHeight: '1.6rem' }],
      },
      minHeight: {
        touch: '44px', // objetivo táctil mínimo (WCAG 2.5.5)
      },
      minWidth: {
        touch: '44px',
      },
    },
  },
  plugins: [],
};

export default config;
