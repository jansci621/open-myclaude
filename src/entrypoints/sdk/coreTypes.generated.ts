/**
 * Auto-generated SDK Core Types
 * 
 * This is a stub file. In production, this is generated from Zod schemas.
 * Run: bun scripts/generate-sdk-types.ts
 */

// Usage & Model Types
export interface ModelUsage {
  inputTokens: number
  outputTokens: number
  cacheReadInputTokens: number
  cacheCreationInputTokens: number
  webSearchRequests: number
  costUSD: number
  contextWindow: number
  maxOutputTokens: number
}

// Output Format Types
export type OutputFormatType = 'json_schema'

export interface BaseOutputFormat {
  type: OutputFormatType
}

export interface JsonSchemaOutputFormat {
  type: 'json_schema'
  schema: Record<string, unknown>
}

export type OutputFormat = JsonSchemaOutputFormat

// Config Types
export type ApiKeySource = 'user' | 'project' | 'org' | 'temporary' | 'oauth'

export type ConfigScope = 'local' | 'user' | 'project'

export type SdkBeta = 'context-1m-2025-08-07'

export interface ThinkingAdaptive {
  type: 'adaptive'
}

export interface ThinkingEnabled {
  type: 'enabled'
  budgetTokens?: number
}

export interface ThinkingDisabled {
  type: 'disabled'
}

export type ThinkingConfig = ThinkingAdaptive | ThinkingEnabled | ThinkingDisabled

// Add more types as needed...
