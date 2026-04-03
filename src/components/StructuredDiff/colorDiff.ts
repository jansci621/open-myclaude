// Optional import for native module
type SyntaxTheme = any

let ColorDiff: any = null
let ColorFile: any = null
let nativeGetSyntaxTheme: any = null

try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const colorDiff = require('color-diff-napi')
  ColorDiff = colorDiff.ColorDiff
  ColorFile = colorDiff.ColorFile
  nativeGetSyntaxTheme = colorDiff.getSyntaxTheme
} catch {
  // Package not available or not built - syntax highlighting disabled
}

import { isEnvDefinedFalsy } from '../../utils/envUtils.js'

export type ColorModuleUnavailableReason = 'env'

/**
 * Returns a static reason why the color-diff module is unavailable, or null if available.
 * 'env' = disabled via CLAUDE_CODE_SYNTAX_HIGHLIGHT
 *
 * The TS port of color-diff works in all build modes, so the only way to
 * disable it is via the env var.
 */
export function getColorModuleUnavailableReason(): ColorModuleUnavailableReason | null {
  if (isEnvDefinedFalsy(process.env.CLAUDE_CODE_SYNTAX_HIGHLIGHT)) {
    return 'env'
  }
  return null
}

export function expectColorDiff(): typeof ColorDiff | null {
  return getColorModuleUnavailableReason() === null ? ColorDiff : null
}

export function expectColorFile(): typeof ColorFile | null {
  return getColorModuleUnavailableReason() === null ? ColorFile : null
}

export function getSyntaxTheme(themeName: string): SyntaxTheme | null {
  return getColorModuleUnavailableReason() === null
    ? nativeGetSyntaxTheme(themeName)
    : null
}
