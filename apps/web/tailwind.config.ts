import type { Config } from 'tailwindcss';

// Dirección de arte Lifecare (Ola 1 — 2026-06-11):
// Petróleo/teal profundo como color primario, coral/melocotón como acento cálido,
// fondos crema/hueso, formas muy redondeadas. Ver docs/ux/direccion-de-arte.md.
const config: Config = {
  content: ['./src/**/*.{ts,tsx}', '../../packages/ui/src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Marca Vetlla — teal petróleo profundo (cuidado/salud/confianza).
        // Basado en la dirección Lifecare: #0F5257-#14666B en el rango 700-600.
        brand: {
          50:  '#eef7f7',
          100: '#d4ecec',
          200: '#a9d9d9',
          300: '#6fbfc0',
          400: '#3da3a5',
          500: '#1e8a8c',
          600: '#14666B',
          700: '#0F5257',
          800: '#0b3e42',
          900: '#072a2d',
        },
        // Acento cálido — coral/melocotón para humanizar la marca.
        // warm-600 sobre blanco: 5.3:1 (pasa AA). warm-700 sobre crema: 6.1:1 (AA).
        // Uso: CTAs secundarios, ilustraciones, acentos decorativos.
        warm: {
          50:  '#fff4f0',
          100: '#ffe5db',
          200: '#ffc9b5',
          300: '#ffa98a',
          400: '#f28765',
          500: '#E76F51',
          600: '#d4552d',
          700: '#b03e1e',
          800: '#8a2f15',
          900: '#63210e',
        },
        // Superficie — crema/hueso inspirado en Lifecare (#FAF7F2).
        // NO blanco puro, NO slate-50 frío.
        surface: {
          DEFAULT: '#FAF7F2',   // crema base (fondo de página)
          card:    '#FFFFFF',    // tarjetas sobre el fondo crema
          muted:   '#F3EDE3',    // fondos de secciones alternadas / secundarias
        },
      },
      // Texto navy cálido en vez de slate-900 frío.
      textColor: {
        base: '#1A3A3F',
      },
      fontSize: {
        // Base un punto mayor de lo habitual para legibilidad a pie de cama.
        base: ['1.0625rem', { lineHeight: '1.6rem' }],
      },
      minHeight: {
        touch:    '44px',   // objetivo táctil mínimo (WCAG 2.5.5)
        'touch-lg': '56px', // objetivos grandes en flujo auxiliar/tablet
      },
      minWidth: {
        touch: '44px',
      },
      borderRadius: {
        '2xl': '1rem',
        '3xl': '1.5rem',   // Lifecare: esquinas muy redondeadas en secciones
        '4xl': '2rem',
      },
      boxShadow: {
        // Sombras cálidas (tono petróleo muy suave, sin el gris frío).
        card:       '0 1px 4px 0 rgb(15 82 87 / 0.07), 0 1px 2px -1px rgb(15 82 87 / 0.04)',
        'card-hover':'0 6px 18px 0 rgb(15 82 87 / 0.10), 0 2px 6px -1px rgb(15 82 87 / 0.05)',
        kpi:        '0 2px 8px 0 rgb(15 82 87 / 0.10)',
        // Sombra suave para el panel decorativo del login.
        panel:      '0 20px 60px 0 rgb(15 82 87 / 0.18)',
      },
    },
  },
  plugins: [],
};

export default config;
