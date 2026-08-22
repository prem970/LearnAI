import { themeCssVariables } from './theme'

export function applyTheme(cssVariables = themeCssVariables) {
  const root = document.documentElement
  for (const [key, value] of Object.entries(cssVariables)) {
    root.style.setProperty(key, value)
  }
}

