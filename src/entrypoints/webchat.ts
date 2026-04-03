/**
 * Web Chat CLI Entry Point
 *
 * This module provides the CLI entry point for the webchat command.
 */

import { parseConfig, validateConfig, printConfig, parseArgs, printHelp } from '../webchat/config.js'
import { WebChatServer } from '../webchat/server.js'

/**
 * Main entry point for the webchat command
 */
export async function webchatMain(args: string[]): Promise<void> {
  // Parse configuration from args and environment
  const partialConfig = parseArgs(args)
  const config = parseConfig(partialConfig)

  // Validate configuration
  const validationError = validateConfig(config)
  if (validationError) {
    console.error(`Configuration error: ${validationError}`)
    process.exit(1)
  }

  // Print help if requested
  if (args.includes('--help')) {
    printHelp()
    process.exit(0)
  }

  // Print configuration in verbose mode
  if (config.verbose) {
    printConfig(config)
  }

  // Create and start server
  const server = new WebChatServer(config)

  // Handle shutdown signals
  const shutdown = async () => {
    console.log('\nShutting down...')
    await server.stop()
    process.exit(0)
  }

  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)

  // Start the server
  try {
    await server.start()
    console.log('\nWeb Chat is ready!')
    console.log(`Open http://${config.host}:${config.port} in your browser.`)

    // Keep the process alive
    await new Promise(() => {})
  } catch (error) {
    console.error('Failed to start server:', error)
    process.exit(1)
  }
}
