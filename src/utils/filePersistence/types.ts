/**
 * Shared types and constants for file persistence modules
 */

/** Timestamp when a turn started (used for file mtime comparison) */
export type TurnStartTime = number

/** A file that was successfully persisted */
export interface PersistedFile {
  /** Local path relative to outputs directory */
  localPath: string
  /** File ID returned by Files API */
  fileId: string
  /** Size in bytes */
  size: number
}

/** A file that failed to persist */
export interface FailedPersistence {
  /** Local path relative to outputs directory */
  localPath: string
  /** Error message */
  error: string
}

/** Event data emitted after file persistence completes */
export interface FilesPersistedEventData {
  /** Number of files successfully persisted */
  persistedCount: number
  /** Number of files that failed to persist */
  failedCount: number
  /** Total bytes uploaded */
  totalBytes: number
  /** Time in milliseconds */
  durationMs: number
  /** List of persisted files */
  files: PersistedFile[]
  /** List of failed files */
  failures: FailedPersistence[]
}

/** Maximum number of files to persist per turn */
export const FILE_COUNT_LIMIT = 100

/** Default concurrency for file uploads */
export const DEFAULT_UPLOAD_CONCURRENCY = 5

/** Subdirectory name for outputs */
export const OUTPUTS_SUBDIR = 'outputs'
