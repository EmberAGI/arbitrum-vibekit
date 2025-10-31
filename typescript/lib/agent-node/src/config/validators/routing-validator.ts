/**
 * Routing Configuration Validator
 * Validates routing configuration for Agent Card hosting
 */

import type { RoutingConfig } from '../schemas/agent.schema.js';

export interface ValidationResult {
  errors: string[];
  warnings: string[];
}

/**
 * Validate routing configuration
 * @param config - Routing configuration object
 * @returns Validation result with errors and warnings
 */
export function validateRoutingConfig(config: RoutingConfig | undefined): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // If routing is not configured, no validation needed
  if (!config) {
    return { errors, warnings };
  }

  // Validate agentCardPath
  if (config.agentCardPath !== undefined) {
    if (typeof config.agentCardPath !== 'string') {
      errors.push('Invalid agentCardPath: must be a string.');
    } else if (!config.agentCardPath.startsWith('/')) {
      errors.push(
        `Invalid agentCardPath: "${config.agentCardPath}". Must start with "/" (e.g., "/.well-known/agent-card.json").`,
      );
    } else if (config.agentCardPath !== '/.well-known/agent-card.json') {
      // Non-default path - warn about customization
      warnings.push(
        `Custom Agent Card path configured: "${config.agentCardPath}". ` +
          'Default is "/.well-known/agent-card.json". ' +
          'Ensure your deployment serves the Agent Card at this path.',
      );
    }
  }

  // Validate agentCardOrigin
  if (config.agentCardOrigin !== undefined) {
    if (typeof config.agentCardOrigin !== 'string') {
      errors.push('Invalid agentCardOrigin: must be a string.');
    } else {
      try {
        const parsed = new URL(config.agentCardOrigin);

        // Origin must not include path (only scheme + host + optional port)
        if (parsed.pathname !== '/' || parsed.search || parsed.hash) {
          errors.push(
            `Invalid agentCardOrigin: "${config.agentCardOrigin}". ` +
              'Must be an origin only (scheme + host + optional port), without path. ' +
              'Example: "https://example.com" or "https://example.com:8080".',
          );
        } else {
          // Valid origin, but it's a custom override
          warnings.push(
            `Custom Agent Card origin configured: "${config.agentCardOrigin}". ` +
              'Default behavior uses the origin from `card.url`. ' +
              'Ensure this override matches your deployment configuration.',
          );
        }
      } catch {
        errors.push(
          `Invalid agentCardOrigin: "${config.agentCardOrigin}". Must be a valid URL origin.`,
        );
      }
    }
  }

  return { errors, warnings };
}
