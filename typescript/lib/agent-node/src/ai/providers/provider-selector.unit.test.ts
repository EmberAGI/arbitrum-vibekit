import type { LanguageModel } from 'ai';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import {
  createProviderSelector,
  getAvailableProviders,
  DEFAULT_MODELS,
} from './provider-selector.js';

// Mock the provider modules
vi.mock('@openrouter/ai-sdk-provider', () => ({
  createOpenRouter: vi.fn(() => {
    const mockProvider = vi.fn(
      (model: string) =>
        ({
          modelId: `openrouter:${model}`,
          provider: 'openrouter',
        }) as unknown as LanguageModel,
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
        }) as unknown as LanguageModel,
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
        }) as unknown as LanguageModel,
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
        }) as unknown as LanguageModel,
    );
    return mockProvider;
  }),
}));

describe('createProviderSelector', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('provider initialization', () => {
    it('should create selector with all providers when all API keys provided', () => {
      // Given configuration with all API keys
      const config = {
        openRouterApiKey: 'test-openrouter-key',
        openaiApiKey: 'test-openai-key',
        xaiApiKey: 'test-xai-key',
        hyperbolicApiKey: 'test-hyperbolic-key',
      };

      // When creating provider selector
      const selector = createProviderSelector(config);

      // Then all 3 available providers should be initialized (Hyperbolic disabled pending AI SDK 5 support)
      expect(selector.openrouter).toBeDefined();
      expect(selector.openai).toBeDefined();
      expect(selector.xai).toBeDefined();
      expect(selector.hyperbolic).toBeUndefined(); // Disabled pending AI SDK 5 support
    });

    it('should only include providers with API keys', () => {
      // Given partial configuration (only OpenRouter and xAI)
      const config = {
        openRouterApiKey: 'test-openrouter-key',
        xaiApiKey: 'test-xai-key',
      };

      // When creating provider selector
      const selector = createProviderSelector(config);

      // Then only configured providers should be initialized
      expect(selector.openrouter).toBeDefined();
      expect(selector.openai).toBeUndefined();
      expect(selector.xai).toBeDefined();
      expect(selector.hyperbolic).toBeUndefined();
    });

    it('should handle empty configuration without warnings', () => {
      // Given empty configuration (agent-node doesn't warn, AIService handles it)
      const warnSpy = vi.spyOn(console, 'warn');

      // When creating provider selector with no API keys
      const selector = createProviderSelector({});

      // Then no providers should be available and no warning should be logged
      expect(selector.openrouter).toBeUndefined();
      expect(selector.openai).toBeUndefined();
      expect(selector.xai).toBeUndefined();
      expect(selector.hyperbolic).toBeUndefined();
      expect(warnSpy).not.toHaveBeenCalled();
    });

    it('should handle each provider individually', () => {
      // Test each provider in isolation
      const selector1 = createProviderSelector({ openRouterApiKey: 'key-1' });
      expect(selector1.openrouter).toBeDefined();
      expect(getAvailableProviders(selector1)).toEqual(['openrouter']);

      const selector2 = createProviderSelector({ openaiApiKey: 'key-2' });
      expect(selector2.openai).toBeDefined();
      expect(getAvailableProviders(selector2)).toEqual(['openai']);

      const selector3 = createProviderSelector({ xaiApiKey: 'key-3' });
      expect(selector3.xai).toBeDefined();
      expect(getAvailableProviders(selector3)).toEqual(['xai']);

      // Hyperbolic is disabled pending AI SDK 5 support
      const selector4 = createProviderSelector({ hyperbolicApiKey: 'key-4' });
      expect(selector4.hyperbolic).toBeUndefined();
      expect(getAvailableProviders(selector4)).toEqual([]);
    });
  });

  describe('optional model parameter', () => {
    it('should use custom model when provided', () => {
      // Given provider selector with OpenRouter
      const selector = createProviderSelector({
        openRouterApiKey: 'test-key',
      });

      // When calling provider function with custom model
      const customModel = 'anthropic/claude-opus-4';
      const model = selector.openrouter!(customModel);

      // Then custom model should be used
      expect(model).toMatchObject({
        modelId: `openrouter:${customModel}`,
        provider: 'openrouter',
      });
    });

    it('should use DEFAULT_MODELS when no model provided', () => {
      // Given provider selector with available providers (Hyperbolic disabled)
      const selector = createProviderSelector({
        openRouterApiKey: 'test-openrouter-key',
        openaiApiKey: 'test-openai-key',
        xaiApiKey: 'test-xai-key',
      });

      // When calling provider functions without model parameter
      const openrouterModel = selector.openrouter!();
      const openaiModel = selector.openai!();
      const xaiModel = selector.xai!();

      // Then DEFAULT_MODELS should be used for each provider
      expect(openrouterModel).toMatchObject({
        modelId: `openrouter:${DEFAULT_MODELS.openrouter}`,
      });
      expect(openaiModel).toMatchObject({
        modelId: `openai:${DEFAULT_MODELS.openai}`,
      });
      expect(xaiModel).toMatchObject({
        modelId: `xai:${DEFAULT_MODELS.xai}`,
      });
    });

    it('should support optional parameter for all providers', () => {
      // Given selector with available providers (Hyperbolic disabled)
      const selector = createProviderSelector({
        openRouterApiKey: 'test-openrouter-key',
        openaiApiKey: 'test-openai-key',
        xaiApiKey: 'test-xai-key',
      });

      // When using custom models for each provider
      const customModels = {
        openrouter: 'anthropic/claude-sonnet-4.5',
        openai: 'gpt-5-mini',
        xai: 'grok-4-fast-reasoning',
      };

      // Then all providers should accept optional model parameter
      expect(selector.openrouter!(customModels.openrouter)).toMatchObject({
        modelId: `openrouter:${customModels.openrouter}`,
      });
      expect(selector.openai!(customModels.openai)).toMatchObject({
        modelId: `openai:${customModels.openai}`,
      });
      expect(selector.xai!(customModels.xai)).toMatchObject({
        modelId: `xai:${customModels.xai}`,
      });
    });
  });

  describe('DEFAULT_MODELS', () => {
    it('should export DEFAULT_MODELS constant', () => {
      // Given DEFAULT_MODELS export
      // Then it should have all provider defaults
      expect(DEFAULT_MODELS).toBeDefined();
      expect(DEFAULT_MODELS.openrouter).toBe('anthropic/claude-sonnet-4.5');
      expect(DEFAULT_MODELS.openai).toBe('gpt-5-mini');
      expect(DEFAULT_MODELS.xai).toBe('grok-4-fast-reasoning');
      expect(DEFAULT_MODELS.hyperbolic).toBe('openai/gpt-oss-120b');
    });

    it('should use modern model defaults', () => {
      // Given DEFAULT_MODELS
      // Then models should be modern versions
      expect(DEFAULT_MODELS.openrouter).toContain('claude-sonnet-4.5');
      expect(DEFAULT_MODELS.openai).toContain('gpt-5');
      expect(DEFAULT_MODELS.xai).toContain('grok-4');
      expect(DEFAULT_MODELS.hyperbolic).toContain('gpt-oss-120b');
    });
  });
});

describe('getAvailableProviders', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return all available providers', () => {
    // Given selector with all providers (Hyperbolic disabled)
    const selector = createProviderSelector({
      openRouterApiKey: 'test-openrouter-key',
      openaiApiKey: 'test-openai-key',
      xaiApiKey: 'test-xai-key',
      hyperbolicApiKey: 'test-hyperbolic-key',
    });

    // When getting available providers
    const available = getAvailableProviders(selector);

    // Then all 3 available providers should be returned (Hyperbolic disabled pending AI SDK 5 support)
    expect(available).toEqual(['openrouter', 'openai', 'xai']);
  });

  it('should return only providers with API keys', () => {
    // Given partial configuration
    const selector = createProviderSelector({
      openRouterApiKey: 'test-key',
      xaiApiKey: 'test-key',
    });

    // When getting available providers
    const available = getAvailableProviders(selector);

    // Then only configured providers should be returned
    expect(available).toEqual(['openrouter', 'xai']);
  });

  it('should return empty array when no providers available', () => {
    // Given empty selector
    const selector = createProviderSelector({});

    // When getting available providers
    const available = getAvailableProviders(selector);

    // Then empty array should be returned
    expect(available).toEqual([]);
  });

  it('should return typed union array', () => {
    // Given selector with some providers (Hyperbolic disabled)
    const selector = createProviderSelector({
      openaiApiKey: 'test-key',
    });

    // When getting available providers
    const available = getAvailableProviders(selector);

    // Then result should be typed union of provider names
    expect(available).toEqual(['openai']);
    // TypeScript should enforce this is Array<'openrouter' | 'openai' | 'xai' | 'hyperbolic'>
    const _typeCheck: Array<'openrouter' | 'openai' | 'xai' | 'hyperbolic'> = available;
    expect(_typeCheck).toBeDefined();
  });
});
