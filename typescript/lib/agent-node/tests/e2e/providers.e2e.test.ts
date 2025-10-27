import { generateText } from 'ai';
import { describe, it, expect, beforeAll } from 'vitest';

import { createProviderSelector } from '../../src/ai/providers/index.js';

/**
 * E2E tests for AI providers using generateText
 * Tests real provider APIs with actual API keys
 *
 * These are smoke tests to verify each provider integration works end-to-end
 * Tests fail if API keys are missing (not skipped)
 */
describe('Provider E2E Tests', () => {
  let selector: ReturnType<typeof createProviderSelector>;

  beforeAll(() => {
    // Given provider selector with API keys from environment
    const config = {
      openRouterApiKey: process.env['OPENROUTER_API_KEY'],
      openaiApiKey: process.env['OPENAI_API_KEY'],
      xaiApiKey: process.env['XAI_API_KEY'],
      hyperbolicApiKey: process.env['HYPERBOLIC_API_KEY'],
    };

    selector = createProviderSelector(config);
  });

  describe('OpenRouter provider', () => {
    it('should perform generateText with real API', async () => {
      // Given OpenRouter API key is configured
      if (!process.env['OPENROUTER_API_KEY']) {
        throw new Error('OPENROUTER_API_KEY is required for e2e tests');
      }

      // When performing generateText with default model
      const model = selector.openrouter!();
      const result = await generateText({
        model,
        prompt: 'What is 2+2?',
      });

      // Then response should contain text
      expect(result.text).toBeDefined();
      expect(result.text.length).toBeGreaterThan(0);
    });
  });

  describe('OpenAI provider', () => {
    it('should perform generateText with real API', async () => {
      // Given OpenAI API key is configured
      if (!process.env['OPENAI_API_KEY']) {
        throw new Error('OPENAI_API_KEY is required for e2e tests');
      }

      // When performing generateText with default model
      const model = selector.openai!();
      const result = await generateText({
        model,
        prompt: 'What is 2+2?',
      });

      // Then response should contain text
      expect(result.text).toBeDefined();
      expect(result.text.length).toBeGreaterThan(0);
    }, 10000);
  });

  describe('xAI provider', () => {
    it('should perform generateText with real API', async () => {
      // Given xAI API key is configured
      if (!process.env['XAI_API_KEY']) {
        throw new Error('XAI_API_KEY is required for e2e tests');
      }

      // When performing generateText with default model
      const model = selector.xai!();
      const result = await generateText({
        model,
        prompt: 'What is 2+2?',
      });

      // Then response should contain text
      expect(result.text).toBeDefined();
      expect(result.text.length).toBeGreaterThan(0);
    }, 10000); // 10 second timeout for slower xAI API responses
  });

  describe.todo('Hyperbolic provider - TODO: wait for Hyperbolic to support AI SDK 5', () => {
    it('should perform generateText with real API', async () => {
      // Given Hyperbolic API key is configured
      if (!process.env['HYPERBOLIC_API_KEY']) {
        throw new Error('HYPERBOLIC_API_KEY is required for e2e tests');
      }

      // When performing generateText with default model
      const model = selector.hyperbolic!();
      const result = await generateText({
        model,
        prompt: 'What is 2+2?',
      });

      // Then response should contain text
      expect(result.text).toBeDefined();
      expect(result.text.length).toBeGreaterThan(0);
    });
  });
});
