import { generateText, streamText } from 'ai';
import { describe, it, expect, beforeAll } from 'vitest';

import { createProviderSelector } from '../../src/ai/providers/index.js';

/**
 * Integration tests for Provider Selector
 * Tests real SDK integration with MSW-mocked HTTP responses
 *
 * MSW handlers intercept HTTP calls and return recorded API responses
 * This validates that:
 * - Provider selectors create working LanguageModel instances
 * - SDKs integrate correctly with Vercel AI SDK
 * - Custom models and default models work as expected
 */
describe('Provider Selector Integration', () => {
  // Test API keys - these trigger SDK initialization but HTTP is mocked by MSW
  const testConfig = {
    openRouterApiKey: 'test-openrouter-key',
    openaiApiKey: 'test-openai-key',
    xaiApiKey: 'test-xai-key',
    hyperbolicApiKey: 'test-hyperbolic-key',
  };

  let selector: ReturnType<typeof createProviderSelector>;

  beforeAll(() => {
    // Given provider selector with all test API keys
    selector = createProviderSelector(testConfig);
  });

  describe('OpenRouter provider', () => {
    // TODO: OpenRouter provider emits reasoning-only chunks in this SDK version.
    // The provider enqueues { type: 'text-delta', delta } instead of textDelta and
    // may only send reasoning chunks depending on upstream routing. Revisit when
    // @openrouter/ai-sdk-provider aligns with ai@5 stream part field names.
    it.skip('should perform streaming inference with default model', async () => {
      // Given OpenRouter provider with default model
      const model = selector.openrouter!();

      // When performing streaming inference (MSW intercepts HTTP, returns streaming-simple.json)
      const result = streamText({
        model,
        prompt: 'What is 2+2?',
      });

      // Then stream should complete successfully
      let fullText = '';
      for await (const part of await result.fullStream) {
        if (part.type === 'text-delta' || part.type === 'reasoning-delta') {
          // Support both legacy provider shape (delta) and AI SDK v2 (textDelta)
          fullText +=
            (part as { textDelta?: string }).textDelta ?? (part as { delta?: string }).delta ?? '';
        }
      }

      // Then text should be generated
      expect(fullText.length).toBeGreaterThan(0);
    });

    it('should perform non-streaming inference with default model', async () => {
      // Given OpenRouter provider with default model
      const model = selector.openrouter!();

      // When performing non-streaming inference (MSW intercepts HTTP, returns simple-inference.json)
      const result = await generateText({
        model,
        prompt: 'What is 2+2?',
      });

      // Then inference should complete successfully
      expect(result.text).toBeDefined();
      expect(result.text.length).toBeGreaterThan(0);
    });
  });

  describe('OpenAI provider', () => {
    it('should perform inference with default model', async () => {
      // Given OpenAI provider with default model
      const model = selector.openai!();

      // When performing inference (MSW intercepts HTTP, returns simple-inference.json)
      const result = await generateText({
        model,
        prompt: 'Hello world',
      });

      // Then inference should complete successfully
      expect(result.text).toBeDefined();
      expect(result.text.length).toBeGreaterThan(0);
    });
  });

  describe('xAI provider', () => {
    it('should perform inference with default model', async () => {
      // Given xAI provider with default model
      const model = selector.xai!();

      // When performing inference (MSW intercepts HTTP, returns simple-inference.json)
      const result = await generateText({
        model,
        prompt: 'Hello',
      });

      // Then inference should complete successfully
      expect(result.text).toBeDefined();
      expect(result.text.length).toBeGreaterThan(0);
    });
  });

  describe.skip('Hyperbolic provider - TODO: wait for Hyperbolic to support AI SDK 5', () => {
    // Hyperbolic is currently disabled pending AI SDK 5 support
    // The @hyperbolic/ai-sdk-provider v0.1.3 implements v1 spec, incompatible with AI SDK 5 (v2)

    it('should perform inference with default model', async () => {
      // Given Hyperbolic provider with default model
      const model = selector.hyperbolic!();

      // When performing inference (MSW intercepts HTTP, returns simple-inference.json)
      const result = await generateText({
        model,
        prompt: 'Hello',
      });

      // Then inference should complete successfully
      expect(result.text).toBeDefined();
      expect(result.text.length).toBeGreaterThan(0);
    });
  });

  describe('SDK compatibility', () => {
    it('should return LanguageModel interface for all providers', () => {
      // Given available provider functions (Hyperbolic disabled)
      const openrouterModel = selector.openrouter!();
      const openaiModel = selector.openai!();
      const xaiModel = selector.xai!();

      // Then all should return valid LanguageModel instances
      expect(openrouterModel).toBeDefined();
      expect(openaiModel).toBeDefined();
      expect(xaiModel).toBeDefined();

      // Verify they have the expected LanguageModel interface shape
      expect(typeof openrouterModel).toBe('object');
      expect(typeof openaiModel).toBe('object');
      expect(typeof xaiModel).toBe('object');
    });

    it('should work with Vercel AI SDK generateText', async () => {
      // Given any provider model
      const model = selector.openrouter!();

      // When using with Vercel AI SDK
      const result = await generateText({
        model,
        prompt: 'What is 2+2?',
      });

      // Then it should work without type errors or runtime errors
      expect(result).toBeDefined();
      expect(result.text).toBeDefined();
    });
  });

  describe('error handling', () => {
    it('should handle provider initialization without API keys', () => {
      // Given empty configuration
      const emptySelector = createProviderSelector({});

      // Then no providers should be available
      expect(emptySelector.openrouter).toBeUndefined();
      expect(emptySelector.openai).toBeUndefined();
      expect(emptySelector.xai).toBeUndefined();
      expect(emptySelector.hyperbolic).toBeUndefined();
    });

    it('should handle partial provider configuration', () => {
      // Given configuration with only some providers
      const partialSelector = createProviderSelector({
        openRouterApiKey: 'test-key',
        xaiApiKey: 'test-key',
      });

      // Then only configured providers should be available
      expect(partialSelector.openrouter).toBeDefined();
      expect(partialSelector.openai).toBeUndefined();
      expect(partialSelector.xai).toBeDefined();
      expect(partialSelector.hyperbolic).toBeUndefined();
    });
  });
});
