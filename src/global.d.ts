/**
 * Global type declarations
 */

// Make this a valid module
export {}

declare module '*.md' {
  const content: string
  export default content
}

declare module '*.txt' {
  const content: string
  export default content
}

declare module 'bun:bundle' {
  export function feature(name: string): boolean
}
