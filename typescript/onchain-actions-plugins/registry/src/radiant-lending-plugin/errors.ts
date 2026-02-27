/**
 * Wrap any error with Radiant plugin context for better debugging
 * @param context - Context where the error occurred
 * @param error - The original error
 * @returns Wrapped error with Radiant plugin context
 */
export function wrapRadiantError(context: string, error: unknown): Error {
  const message = error instanceof Error ? error.message : String(error);
  return new Error(`[RadiantPlugin] ${context}: ${message}`);
}

/**
 * Custom error class for Radiant plugin specific errors
 */
export class RadiantError extends Error {
  /**
   * Create a new RadiantError
   * @param message - Error message
   * @param context - Optional context where error occurred
   */
  constructor(message: string, public readonly context?: string) {
    super(message);
    this.name = 'RadiantError';
  }
}

/**
 * Handle and re-throw errors with proper Radiant context
 * @param context - Context where the error occurred
 * @param error - The original error
 * @throws Always throws either RadiantError or wrapped error
 */
export function handleRadiantError(context: string, error: unknown): never {
  if (error instanceof RadiantError) {
    throw error;
  }
  throw wrapRadiantError(context, error);
}
