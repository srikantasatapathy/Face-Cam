import type { Config } from 'tailwindcss'

/**
 * Every colour resolves to a CSS custom property rather than a literal.
 *
 * This is what makes paid white-labelling a database change instead of a
 * redeploy: the tenant's branding row is rendered into `:root` by the server
 * layout, and every Tailwind class picks it up. Components must never hardcode
 * a hex value. See PROJECT_DESCRIPTION.md section 11.
 *
 * Channel syntax (`37 99 235` rather than `#2563eb`) is required so Tailwind's
 * opacity modifiers like `bg-brand/50` keep working.
 */
const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: 'rgb(var(--brand-primary) / <alpha-value>)',
          primary: 'rgb(var(--brand-primary) / <alpha-value>)',
          secondary: 'rgb(var(--brand-secondary) / <alpha-value>)',
          accent: 'rgb(var(--brand-accent) / <alpha-value>)',
        },
        surface: {
          DEFAULT: 'rgb(var(--surface) / <alpha-value>)',
          raised: 'rgb(var(--surface-raised) / <alpha-value>)',
          sunken: 'rgb(var(--surface-sunken) / <alpha-value>)',
        },
        content: {
          DEFAULT: 'rgb(var(--content) / <alpha-value>)',
          muted: 'rgb(var(--content-muted) / <alpha-value>)',
          inverted: 'rgb(var(--content-inverted) / <alpha-value>)',
        },
        line: 'rgb(var(--line) / <alpha-value>)',
        success: 'rgb(var(--success) / <alpha-value>)',
        warning: 'rgb(var(--warning) / <alpha-value>)',
        danger: 'rgb(var(--danger) / <alpha-value>)',
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        card: 'var(--radius-card)',
        control: 'var(--radius-control)',
      },
    },
  },
  plugins: [],
}

export default config
