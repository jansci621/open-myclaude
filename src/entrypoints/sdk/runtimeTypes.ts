/**
 * Auto-generated SDK Runtime Types
 * 
 * This is a stub file. In production, this is generated from Zod schemas.
 */

// Runtime types for SDK
export type RuntimeConfig = {
  model?: string
  maxTokens?: number
  temperature?: number
}

export type RuntimeState = {
  status: 'idle' | 'running' | 'completed' | 'error'
  startTime?: number
  endTime?: number
}
