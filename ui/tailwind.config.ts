import type { Config } from 'tailwindcss';

const cv = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;
const cvOpaque = (name: string) => `rgb(var(--${name}))`;

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  darkMode: ['class', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        // Surfaces
        bg: cv('bg'),
        surface: cv('surface'),
        elevated: cv('elevated'),
        subtle: cv('subtle'),
        hover: cv('hover'),

        // Borders & dividers
        border: cv('border'),
        borderHi: cv('border-hi'),
        divider: cv('divider'),

        // Text
        ink: cv('ink'),
        ink2: cv('ink-2'),
        ink3: cv('ink-3'),
        faint: cv('faint'),

        // Brand
        brand: cv('brand'),
        brandStrong: cv('brand-strong'),
        brandSoft: cvOpaque('brand-soft'),
        brandBorder: cvOpaque('brand-border'),

        // Semantic
        success: cv('success'),
        successSoft: cvOpaque('success-soft'),
        successBorder: cvOpaque('success-border'),
        warning: cv('warning'),
        warningSoft: cvOpaque('warning-soft'),
        warningBorder: cvOpaque('warning-border'),
        danger: cv('danger'),
        dangerSoft: cvOpaque('danger-soft'),
        dangerBorder: cvOpaque('danger-border'),

        // Span-kind tints
        kAgent: cv('k-agent'),
        kAgentSoft: cvOpaque('k-agent-soft'),
        kLlm: cv('k-llm'),
        kLlmSoft: cvOpaque('k-llm-soft'),
        kTool: cv('k-tool'),
        kToolSoft: cvOpaque('k-tool-soft'),
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'Google Sans', 'Google Sans Text', 'Roboto', 'system-ui', 'Arial', 'sans-serif'],
        mono: ['var(--font-mono)', 'Roboto Mono', 'Google Sans Mono', 'ui-monospace', 'monospace'],
      },
      fontSize: {
        // Cloud Console-style dense scale: body locked at 14px.
        '2xs': ['11px', { lineHeight: '16px' }],
        xs: ['12px', { lineHeight: '16px' }],
        sm: ['13px', { lineHeight: '18px' }],
        base: ['14px', { lineHeight: '20px' }],
        lg: ['16px', { lineHeight: '24px' }],
        xl: ['18px', { lineHeight: '24px', letterSpacing: '0' }],
        '2xl': ['22px', { lineHeight: '28px' }],
        '3xl': ['24px', { lineHeight: '32px', fontWeight: '400' }], // GCC page titles: 24/400
      },
      borderRadius: {
        none: '0',
        sm: '4px', // GCC inputs
        DEFAULT: '6px',
        md: '8px', // GCC cards
        lg: '12px',
        pill: '100px',
      },
      boxShadow: {
        e1: '0 1px 2px var(--shadow-1)',
        e2: '0 1px 2px var(--shadow-1), 0 2px 6px var(--shadow-2)',
        e3: '0 4px 8px 3px var(--shadow-1), 0 1px 3px var(--shadow-2)',
        focus: '0 0 0 2px rgb(var(--brand) / 0.4)',
      },
    },
  },
  plugins: [],
};

export default config;
