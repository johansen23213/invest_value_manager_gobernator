import type { Config } from 'tailwindcss';

// UX para auxiliares: tipografía grande y objetivos táctiles amplios.
// Estos valores base se refinan en H3 (flujo tablet) y H6 (accesibilidad).
const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
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
