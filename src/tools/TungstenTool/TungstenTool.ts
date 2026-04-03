/**
 * TungstenTool - Internal tool stub for development
 * 
 * This is a placeholder for the internal-only TungstenTool.
 * In production, this is only included for USER_TYPE=ant users.
 */

import { Tool } from '../../Tool.js'

export const TungstenTool: Tool<unknown, unknown> = {
  name: 'tungsten',
  description: 'Internal tool - not available in development',
  inputSchema: {
    type: 'object',
    properties: {},
  },
  run: async () => {
    throw new Error('TungstenTool is not available in development mode')
  },
}
