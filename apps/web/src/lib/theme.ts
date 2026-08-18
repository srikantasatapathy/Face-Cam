import type { CSSProperties } from 'react'

/**
 * Turns a tenant's branding row into inline CSS custom properties.
 *
 * Rendered on the server into the <html> element so a branded portal paints
 * correctly on first byte. Doing this client-side would show the platform
 * colours for a frame first, which looks broken on a white-labelled portal.
 */

export interface TenantBranding {
  primaryColor?: string | null
  secondaryColor?: string | null
  accentColor?: string | null
  fontFamily?: string | null
}

/**
 * Converts `#2563eb` to `37 99 235`, the channel form Tailwind needs for its
 * `<alpha-value>` opacity modifiers. Returns null for anything unparseable so
 * a bad value in the database falls back to the default rather than emitting
 * broken CSS.
 */
export function hexToChannels(hex: string | null | undefined): string | null {
  if (!hex) return null

  let value = hex.trim().replace(/^#/, '')
  if (value.length === 3) {
    value = value
      .split('')
      .map((char) => char + char)
      .join('')
  }
  if (!/^[0-9a-fA-F]{6}$/.test(value)) return null

  const int = Number.parseInt(value, 16)
  return `${(int >> 16) & 255} ${(int >> 8) & 255} ${int & 255}`
}

export function brandingToStyle(branding: TenantBranding | null | undefined): CSSProperties {
  if (!branding) return {}

  const style: Record<string, string> = {}
  const primary = hexToChannels(branding.primaryColor)
  const secondary = hexToChannels(branding.secondaryColor)
  const accent = hexToChannels(branding.accentColor)

  if (primary) style['--brand-primary'] = primary
  if (secondary) style['--brand-secondary'] = secondary
  if (accent) style['--brand-accent'] = accent
  if (branding.fontFamily) style['--font-sans'] = branding.fontFamily

  return style as CSSProperties
}
