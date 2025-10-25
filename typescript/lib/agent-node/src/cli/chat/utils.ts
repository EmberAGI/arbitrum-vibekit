/**
 * Chat Utilities
 * Helper functions for chat mode
 */

/**
 * Check if an agent at the given URL is reachable
 * @param baseUrl - Base URL of the agent (e.g., http://localhost:3000)
 * @param timeoutMs - Timeout in milliseconds (default: 3000)
 * @returns true if reachable, false otherwise
 */
export async function isAgentReachable(
  baseUrl: string,
  timeoutMs: number = 3000,
): Promise<boolean> {
  try {
    // Normalize URL (remove trailing slash)
    const normalizedUrl = baseUrl.replace(/\/$/, '');
    const cardUrl = `${normalizedUrl}/.well-known/agent-card.json`;

    // Create abort controller for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      let response = await fetch(cardUrl, {
        method: 'HEAD',
        signal: controller.signal,
      });

      // Some servers may not support HEAD on this route; fall back to GET
      if (response.status === 405 || response.status === 404) {
        response = await fetch(cardUrl, {
          method: 'GET',
          signal: controller.signal,
        });
      }

      clearTimeout(timeoutId);

      // Consider 2xx and 3xx as reachable
      return response.ok || (response.status >= 300 && response.status < 400);
    } catch (fetchError) {
      clearTimeout(timeoutId);

      // If abort, it's a timeout
      if (fetchError instanceof Error && fetchError.name === 'AbortError') {
        return false;
      }

      // Other fetch errors mean unreachable
      return false;
    }
  } catch {
    return false;
  }
}

/**
 * Parse log level from environment variable
 * @returns LOG_LEVEL value or undefined
 */
export function getLogLevelFromEnv(): string | undefined {
  return process.env['LOG_LEVEL'];
}

/**
 * Set log level in environment if not already set
 * @param level - Log level to set
 */
export function setDefaultLogLevel(level: string): void {
  if (!process.env['LOG_LEVEL']) {
    process.env['LOG_LEVEL'] = level;
  }
}
