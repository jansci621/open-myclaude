/**
 * Auto-generated SDK Tool Types
 * 
 * This is a stub file. In production, this is generated from Zod schemas.
 */

export interface ToolDefinition {
  name: string
  description: string
  inputSchema: Record<string, unknown>
}

export interface ToolResult {
  output: unknown
  isError?: boolean
}
