/**
 * Security boundary checking for unattended mode.
 *
 * Validates tool executions against configured security boundaries
 * including allowed/denied tools, bash patterns, and directory restrictions.
 */

import { resolve, relative, isAbsolute } from 'path'
import { homedir } from 'os'
import picomatch from 'picomatch'
import {
  type UnattendedModeBoundaries,
  type UnattendedPermissionCheck,
  DEFAULT_PROTECTED_PATHS,
} from '../../types/unattended.js'
import { getCwd } from '../cwd.js'

// ============================================================================
// Protected Paths
// ============================================================================

/**
 * System paths that are always protected.
 */
const ALWAYS_PROTECTED_PATHS = [
  '/etc/passwd',
  '/etc/shadow',
  '/etc/sudoers',
  '/etc/ssh',
  '/root/.ssh',
  '/var/log',
]

/**
 * Expands a path for comparison.
 */
function expandPath(path: string): string {
  if (path.startsWith('~')) {
    return resolve(homedir(), path.slice(1))
  }
  return resolve(path)
}

/**
 * Normalizes a path for comparison.
 */
function normalizePath(path: string): string {
  return expandPath(path).toLowerCase()
}

/**
 * Helper to match a string against a glob pattern.
 */
function matchPattern(value: string, pattern: string): boolean {
  return picomatch.isMatch(value, pattern)
}

// ============================================================================
// Boundary Checker
// ============================================================================

/**
 * Checks security boundaries for unattended mode execution.
 */
export class BoundaryChecker {
  private readonly boundaries: UnattendedModeBoundaries
  private readonly expandedAllowedDirs: Set<string>
  private readonly expandedProtectedPaths: Set<string>

  constructor(boundaries: UnattendedModeBoundaries) {
    this.boundaries = boundaries

    // Pre-expand paths for faster checking
    this.expandedAllowedDirs = new Set(
      boundaries.allowedDirectories.map(normalizePath),
    )
    this.expandedProtectedPaths = new Set([
      ...ALWAYS_PROTECTED_PATHS.map(normalizePath),
      ...DEFAULT_PROTECTED_PATHS.map(normalizePath),
      ...boundaries.protectedPaths.map(normalizePath),
    ])
  }

  /**
   * Checks if a tool is in the denied list.
   */
  isDenied(toolName: string): boolean {
    return this.boundaries.deniedTools.some(denied => {
      // Exact match
      if (denied === toolName) return true

      // Prefix match (e.g., "Bash(rm:*)" matches "Bash")
      if (denied.includes('(') && denied.startsWith(toolName + '(')) return true

      // Wildcard match
      if (denied.includes('*')) {
        return matchPattern(toolName, denied)
      }

      return false
    })
  }

  /**
   * Checks if a tool is in the allowed list.
   * Returns true if the list is empty (allow-all) or the tool is explicitly allowed.
   */
  isAllowed(toolName: string): boolean {
    // If no allowed tools defined, default to deny
    if (this.boundaries.allowedTools.length === 0) {
      return false
    }

    return this.boundaries.allowedTools.some(allowed => {
      // Exact match
      if (allowed === toolName) return true

      // Prefix match (e.g., "Bash(git:*)" allows Bash with git commands)
      if (allowed.includes('(') && allowed.startsWith(toolName.split('(')[0] + '(')) {
        // Extract the pattern from the allowed tool spec
        const pattern = allowed.slice(allowed.indexOf('(') + 1, -1)
        const input = toolName.includes('(')
          ? toolName.slice(toolName.indexOf('(') + 1, -1)
          : ''

        if (pattern === '*') return true
        if (pattern.endsWith(':*') && input.startsWith(pattern.slice(0, -1))) return true

        return matchPattern(input, pattern)
      }

      // Wildcard match
      if (allowed.includes('*')) {
        return matchPattern(toolName, allowed)
      }

      return false
    })
  }

  /**
   * Checks if a Bash command is allowed based on patterns.
   */
  isBashCommandAllowed(command: string): UnattendedPermissionCheck {
    // First check denied tools for specific Bash patterns
    for (const denied of this.boundaries.deniedTools) {
      if (denied.startsWith('Bash(')) {
        const pattern = denied.slice(5, -1)
        if (this.matchesBashPattern(command, pattern)) {
          return { allowed: false, reason: `Command matches denied pattern: ${pattern}` }
        }
      }
    }

    // Check allowed patterns
    if (this.boundaries.allowedBashPatterns.length > 0) {
      const isAllowed = this.boundaries.allowedBashPatterns.some(pattern =>
        this.matchesBashPattern(command, pattern),
      )

      if (!isAllowed) {
        return { allowed: false, reason: 'Command does not match any allowed Bash pattern' }
      }
    }

    // Check for allowed tools with Bash patterns
    const bashAllowedTools = this.boundaries.allowedTools.filter(t => t.startsWith('Bash('))
    if (bashAllowedTools.length > 0) {
      const isAllowed = bashAllowedTools.some(allowed => {
        const pattern = allowed.slice(5, -1)
        return this.matchesBashPattern(command, pattern)
      })

      if (!isAllowed) {
        return { allowed: false, reason: 'Command does not match any allowed Bash tool pattern' }
      }
    }

    return { allowed: true }
  }

  /**
   * Checks if a command matches a pattern.
   */
  private matchesBashPattern(command: string, pattern: string): boolean {
    // Handle prefix patterns (e.g., "git:*")
    if (pattern.endsWith(':*')) {
      const prefix = pattern.slice(0, -2)
      return command.startsWith(prefix)
    }

    // Handle wildcard patterns
    if (pattern.includes('*')) {
      return matchPattern(command, pattern)
    }

    // Handle exact command match
    if (command === pattern) return true

    // Handle command prefix (e.g., "git" matches "git status")
    if (command.startsWith(pattern + ' ') || command === pattern) {
      return true
    }

    return false
  }

  /**
   * Checks if a file path is within allowed directories.
   */
  isPathAllowed(filePath: string): UnattendedPermissionCheck {
    const normalizedPath = normalizePath(filePath)

    // Check protected paths first
    for (const protectedPath of this.expandedProtectedPaths) {
      if (normalizedPath.startsWith(protectedPath) || protectedPath.startsWith(normalizedPath)) {
        return { allowed: false, reason: `Path is protected: ${filePath}` }
      }
    }

    // If no allowed directories defined, allow within cwd
    if (this.expandedAllowedDirs.size === 0) {
      const cwd = normalizePath(getCwd())
      if (!normalizedPath.startsWith(cwd)) {
        return { allowed: false, reason: `Path outside working directory: ${filePath}` }
      }
      return { allowed: true }
    }

    // Check against allowed directories
    for (const allowedDir of this.expandedAllowedDirs) {
      if (normalizedPath.startsWith(allowedDir)) {
        return { allowed: true }
      }
    }

    return { allowed: false, reason: `Path not in allowed directories: ${filePath}` }
  }

  /**
   * Checks if a write operation to a path is allowed.
   */
  isWriteAllowed(filePath: string): UnattendedPermissionCheck {
    // First check path is allowed
    const pathCheck = this.isPathAllowed(filePath)
    if (!pathCheck.allowed) {
      return pathCheck
    }

    // Additional checks for write operations
    const normalizedPath = normalizePath(filePath)

    // Never allow writing to .git directory
    if (normalizedPath.includes('/.git/') || normalizedPath.endsWith('/.git')) {
      return { allowed: false, reason: 'Writing to .git directory is not allowed' }
    }

    // Never allow writing to .env files
    if (normalizedPath.endsWith('/.env') || normalizedPath.includes('/.env.')) {
      return { allowed: false, reason: 'Writing to .env files is not allowed' }
    }

    return { allowed: true }
  }

  /**
   * Checks if network access to a host is allowed.
   */
  isNetworkAllowed(host: string): UnattendedPermissionCheck {
    switch (this.boundaries.networkAccess) {
      case 'all':
        return { allowed: true }

      case 'none':
        return { allowed: false, reason: 'Network access is disabled' }

      case 'whitelist':
        const isAllowed = this.boundaries.allowedHosts.some(allowedHost => {
          // Exact match
          if (host === allowedHost) return true

          // Wildcard match (e.g., "*.example.com")
          if (allowedHost.startsWith('*.')) {
            const domain = allowedHost.slice(2)
            return host === domain || host.endsWith('.' + domain)
          }

          return false
        })

        if (!isAllowed) {
          return { allowed: false, reason: `Host not in whitelist: ${host}` }
        }
        return { allowed: true }

      default:
        return { allowed: false, reason: 'Unknown network access mode' }
    }
  }

  /**
   * Gets the boundaries configuration.
   */
  getBoundaries(): Readonly<UnattendedModeBoundaries> {
    return this.boundaries
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Creates a boundary checker from configuration.
 */
export function createBoundaryChecker(boundaries: UnattendedModeBoundaries): BoundaryChecker {
  return new BoundaryChecker(boundaries)
}

export type { UnattendedModeBoundaries, UnattendedPermissionCheck }
