/**
 * Provider Selector - Multi-provider AI support
 * Enables selection of different AI providers (OpenRouter, OpenAI, xAI, Hyperbolic)
 */

import { createOpenAI } from '@ai-sdk/openai';
import { createXai } from '@ai-sdk/xai';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import type { LanguageModel } from 'ai';

// ============================================================================
// Types
// ============================================================================

export interface ProviderSelectorConfig {
  openRouterApiKey?: string;
  openaiApiKey?: string;
  xaiApiKey?: string;
  hyperbolicApiKey?: string;
}

export interface ProviderSelector {
  openrouter?: (model?: string) => LanguageModel;
  openai?: (model?: string) => LanguageModel;
  xai?: (model?: string) => LanguageModel;
  hyperbolic?: (model?: string) => LanguageModel;
}

// ============================================================================
// Default Models
// ============================================================================

export const DEFAULT_MODELS = {
  openrouter: 'anthropic/claude-sonnet-4.5',
  openai: 'gpt-5-mini',
  xai: 'grok-4-fast-reasoning',
  hyperbolic: 'openai/gpt-oss-120b',
} as const;

// ============================================================================
// Provider Selector
// ============================================================================

/**
 * Creates a provider selector with initialized providers based on available API keys
 *
 * @param config - Configuration with optional API keys for each provider
 * @returns ProviderSelector with available provider functions
 *
 * @example
 * ```typescript
 * const selector = createProviderSelector({
 *   openRouterApiKey: process.env.OPENROUTER_API_KEY,
 *   openaiApiKey: process.env.OPENAI_API_KEY,
 * });
 *
 * // Use OpenRouter
 * if (selector.openrouter) {
 *   const model = selector.openrouter('anthropic/claude-sonnet-4.5');
 *   // Use with Vercel AI SDK...
 * }
 * ```
 */
export function createProviderSelector(config: ProviderSelectorConfig): ProviderSelector {
  const selector: ProviderSelector = {};

  // OpenRouter
  if (config.openRouterApiKey) {
    const openRouter = createOpenRouter({
      apiKey: config.openRouterApiKey,
    });
    selector.openrouter = (model?: string) => openRouter(model || DEFAULT_MODELS.openrouter);
  }

  // OpenAI
  if (config.openaiApiKey) {
    const openai = createOpenAI({
      apiKey: config.openaiApiKey,
    });
    selector.openai = (model?: string) => openai(model || DEFAULT_MODELS.openai);
  }

  // xAI
  if (config.xaiApiKey) {
    const xai = createXai({
      apiKey: config.xaiApiKey,
    });
    selector.xai = (model?: string) => xai(model || DEFAULT_MODELS.xai);
  }

  // Hyperbolic
  // TODO: wait for Hyperbolic to support AI SDK 5
  // if (config.hyperbolicApiKey) {
  //   const hyperbolic = createHyperbolic({
  //     apiKey: config.hyperbolicApiKey,
  //   });
  //   selector.hyperbolic = (model?: string) =>
  //     hyperbolic(model || DEFAULT_MODELS.hyperbolic) as unknown as LanguageModel;
  // }

  return selector;
}

/**
 * Gets list of available provider names from a provider selector
 *
 * @param selector - Provider selector to inspect
 * @returns Array of available provider names
 *
 * @example
 * ```typescript
 * const availableProviders = getAvailableProviders(selector);
 * console.log('Available:', availableProviders); // ['openrouter', 'openai']
 * ```
 */
export function getAvailableProviders(
  selector: ProviderSelector,
): Array<'openrouter' | 'openai' | 'xai' | 'hyperbolic'> {
  return Object.keys(selector) as Array<'openrouter' | 'openai' | 'xai' | 'hyperbolic'>;
}
