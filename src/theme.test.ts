import { expect, test } from 'vitest'
import { DEFAULT_THEME } from './lib/theme-config'
import { resolveTheme } from './theme'

test('a valid tenant config is used as given', () => {
  expect(resolveTheme('aurelia')).toMatchObject({ appName: 'Aurelia Field IQ', surface: '#EFF5FA', radius: 8 })
})

test('invalid and missing fields fall back one by one', () => {
  expect(resolveTheme('meridian')).toEqual({
    appName: 'Meridian 360', // valid, kept
    primary: DEFAULT_THEME.primary, // "#ZZ8800" is not a hex colour
    onPrimary: DEFAULT_THEME.onPrimary, // missing
    background: '#FFFFFF',
    surface: '#F4F4F4',
    text: DEFAULT_THEME.text, // missing
    radius: DEFAULT_THEME.radius, // "huge" is not a number
  })
})

test('an unknown tenant gets the default theme', () => {
  expect(resolveTheme('nope')).toEqual(DEFAULT_THEME)
  expect(resolveTheme('__proto__')).toEqual(DEFAULT_THEME)
})
