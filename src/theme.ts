import type { CSSProperties } from 'react'
import { DEFAULT_THEME, TENANT_THEMES, type TenantTheme } from './lib/theme-config'

const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i
const COLORS = ['primary', 'onPrimary', 'background', 'surface', 'text'] as const

// Tenant configs are untrusted: every field is checked on its own and falls
// back to DEFAULT_THEME, so one bad value never breaks the rest of the theme.
export function resolveTheme(tenant: string): TenantTheme {
  const config: Record<string, unknown> = Object.hasOwn(TENANT_THEMES, tenant) ? TENANT_THEMES[tenant] : {}
  const theme = { ...DEFAULT_THEME }

  for (const key of COLORS) {
    const value = config[key]
    if (typeof value === 'string' && HEX.test(value)) theme[key] = value
  }
  const { appName, radius } = config
  if (typeof appName === 'string' && appName.trim()) theme.appName = appName
  if (typeof radius === 'number' && radius >= 0 && radius <= 24) theme.radius = radius
  return theme
}

// The theme as CSS variables; index.css reads these.
export function themeStyle(theme: TenantTheme): CSSProperties {
  return {
    '--primary': theme.primary,
    '--on-primary': theme.onPrimary,
    '--background': theme.background,
    '--surface': theme.surface,
    '--text': theme.text,
    '--radius': `${theme.radius}px`,
  } as CSSProperties
}
