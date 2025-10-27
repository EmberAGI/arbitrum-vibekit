/**
 * Tool Name Validator
 * Validates tool naming conventions and detects collisions
 */

const TOOL_NAME_PATTERN = /^[a-z][a-z0-9_]*__[a-z][a-z0-9_]*$/;
const ALLOWED_CHARS = /^[a-z0-9_]+$/;

export interface ToolValidationError {
  tool: string;
  server?: string;
  skill?: string;
  reason: string;
}

export class ToolValidationException extends Error {
  constructor(
    public errors: ToolValidationError[],
    message: string,
  ) {
    super(message);
    this.name = 'ToolValidationException';
  }
}

/**
 * Canonicalize server or tool name to snake_case
 * - Converts hyphens to underscores
 * - Converts camelCase to snake_case
 * @param name - Server or tool name
 * @returns Canonicalized name in snake_case
 */
export function canonicalizeName(name: string): string {
  // First convert camelCase to snake_case
  // Insert underscore before uppercase letters (except at start), then lowercase
  const snakeCase = name
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1_$2')
    .toLowerCase();

  // Then convert any remaining hyphens to underscores
  return snakeCase.replace(/-/g, '_');
}

/**
 * Validate tool name follows canonical naming scheme
 * Format: server_name__tool_name (lowercase snake_case)
 * Tool names must be canonicalized before validation
 * @param toolName - Tool name to validate (should be in snake_case)
 * @returns true if valid, false otherwise
 */
export function isValidToolName(toolName: string): boolean {
  return TOOL_NAME_PATTERN.test(toolName);
}

/**
 * Extract server name from namespaced tool
 * @param toolName - Namespaced tool name (e.g., "server_name__tool_name")
 * @returns Server name or null if invalid format
 */
export function extractServerName(toolName: string): string | null {
  const parts = toolName.split('__');
  if (parts.length !== 2) {
    return null;
  }
  return parts[0] ?? null;
}

/**
 * Extract tool name from namespaced tool
 * @param toolName - Namespaced tool name (e.g., "server_name__tool_name")
 * @returns Tool name or null if invalid format
 */
export function extractToolName(toolName: string): string | null {
  const parts = toolName.split('__');
  if (parts.length !== 2) {
    return null;
  }
  return parts[1] ?? null;
}

/**
 * Create namespaced tool name
 * Canonicalizes hyphens to underscores in both server and tool names
 * @param serverName - Server name
 * @param toolName - Tool name
 * @returns Namespaced tool name with double underscore separator
 */
export function createToolNamespace(serverName: string, toolName: string): string {
  const canonicalServer = canonicalizeName(serverName);
  const canonicalTool = canonicalizeName(toolName);
  return `${canonicalServer}__${canonicalTool}`;
}

/**
 * Validate tool names and detect collisions
 * @param tools - Map of tool names to their sources (server or skill)
 * @throws ToolValidationException if validation fails
 */
export function validateToolNames(
  tools: Map<string, { server?: string; skill?: string; source: string }>,
): void {
  const errors: ToolValidationError[] = [];
  const seenTools = new Map<string, { server?: string; skill?: string }>();

  for (const [toolName, { server, skill }] of tools.entries()) {
    // Validate naming convention
    if (!isValidToolName(toolName)) {
      errors.push({
        tool: toolName,
        server,
        skill,
        reason: `Invalid tool name format. Must match pattern: server_name__tool_name (lowercase snake_case)`,
      });
      continue;
    }

    // Check for duplicates
    const existing = seenTools.get(toolName);
    if (existing) {
      errors.push({
        tool: toolName,
        server,
        skill,
        reason: `Duplicate tool name. Already defined by server: ${existing.server ?? 'unknown'}, skill: ${existing.skill ?? 'unknown'}`,
      });
      continue;
    }

    seenTools.set(toolName, { server, skill });
  }

  if (errors.length > 0) {
    const errorMessages = errors
      .map((err) => {
        const location = err.server
          ? `server: ${err.server}`
          : err.skill
            ? `skill: ${err.skill}`
            : 'unknown';
        return `  - ${err.tool} (${location}): ${err.reason}`;
      })
      .join('\n');

    throw new ToolValidationException(
      errors,
      `Tool validation failed:\n${errorMessages}\n\n` +
        `All tools must follow the naming convention: server_name__tool_name\n` +
        `Tool names must be in lowercase snake_case format.\n` +
        `Allowed characters: lowercase letters (a-z), digits (0-9), underscores (_)\n` +
        `Duplicate tool names are not allowed.`,
    );
  }
}

/**
 * Validate tool name character restrictions
 * @param name - Name to validate
 * @returns true if valid, false otherwise
 */
export function hasValidCharacters(name: string): boolean {
  return ALLOWED_CHARS.test(name);
}
