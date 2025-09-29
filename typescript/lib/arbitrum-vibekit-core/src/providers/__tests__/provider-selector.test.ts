import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createProviderSelector, getAvailableProviders } from '../provider-selector.js';
import type { LanguageModelV1 } from 'ai';

// Mock the provider modules
vi.mock('@openrouter/ai-sdk-provider', () => ({
  createOpenRouter: vi.fn(() => {
    const mockProvider = vi.fn(
      (model: string) =>
        ({
          modelId: `openrouter:${model}`,
          provider: 'openrouter',
        }) as unknown as LanguageModelV1
    );
    return mockProvider;
  }),
}));

vi.mock('@ai-sdk/openai', () => ({
  createOpenAI: vi.fn(() => {
    const mockProvider = vi.fn(
      (model: string) =>
        ({
          modelId: `openai:${model}`,
          provider: 'openai',
        }) as unknown as LanguageModelV1
    );
    return mockProvider;
  }),
}));

vi.mock('@ai-sdk/xai', () => ({
  createXai: vi.fn(() => {
    const mockProvider = vi.fn(
      (model: string) =>
        ({
          modelId: `xai:${model}`,
          provider: 'xai',
        }) as unknown as LanguageModelV1
    );
    return mockProvider;
  }),
}));

vi.mock('@hyperbolic/ai-sdk-provider', () => ({
  createHyperbolic: vi.fn(() => {
    const mockProvider = vi.fn(
      (model: string) =>
        ({
          modelId: `hyperbolic:${model}`,
          provider: 'hyperbolic',
        }) as unknown as LanguageModelV1
    );
    return mockProvider;
  }),
}));

describe('createProviderSelector', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Clear console.warn mock
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('should create a selector with all providers when all API keys are provided', () => {
    const selector = createProviderSelector({
      openRouterApiKey: 'test-openrouter-key',
      openaiApiKey: 'test-openai-key',
      xaiApiKey: 'test-xai-key',
      hyperbolicApiKey: 'test-hyperbolic-key',
    });

    expect(selector.openrouter).toBeDefined();
    expect(selector.openai).toBeDefined();
    expect(selector.xai).toBeDefined();
    expect(selector.hyperbolic).toBeDefined();
  });

  it('should only include providers with API keys', () => {
    const selector = createProviderSelector({
      openRouterApiKey: 'test-openrouter-key',
      // openaiApiKey not provided
      xaiApiKey: 'test-xai-key',
      hyperbolicApiKey: 'test-hyperbolic-key',
    });

    expect(selector.openrouter).toBeDefined();
    expect(selector.openai).toBeUndefined();
    expect(selector.xai).toBeDefined();
    expect(selector.hyperbolic).toBeDefined();
  });

  it('should warn when no API keys are provided', () => {
    const warnSpy = vi.spyOn(console, 'warn');

    createProviderSelector({});

    expect(warnSpy).toHaveBeenCalledWith(
      'No API keys provided to createProviderSelector. No providers will be available.'
    );
  });

  it('should create working provider functions', () => {
    const selector = createProviderSelector({
      openRouterApiKey: 'test-openrouter-key',
      openaiApiKey: 'test-openai-key',
      xaiApiKey: 'test-xai-key',
      hyperbolicApiKey: 'test-hyperbolic-key',
    });

    // Test OpenRouter
    const openRouterModel = selector.openrouter!('openai/gpt-4.1-nano');
    expect(openRouterModel).toMatchObject({
      modelId: 'openrouter:openai/gpt-4.1-nano',
      provider: 'openrouter',
    });

    // Test OpenAI
    const openAiModel = selector.openai!('gpt-4.1-nano');
    expect(openAiModel).toMatchObject({
      modelId: 'openai:gpt-4.1-nano',
      provider: 'openai',
    });

    // Test XAI
    const xaiModel = selector.xai!('grok-3-mini');
    expect(xaiModel).toMatchObject({
      modelId: 'xai:grok-3-mini',
      provider: 'xai',
    });

    // Test Hyperbolic
    const hyperbolicModel = selector.hyperbolic!('meta-llama/Llama-3.2-3B-Instruct');
    expect(hyperbolicModel).toMatchObject({
      modelId: 'hyperbolic:meta-llama/Llama-3.2-3B-Instruct',
      provider: 'hyperbolic',
    });
  });

  it('should handle partial configurations correctly', () => {
    const selector1 = createProviderSelector({
      openRouterApiKey: 'test-key',
    });
    expect(selector1.openrouter).toBeDefined();
    expect(selector1.openai).toBeUndefined();
    expect(selector1.xai).toBeUndefined();
    expect(selector1.hyperbolic).toBeUndefined();

    const selector2 = createProviderSelector({
      openaiApiKey: 'test-key',
    });
    expect(selector2.openrouter).toBeUndefined();
    expect(selector2.openai).toBeDefined();
    expect(selector2.xai).toBeUndefined();
    expect(selector2.hyperbolic).toBeUndefined();

    const selector3 = createProviderSelector({
      xaiApiKey: 'test-key',
    });
    expect(selector3.openrouter).toBeUndefined();
    expect(selector3.openai).toBeUndefined();
    expect(selector3.xai).toBeDefined();
    expect(selector3.hyperbolic).toBeUndefined();

    const selector4 = createProviderSelector({
      hyperbolicApiKey: 'test-key',
    });
    expect(selector4.openrouter).toBeUndefined();
    expect(selector4.openai).toBeUndefined();
    expect(selector4.xai).toBeUndefined();
    expect(selector4.hyperbolic).toBeDefined();
  });
});

describe('getAvailableProviders', () => {
  it('should return all available providers', () => {
    const selector = createProviderSelector({
      openRouterApiKey: 'test-openrouter-key',
      openaiApiKey: 'test-openai-key',
      xaiApiKey: 'test-xai-key',
      hyperbolicApiKey: 'test-hyperbolic-key',
    });

    const available = getAvailableProviders(selector);
    expect(available).toEqual(['openrouter', 'openai', 'xai', 'hyperbolic']);
  });

  it('should return only providers with API keys', () => {
    const selector = createProviderSelector({
      openRouterApiKey: 'test-openrouter-key',
      // openaiApiKey not provided
      xaiApiKey: 'test-xai-key',
      hyperbolicApiKey: 'test-hyperbolic-key',
    });

    const available = getAvailableProviders(selector);
    expect(available).toEqual(['openrouter', 'xai', 'hyperbolic']);
  });

  it('should return empty array when no providers are available', () => {
    const selector = createProviderSelector({});

    const available = getAvailableProviders(selector);
    expect(available).toEqual([]);
  });

  it('should handle single provider configurations', () => {
    const selector1 = createProviderSelector({
      openRouterApiKey: 'test-key',
    });
    expect(getAvailableProviders(selector1)).toEqual(['openrouter']);

    const selector2 = createProviderSelector({
      openaiApiKey: 'test-key',
    });
    expect(getAvailableProviders(selector2)).toEqual(['openai']);

    const selector3 = createProviderSelector({
      xaiApiKey: 'test-key',
    });
    expect(getAvailableProviders(selector3)).toEqual(['xai']);

    const selector4 = createProviderSelector({
      hyperbolicApiKey: 'test-key',
    });
    expect(getAvailableProviders(selector4)).toEqual(['hyperbolic']);
  });
});
