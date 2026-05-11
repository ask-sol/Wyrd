import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Dark surfaces — Google AI Studio dark palette
        bg: '#0F0F10',
        surface: '#131314',
        elevated: '#1E1F20',
        subtle: '#282A2C',
        hover: '#2A2C2F',

        // Borders & dividers
        border: '#3C4043',
        borderHi: '#5F6368',
        divider: '#2A2C2F',

        // Text (inverted)
        ink: '#E3E3E3',
        ink2: '#BDC1C6',
        ink3: '#9AA0A6',
        faint: '#80868B',

        // Brand — lighter blue for dark theme contrast
        brand: '#8AB4F8',
        brandStrong: '#A8C7FA',
        brandSoft: 'rgba(138,180,248,0.12)',
        brandBorder: 'rgba(138,180,248,0.4)',

        // Semantic
        success: '#81C995',
        successSoft: 'rgba(129,201,149,0.12)',
        successBorder: 'rgba(129,201,149,0.35)',
        warning: '#FDD663',
        warningSoft: 'rgba(253,214,99,0.12)',
        warningBorder: 'rgba(253,214,99,0.35)',
        danger: '#F28B82',
        dangerSoft: 'rgba(242,139,130,0.12)',
        dangerBorder: 'rgba(242,139,130,0.35)',

        // Span-kind tints
        kAgent: '#9AA0A6',
        kAgentSoft: 'rgba(154,160,166,0.12)',
        kLlm: '#8AB4F8',
        kLlmSoft: 'rgba(138,180,248,0.14)',
        kTool: '#C58AF9',
        kToolSoft: 'rgba(197,138,249,0.14)',
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'Roboto', 'system-ui', 'Arial', 'sans-serif'],
        mono: ['var(--font-mono)', 'Roboto Mono', 'ui-monospace', 'monospace'],
      },
      fontSize: {
        '2xs': ['11px', { lineHeight: '16px' }],
        xs: ['12px', { lineHeight: '16px' }],
        sm: ['13px', { lineHeight: '18px' }],
        base: ['14px', { lineHeight: '20px' }],
        lg: ['16px', { lineHeight: '24px' }],
        xl: ['18px', { lineHeight: '24px' }],
        '2xl': ['22px', { lineHeight: '28px' }],
        '3xl': ['28px', { lineHeight: '36px' }],
      },
      borderRadius: {
        none: '0',
        sm: '4px',
        DEFAULT: '6px',
        md: '8px',
        lg: '12px',
        pill: '100px',
      },
      boxShadow: {
        e1: '0 1px 2px rgba(0,0,0,0.35)',
        e2: '0 1px 2px rgba(0,0,0,0.4), 0 2px 6px rgba(0,0,0,0.25)',
        focus: '0 0 0 2px rgba(138,180,248,0.4)',
      },
    },
  },
  plugins: [],
};

export default config;
