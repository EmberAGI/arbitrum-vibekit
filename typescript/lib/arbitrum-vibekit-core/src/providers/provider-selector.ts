import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { createXai } from '@ai-sdk/xai';
import { createHyperbolic } from '@hyperbolic/ai-sdk-provider';
import type { LanguageModelV1 } from 'ai';

export interface ProviderSelectorConfig {
  openRouterApiKey?: string;
  xaiApiKey?: string;
  hyperbolicApiKey?: string;
}

export interface ProviderSelector {
  openrouter?: (model: string) => LanguageModelV1;
  grok?: (model: string) => LanguageModelV1;
  hyperbolic?: (model: string) => LanguageModelV1;
}

export function createProviderSelector(config: ProviderSelectorConfig): ProviderSelector {
  const selector: ProviderSelector = {};

  // Only add OpenRouter if API key is provided
  if (config.openRouterApiKey) {
    const openRouterInstance = createOpenRouter({ apiKey: config.openRouterApiKey });
    selector.openrouter = (model: string) => openRouterInstance(model);
  }

  // Only add Grok if API key is provided
  if (config.xaiApiKey) {
    const xaiInstance = createXai({ apiKey: config.xaiApiKey });
    selector.grok = (model: string) => xaiInstance(model);
  }

  // Only add Hyperbolic if API key is provided
  if (config.hyperbolicApiKey) {
    const hyperbolicInstance = createHyperbolic({ apiKey: config.hyperbolicApiKey });
    selector.hyperbolic = (model: string) => hyperbolicInstance(model);
  }

  // Warn if no providers are configured
  if (Object.keys(selector).length === 0) {
    console.warn('No API keys provided to createProviderSelector. No providers will be available.');
  }

  return selector;
}

// Helper function to check available providers
export function getAvailableProviders(selector: ProviderSelector): string[] {
  return Object.keys(selector).filter(key => selector[key as keyof ProviderSelector] !== undefined);
}
