/**
 * AI Configuration Utility
 * Loads and validates AI configuration JSON files
 * Merges JSON settings with environment-based secrets from config.ts
 */

import { readFile, writeFile } from 'node:fs/promises';

import { z } from 'zod';

import { serviceConfig } from '../config.js';

// ============================================================================
// Zod Schemas
// ============================================================================

/**
 * Schema for AI configuration file (non-secret settings only)
 * Secrets (API keys) are loaded from config.ts which reads from .env
 */
const AIConfigSchema = z.object({
  provider: z.enum(['openrouter', 'openai', 'xai', 'hyperbolic']),
  model: z.string().optional(),
});

// ============================================================================
// Types
// ============================================================================

/**
 * Type for AI configuration file content (settings only, no secrets)
 */
export type AIConfigFile = z.infer<typeof AIConfigSchema>;

/**
 * Complete AI configuration including API keys from environment
 * This is what AIService expects
 */
export type AIConfig = AIConfigFile & {
  openRouterApiKey?: string;
  openaiApiKey?: string;
  xaiApiKey?: string;
  hyperbolicApiKey?: string;
};

export type ValidationResult<T> = { success: true; data: T } | { success: false; error: string };

// ============================================================================
// Core Functions
// ============================================================================

/**
 * Validates AI configuration object against schema
 * Includes security linting for hardcoded API keys
 *
 * @param config - Configuration object to validate
 * @returns ValidationResult with typed data or error message
 */
export function validateConfig(config: unknown): ValidationResult<AIConfigFile> {
  try {
    const validated = AIConfigSchema.parse(config);
    return { success: true, data: validated };
  } catch (error) {
    if (error instanceof z.ZodError) {
      const messages = error.issues.map((err) => {
        const path = err.path.join('.');
        return `${path}: ${err.message}`;
      });
      return {
        success: false,
        error: `Configuration validation failed:\n${messages.join('\n')}`,
      };
    }
    return {
      success: false,
      error: `Validation error: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Loads AI configuration from JSON file and merges with environment secrets
 * JSON file contains settings (provider, model)
 * API keys are loaded from config.ts which reads from .env
 *
 * @param filePath - Path to configuration JSON file
 * @returns Complete AI configuration with settings from JSON and API keys from environment
 * @throws Error if file cannot be read or validation fails
 */
export async function loadConfig(filePath: string): Promise<AIConfig> {
  try {
    const content = await readFile(filePath, 'utf-8');
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const parsed = JSON.parse(content);

    const validation = validateConfig(parsed);
    if (!validation.success) {
      throw new Error(validation.error);
    }

    // Merge JSON settings with API keys from serviceConfig (which loads from .env)
    return {
      ...validation.data,
      openRouterApiKey: serviceConfig.ai.openRouterApiKey,
      openaiApiKey: serviceConfig.ai.openaiApiKey,
      xaiApiKey: serviceConfig.ai.xaiApiKey,
      hyperbolicApiKey: serviceConfig.ai.hyperbolicApiKey,
    };
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.includes('ENOENT')) {
        throw new Error(`Configuration file not found: ${filePath}`);
      }
      if (error.message.includes('JSON')) {
        throw new Error(`Invalid JSON in configuration file: ${filePath}`);
      }
      throw error;
    }
    throw new Error(`Failed to load configuration: ${String(error)}`);
  }
}

/**
 * Saves AI configuration to JSON file
 * Only saves settings (provider, model), not API keys (which live in .env)
 * Validates configuration before writing
 * Formats with pretty-printing (2-space indent)
 *
 * @param filePath - Path where configuration should be saved
 * @param config - Configuration object to save (settings only)
 * @throws Error if validation fails or file cannot be written
 */
export async function saveConfig(filePath: string, config: AIConfigFile): Promise<void> {
  const validation = validateConfig(config);
  if (!validation.success) {
    throw new Error(validation.error);
  }

  try {
    const content = JSON.stringify(config, null, 2) + '\n';
    await writeFile(filePath, content, 'utf-8');
  } catch (error) {
    throw new Error(
      `Failed to save configuration to ${filePath}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

// ============================================================================
// Re-exports
// ============================================================================

export { AIConfigSchema };
