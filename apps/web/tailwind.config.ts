import type { Config } from 'tailwindcss';

// Dirección de arte Lifecare v2 (Ola 1 Fundación Visual — 2026-06-13):
// v1 establece paleta teal/coral/crema y radios orgánicos.
// v2 añade: fuente display DM Serif Display, rampa delight (éxito/salvia),
// sombras con más profundidad, motion con propósito y el sello Vetlla.
// Ver docs/ux/direccion-de-arte-v2.md.
const config: Config = {
  content: ['./src/**/*.{ts,tsx}', '../../packages/ui/src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      // ── Fuentes ────────────────────────────────────────────────────────────
      fontFamily: {
        // DM Serif Display — fuente editorial/display de personalidad.
        // Self-hosted via @fontsource/dm-serif-display (importada en globals.css).
        // RGPD: no hay llamadas a Google Fonts en runtime. Solo para titulares H1/H2.
        // DON'T: nunca en texto < text-xl, etiquetas de formulario ni texto clínico.
        display: ['"DM Serif Display"', 'Georgia', 'serif'],
        // Cuerpo: stack de sistema — legibilidad máxima, cero carga, offline-safe.
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },

      // ── Escala tipográfica display ─────────────────────────────────────────
      fontSize: {
        // Base un punto mayor de lo habitual para legibilidad a pie de cama.
        base: ['1.0625rem', { lineHeight: '1.6rem' }],
        // Escala display — solo con font-display (DM Serif Display).
        'display-lg':  ['2rem',    { lineHeight: '1.2', letterSpacing: '-0.01em' }],
        'display-xl':  ['2.5rem',  { lineHeight: '1.15', letterSpacing: '-0.015em' }],
        'display-2xl': ['3.5rem',  { lineHeight: '1.1', letterSpacing: '-0.02em' }],
      },

      // ── Colores ────────────────────────────────────────────────────────────
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
        // Uso: CTAs secundarios, ilustraciones, acentos decorativos, alertas MAR.
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
        // Éxito/deleite — verde salvia cálido para momentos de éxito y bienestar.
        // No usar green-* de Tailwind (demasiado frío). delight-700 sobre blanco: 8.1:1 AAA.
        // Uso: panel "sin alertas", EmptyState check, estados de completitud.
        delight: {
          50:  '#f0faf4',
          100: '#d6f2e0',
          200: '#a8e4bc',
          500: '#22a05a',
          700: '#166534',
        },
        // Superficie — crema/hueso inspirado en Lifecare (#FAF7F2).
        // NO blanco puro, NO slate-50 frío.
        surface: {
          DEFAULT: '#FAF7F2',   // crema base (fondo de página)
          card:    '#FFFFFF',    // tarjetas sobre el fondo crema
          muted:   '#F3EDE3',    // fondos de secciones alternadas / secundarias
        },
      },

      // ── Texto ──────────────────────────────────────────────────────────────
      // Navy cálido en vez de slate-900 frío.
      textColor: {
        base: '#1A3A3F',
      },

      // ── Objetivos táctiles ─────────────────────────────────────────────────
      minHeight: {
        touch:      '44px',   // objetivo táctil mínimo (WCAG 2.5.5)
        'touch-lg': '56px',   // objetivos grandes en flujo auxiliar/tablet
      },
      minWidth: {
        touch: '44px',
      },

      // ── Radios ─────────────────────────────────────────────────────────────
      // Regla Lifecare: cuanto más grande el elemento, más redondeado.
      borderRadius: {
        '2xl': '1rem',
        '3xl': '1.5rem',
        '4xl': '2rem',
      },

      // ── Sombras ────────────────────────────────────────────────────────────
      // Todas en tono teal petróleo (rgb 15 82 87) — coherencia cromática.
      // Nunca rgba(0,0,0,x) en tarjetas ni elementos primarios.
      boxShadow: {
        // Tarjeta en reposo (sutil)
        card:        '0 1px 4px 0 rgb(15 82 87 / 0.07), 0 1px 2px -1px rgb(15 82 87 / 0.04)',
        // Tarjeta en hover (elevada — v2: más profunda que v1)
        'card-hover':'0 8px 24px 0 rgb(15 82 87 / 0.12), 0 2px 8px -1px rgb(15 82 87 / 0.06)',
        // KPI / StatCard — más prominente que card normal
        kpi:         '0 4px 12px 0 rgb(15 82 87 / 0.12), 0 1px 4px 0 rgb(15 82 87 / 0.06)',
        // Panel decorativo auth (sombra cálida envolvente)
        panel:       '0 20px 60px 0 rgb(15 82 87 / 0.18)',
        // Diálogos modales (profundidad máxima)
        dialog:      '0 24px 64px 0 rgb(15 82 87 / 0.20), 0 8px 24px -4px rgb(15 82 87 / 0.10)',
        // Glow de foco para inputs y botones (en CSS, como ring complementario)
        'glow-brand':'0 0 0 3px rgb(20 102 107 / 0.25)',
      },

      // ── Animaciones ────────────────────────────────────────────────────────
      // Todas las @keyframes están en globals.css con guard prefers-reduced-motion.
      // Aquí solo se registran los nombres para que Tailwind genere las clases.
      keyframes: {
        fadeInUp: {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to:   { opacity: '1', transform: 'translateY(0)' },
        },
        fadeIn: {
          from: { opacity: '0' },
          to:   { opacity: '1' },
        },
        scaleIn: {
          from: { opacity: '0', transform: 'scale(0.95)' },
          to:   { opacity: '1', transform: 'scale(1)' },
        },
      },
      animation: {
        'fade-in-up': 'fadeInUp 0.25s ease-out both',
        'fade-in':    'fadeIn 0.2s ease-out both',
        'scale-in':   'scaleIn 0.18s cubic-bezier(0.34,1.56,0.64,1) both',
        // Delays escalonados para grids y listas (stagger pattern)
        'stagger-1':  'fadeInUp 0.25s ease-out 50ms both',
        'stagger-2':  'fadeInUp 0.25s ease-out 100ms both',
        'stagger-3':  'fadeInUp 0.25s ease-out 150ms both',
        'stagger-4':  'fadeInUp 0.25s ease-out 200ms both',
      },
    },
  },
  plugins: [],
};

export default config;
