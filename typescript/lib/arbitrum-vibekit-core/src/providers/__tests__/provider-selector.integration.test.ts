import { describe, it, expect, beforeAll } from 'vitest';
import { createProviderSelector, getAvailableProviders } from '../provider-selector.js';
import type { LanguageModelV1 } from 'ai';

// Get API keys from environment
// Vitest will automatically load .env.test based on the config
const API_KEYS = {
  openRouterApiKey: process.env.OPENROUTER_API_KEY,
  openaiApiKey: process.env.OPENAI_API_KEY,
  xaiApiKey: process.env.XAI_API_KEY,
  hyperbolicApiKey: process.env.HYPERBOLIC_API_KEY,
};

// Check which providers we can test
const hasOpenRouter = !!API_KEYS.openRouterApiKey;
const hasOpenAI = !!API_KEYS.openaiApiKey;
const hasXai = !!API_KEYS.xaiApiKey;
const hasHyperbolic = !!API_KEYS.hyperbolicApiKey;
const hasAnyKey = hasOpenRouter || hasOpenAI || hasXai || hasHyperbolic;

// Skip all integration tests if no API keys are available
describe.skipIf(!hasAnyKey)('Provider Selector Integration Tests', () => {
  beforeAll(() => {
    if (!hasAnyKey) {
      console.log(
        'No API keys found. Set OPENROUTER_API_KEY, OPENAI_API_KEY, XAI_API_KEY, or HYPERBOLIC_API_KEY to run integration tests.'
      );
    }
  });

  it('should create real provider instances with valid API keys', () => {
    const selector = createProviderSelector(API_KEYS);
    const available = getAvailableProviders(selector);

    // Check that we got the providers we expect based on API keys
    if (hasOpenRouter) {
      expect(available).toContain('openrouter');
      expect(selector.openrouter).toBeDefined();
    }
    if (hasOpenAI) {
      expect(available).toContain('openai');
      expect(selector.openai).toBeDefined();
    }
    if (hasXai) {
      expect(available).toContain('xai');
      expect(selector.xai).toBeDefined();
    }
    if (hasHyperbolic) {
      expect(available).toContain('hyperbolic');
      expect(selector.hyperbolic).toBeDefined();
    }

    // Ensure we don't have providers without API keys
    if (!hasOpenRouter) {
      expect(selector.openrouter).toBeUndefined();
    }
    if (!hasOpenAI) {
      expect(selector.openai).toBeUndefined();
    }
    if (!hasXai) {
      expect(selector.xai).toBeUndefined();
    }
    if (!hasHyperbolic) {
      expect(selector.hyperbolic).toBeUndefined();
    }
  });

  it.skipIf(!hasOpenRouter)('should create a valid OpenRouter model instance', () => {
    const selector = createProviderSelector({ openRouterApiKey: API_KEYS.openRouterApiKey! });
    const model = selector.openrouter!('openai/gpt-4.1-nano');

    // Verify it's a valid LanguageModelV1 instance
    expect(model).toBeDefined();
    expect(model).toHaveProperty('modelId');
    expect(model).toHaveProperty('provider');
    expect(model).toHaveProperty('doGenerate');

    // Check specific properties
    expect(model.modelId).toBe('openai/gpt-4.1-nano');
    expect(model.provider).toBe('openrouter.chat');
  });

  it.skipIf(!hasOpenAI)('should create a valid OpenAI model instance', () => {
    const selector = createProviderSelector({ openaiApiKey: API_KEYS.openaiApiKey! });
    const model = selector.openai!('gpt-4.1-nano');

    // Verify it's a valid LanguageModelV1 instance
    expect(model).toBeDefined();
    expect(model).toHaveProperty('modelId');
    expect(model).toHaveProperty('provider');
    expect(model).toHaveProperty('doGenerate');

    // Check specific properties
    expect(model.modelId).toBe('gpt-4.1-nano');
    expect(model.provider).toBe('openai.chat');
  });

  it.skipIf(!hasXai)('should create a valid xAI model instance', () => {
    const selector = createProviderSelector({ xaiApiKey: API_KEYS.xaiApiKey! });
    const model = selector.xai!('grok-3-mini');

    // Verify it's a valid LanguageModelV1 instance
    expect(model).toBeDefined();
    expect(model).toHaveProperty('modelId');
    expect(model).toHaveProperty('provider');
    expect(model).toHaveProperty('doGenerate');

    // Check specific properties
    expect(model.modelId).toBe('grok-3-mini');
    expect(model.provider).toBe('xai.chat');
  });

  it.skipIf(!hasHyperbolic)('should create a valid Hyperbolic model instance', () => {
    const selector = createProviderSelector({ hyperbolicApiKey: API_KEYS.hyperbolicApiKey! });
    const model = selector.hyperbolic!('meta-llama/Llama-3.2-3B-Instruct');

    // Verify it's a valid LanguageModelV1 instance
    expect(model).toBeDefined();
    expect(model).toHaveProperty('modelId');
    expect(model).toHaveProperty('provider');
    expect(model).toHaveProperty('doGenerate');

    // Check specific properties
    expect(model.modelId).toBe('meta-llama/Llama-3.2-3B-Instruct');
    expect(model.provider).toBe('hyperbolic.chat');
  });

  it('should handle mixed valid and invalid API keys', () => {
    // Create selector with at least one valid key and one invalid
    const mixedKeys = {
      openRouterApiKey: hasOpenRouter ? API_KEYS.openRouterApiKey : 'invalid-key',
      openaiApiKey: hasOpenAI ? API_KEYS.openaiApiKey : undefined,
      xaiApiKey: hasXai ? API_KEYS.xaiApiKey : undefined,
      hyperbolicApiKey: hasHyperbolic ? API_KEYS.hyperbolicApiKey : undefined,
    };

    const selector = createProviderSelector(mixedKeys);
    const available = getAvailableProviders(selector);

    // Should still create providers for valid keys
    if (hasOpenRouter) {
      expect(available).toContain('openrouter');
    }
    if (hasOpenAI) {
      expect(available).toContain('openai');
    }
    if (hasXai) {
      expect(available).toContain('xai');
    }
    if (hasHyperbolic) {
      expect(available).toContain('hyperbolic');
    }
  });

  it.skipIf(!hasOpenRouter)(
    'should successfully call OpenRouter API',
    async () => {
      const selector = createProviderSelector({ openRouterApiKey: API_KEYS.openRouterApiKey! });
      const model = selector.openrouter!('openai/gpt-4.1-nano');

      // Make a minimal API call
      const result = await model.doGenerate({
        inputFormat: 'messages',
        mode: { type: 'regular' },
        prompt: [{ role: 'user', content: [{ type: 'text', text: 'Say "test"' }] }],
        maxTokens: 5,
      });

      expect(result).toBeDefined();
      expect(result.text).toBeDefined();
      expect(typeof result.text).toBe('string');
    },
    30000
  );

  it.skipIf(!hasOpenAI)(
    'should successfully call OpenAI API',
    async () => {
      const selector = createProviderSelector({ openaiApiKey: API_KEYS.openaiApiKey! });
      const model = selector.openai!('gpt-4.1-nano');

      // Make a minimal API call
      const result = await model.doGenerate({
        inputFormat: 'messages',
        mode: { type: 'regular' },
        prompt: [{ role: 'user', content: [{ type: 'text', text: 'Say "test"' }] }],
        maxTokens: 5,
      });

      expect(result).toBeDefined();
      expect(result.text).toBeDefined();
      expect(typeof result.text).toBe('string');
    },
    30000
  );

  it.skipIf(!hasXai)(
    'should successfully call xAI API',
    async () => {
      const selector = createProviderSelector({ xaiApiKey: API_KEYS.xaiApiKey! });
      const model = selector.xai!('grok-3-mini');

      // Make a minimal API call
      const result = await model.doGenerate({
        inputFormat: 'messages',
        mode: { type: 'regular' },
        prompt: [{ role: 'user', content: [{ type: 'text', text: 'Say "test"' }] }],
        maxTokens: 5,
      });

      expect(result).toBeDefined();
      expect(result.text).toBeDefined();
      expect(typeof result.text).toBe('string');
    },
    30000
  );

  it.skipIf(!hasHyperbolic)(
    'should successfully call Hyperbolic API',
    async () => {
      const selector = createProviderSelector({ hyperbolicApiKey: API_KEYS.hyperbolicApiKey! });
      const model = selector.hyperbolic!('meta-llama/Llama-3.2-3B-Instruct');

      // Make a minimal API call
      const result = await model.doGenerate({
        inputFormat: 'messages',
        mode: { type: 'regular' },
        prompt: [{ role: 'user', content: [{ type: 'text', text: 'Say "test"' }] }],
        maxTokens: 5,
      });

      expect(result).toBeDefined();
      expect(result.text).toBeDefined();
      expect(typeof result.text).toBe('string');
    },
    30000
  );
});
