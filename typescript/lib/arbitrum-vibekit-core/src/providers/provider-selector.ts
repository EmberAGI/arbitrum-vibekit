import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { createOpenAI } from '@ai-sdk/openai';
import { createXai } from '@ai-sdk/xai';
import { createHyperbolic } from '@hyperbolic/ai-sdk-provider';
import type { LanguageModelV1 } from 'ai';

export interface ProviderSelectorConfig {
  openRouterApiKey?: string;
  openaiApiKey?: string;
  xaiApiKey?: string;
  hyperbolicApiKey?: string;
}

export interface ProviderSelector {
  openrouter?: (model?: string) => LanguageModelV1;
  openai?: (model?: string) => LanguageModelV1;
  xai?: (model?: string) => LanguageModelV1;
  hyperbolic?: (model?: string) => LanguageModelV1;
}

export function createProviderSelector(config: ProviderSelectorConfig): ProviderSelector {
  const selector: ProviderSelector = {};

  // Only add OpenRouter if API key is provided
  if (config.openRouterApiKey) {
    const openRouterInstance = createOpenRouter({ apiKey: config.openRouterApiKey });
    selector.openrouter = (model?: string) =>
      openRouterInstance(model || 'google/gemini-2.5-flash');
  }

  // Only add OpenAI if API key is provided
  if (config.openaiApiKey) {
    const openaiInstance = createOpenAI({ apiKey: config.openaiApiKey });
    selector.openai = (model?: string) => openaiInstance(model || 'gpt-4o');
  }

  // Only add XAI if API key is provided
  if (config.xaiApiKey) {
    const xaiInstance = createXai({ apiKey: config.xaiApiKey });
    selector.xai = (model?: string) => xaiInstance(model || 'grok-3');
  }

  // Only add Hyperbolic if API key is provided
  if (config.hyperbolicApiKey) {
    const hyperbolicInstance = createHyperbolic({ apiKey: config.hyperbolicApiKey });
    selector.hyperbolic = (model?: string) =>
      hyperbolicInstance(model || 'meta-llama/Llama-3.3-70B-Instruct');
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
