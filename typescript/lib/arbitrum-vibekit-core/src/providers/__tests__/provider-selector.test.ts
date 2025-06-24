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

vi.mock('ollama-ai-provider', () => ({
  createOllama: vi.fn(() => {
    const mockProvider = vi.fn(
      (model: string) =>
        ({
          modelId: `secretai:${model}`,
          provider: 'secretai',
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
      secretaiApiKey: 'test-secretai-key',
      secretaiUrl: 'test-secretai-url',
    });

    expect(selector.openrouter).toBeDefined();
    expect(selector.openai).toBeDefined();
    expect(selector.grok).toBeDefined();
    expect(selector.hyperbolic).toBeDefined();
    expect(selector.secretai).toBeDefined();
  });

  it('should only include providers with API keys', () => {
    const selector = createProviderSelector({
      openRouterApiKey: 'test-openrouter-key',
      // openaiApiKey not provided
      xaiApiKey: 'test-xai-key',
      hyperbolicApiKey: 'test-hyperbolic-key',
      secretaiApiKey: 'test-secretai-key',
      secretaiUrl: 'test-secretai-url',
    });

    expect(selector.openrouter).toBeDefined();
    expect(selector.openai).toBeUndefined();
    expect(selector.grok).toBeDefined();
    expect(selector.hyperbolic).toBeDefined();
    expect(selector.secretai).toBeDefined();
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
      secretaiApiKey: 'test-secretai-key',
      secretaiUrl: 'test-secretai-url',
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

    // Test Grok (xAI)
    const grokModel = selector.grok!('grok-3-mini');
    expect(grokModel).toMatchObject({
      modelId: 'xai:grok-3-mini',
      provider: 'xai',
    });

    // Test Hyperbolic
    const hyperbolicModel = selector.hyperbolic!('meta-llama/Llama-3.2-3B-Instruct');
    expect(hyperbolicModel).toMatchObject({
      modelId: 'hyperbolic:meta-llama/Llama-3.2-3B-Instruct',
      provider: 'hyperbolic',
    });

    // Test SecretAI
    const secretaiModel = selector.secretai!('gemma3:4b');
    expect(secretaiModel).toMatchObject({
      modelId: 'secretai:gemma3:4b',
      provider: 'secretai',
    });
  });

  it('should handle partial configurations correctly', () => {
    const selector1 = createProviderSelector({
      openRouterApiKey: 'test-key',
    });
    expect(selector1.openrouter).toBeDefined();
    expect(selector1.openai).toBeUndefined();
    expect(selector1.grok).toBeUndefined();
    expect(selector1.hyperbolic).toBeUndefined();
    expect(selector1.secretai).toBeUndefined();

    const selector2 = createProviderSelector({
      openaiApiKey: 'test-key',
    });
    expect(selector2.openrouter).toBeUndefined();
    expect(selector2.openai).toBeDefined();
    expect(selector2.grok).toBeUndefined();
    expect(selector2.hyperbolic).toBeUndefined();
    expect(selector2.secretai).toBeUndefined();

    const selector3 = createProviderSelector({
      xaiApiKey: 'test-key',
    });
    expect(selector3.openrouter).toBeUndefined();
    expect(selector3.openai).toBeUndefined();
    expect(selector3.grok).toBeDefined();
    expect(selector3.hyperbolic).toBeUndefined();
    expect(selector3.secretai).toBeUndefined();

    const selector4 = createProviderSelector({
      hyperbolicApiKey: 'test-key',
    });
    expect(selector4.openrouter).toBeUndefined();
    expect(selector4.openai).toBeUndefined();
    expect(selector4.grok).toBeUndefined();
    expect(selector4.hyperbolic).toBeDefined();
    expect(selector4.secretai).toBeUndefined();

    const selector5 = createProviderSelector({
      secretaiApiKey: 'test-key',
      secretaiUrl: 'test-url',
    });
    expect(selector5.openrouter).toBeUndefined();
    expect(selector5.openai).toBeUndefined();
    expect(selector5.grok).toBeUndefined();
    expect(selector5.hyperbolic).toBeUndefined();
    expect(selector5.secretai).toBeDefined();
  });
});

describe('getAvailableProviders', () => {
  it('should return all available providers', () => {
    const selector = createProviderSelector({
      openRouterApiKey: 'test-openrouter-key',
      openaiApiKey: 'test-openai-key',
      xaiApiKey: 'test-xai-key',
      hyperbolicApiKey: 'test-hyperbolic-key',
      secretaiApiKey: 'test-secretai-key',
      secretaiUrl: 'test-secretai-url',
    });

    const available = getAvailableProviders(selector);
    expect(available).toEqual(['openrouter', 'openai', 'grok', 'hyperbolic', 'secretai']);
  });

  it('should return only providers with API keys', () => {
    const selector = createProviderSelector({
      openRouterApiKey: 'test-openrouter-key',
      // openaiApiKey not provided
      xaiApiKey: 'test-xai-key',
      hyperbolicApiKey: 'test-hyperbolic-key',
      secretaiApiKey: 'test-secretai-key',
      secretaiUrl: 'test-secretai-url',
    });

    const available = getAvailableProviders(selector);
    expect(available).toEqual(['openrouter', 'grok', 'hyperbolic', 'secretai']);
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
    expect(getAvailableProviders(selector3)).toEqual(['grok']);

    const selector4 = createProviderSelector({
      hyperbolicApiKey: 'test-key',
    });
    expect(getAvailableProviders(selector4)).toEqual(['hyperbolic']);

    const selector5 = createProviderSelector({
      secretaiApiKey: 'test-key',
      secretaiUrl: 'test-url',
    });
    expect(getAvailableProviders(selector5)).toEqual(['secretai']);
  });
});
