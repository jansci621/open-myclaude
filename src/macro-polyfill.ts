/**
 * MACRO polyfill for runtime use
 *
 * Bun's MACRO.VERSION is only available when the code is bundled.
 * This polyfill provides a runtime fallback using the package.json version.
 */

// @ts-ignore - MACRO is normally provided by Bun at build time
globalThis.MACRO = globalThis.MACRO || {
  VERSION: '2.1.88.1'
}

// Export for module usage
export const MACRO = globalThis.MACRO
