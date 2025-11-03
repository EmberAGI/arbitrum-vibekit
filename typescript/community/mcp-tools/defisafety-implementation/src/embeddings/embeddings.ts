/**
 * Embeddings generator using provider selector utility
 */

import { embedMany, embed } from 'ai';
import { createProviderSelector, getAvailableProviders } from '@emberai/arbitrum-vibekit-core';
import type { EmbeddingModel } from 'ai';
import type { DocumentChunk, EmbeddingOptions } from './types.js';

export class EmbeddingsGenerator {
  private embeddingModel: EmbeddingModel<string> | null = null;
  private options: Required<EmbeddingOptions>;

  constructor(options?: EmbeddingOptions) {
    this.options = {
      model: options?.model || 'text-embedding-ada-002',
      batchSize: options?.batchSize || 20,
    };
  }

  /**
   * Initialize the embedding model using provider selector
   * Returns true if successful, false if no providers are available
   */
  async initialize(): Promise<boolean> {
    // Create provider selector with available API keys
    const providers = createProviderSelector({
      openRouterApiKey: process.env['OPENROUTER_API_KEY'],
      openaiApiKey: process.env['OPENAI_API_KEY'],
      xaiApiKey: process.env['XAI_API_KEY'],
      hyperbolicApiKey: process.env['HYPERBOLIC_API_KEY'],
    });

    // Get available providers
    const availableProviders = getAvailableProviders(providers);
    if (availableProviders.length === 0) {
      console.warn('No AI providers configured. Please set at least one provider API key.');
      return false;
    }

    // Use AI_PROVIDER env var or fallback to first available
    const preferredProvider = process.env['AI_PROVIDER'] || availableProviders[0]!;
    const selectedProvider = providers[preferredProvider as keyof typeof providers];
    if (!selectedProvider) {
      console.warn(`Preferred provider '${preferredProvider}' not available.`);
      return false;
    }

    // Get embedding model - OpenAI provider has embedding support
    // For now, we'll use the text generation model as a fallback
    // In production, you'd want to use a proper embedding model
    const modelOverride = process.env['AI_EMBEDDING_MODEL'] || this.options.model;

    // Note: The AI SDK's embedding functionality requires specific embedding models
    // For now, we'll need to use OpenAI directly for embeddings
    // This is a temporary limitation until provider selector supports embeddings
    if (process.env['OPENAI_API_KEY']) {
      try {
        // Dynamic import for OpenAI SDK
        const { createOpenAI } = await import('@ai-sdk/openai');
        const openai = createOpenAI({ apiKey: process.env['OPENAI_API_KEY'] });
        this.embeddingModel = openai.embedding(modelOverride) as unknown as EmbeddingModel<string>;
        return true;
      } catch (error) {
        console.error('Failed to create OpenAI embedding model:', error);
        console.warn('Note: Make sure @ai-sdk/openai is installed for embedding support.');
        return false;
      }
    } else {
      console.warn('Embedding models currently require OPENAI_API_KEY.');
      console.warn('Please set OPENAI_API_KEY to use embeddings.');
      return false;
    }
  }

  /**
   * Generate embeddings for a batch of document chunks
   */
  async generateEmbeddings(chunks: DocumentChunk[]): Promise<Map<string, number[]>> {
    if (!this.embeddingModel) {
      throw new Error('EmbeddingsGenerator not initialized. Call initialize() first.');
    }

    const embeddings = new Map<string, number[]>();

    // Process in batches to avoid rate limits
    for (let i = 0; i < chunks.length; i += this.options.batchSize) {
      const batch = chunks.slice(i, i + this.options.batchSize);

      try {
        // Use embedMany from the AI SDK
        const { embeddings: batchEmbeddings } = await embedMany({
          model: this.embeddingModel,
          values: batch.map(chunk => chunk.content),
        });

        // Map embeddings back to chunk IDs
        batch.forEach((chunk, index) => {
          const embedding = batchEmbeddings[index];
          if (embedding) {
            embeddings.set(chunk.id, embedding);
          }
        });

        // Add a small delay to avoid rate limits
        if (i + this.options.batchSize < chunks.length) {
          await this.delay(100); // 100ms delay between batches
        }
      } catch (error) {
        // Log to stderr for debugging (won't contaminate MCP protocol)
        console.error(
          `Embedding generation failed for batch ${Math.floor(i / this.options.batchSize) + 1}:`,
          error instanceof Error ? error.message : String(error)
        );
        // Continue with other batches even if one fails
      }
    }

    return embeddings;
  }

  /**
   * Generate embedding for a single text (typically a query)
   */
  async generateSingleEmbedding(text: string): Promise<number[] | null> {
    if (!this.embeddingModel) {
      throw new Error('EmbeddingsGenerator not initialized. Call initialize() first.');
    }

    try {
      // Use embed from the AI SDK
      const { embedding } = await embed({
        model: this.embeddingModel,
        value: text,
      });

      return embedding || null;
    } catch (error) {
      // Log to stderr for debugging (won't contaminate MCP protocol)
      console.error(
        `Single embedding generation failed:`,
        error instanceof Error ? error.message : String(error)
      );
      return null;
    }
  }

  /**
   * Estimate the cost of generating embeddings for the given chunks
   */
  estimateCost(chunks: DocumentChunk[]): { tokens: number; estimatedCost: number } {
    // Rough estimation: 1 token ≈ 4 characters for English text
    const totalCharacters = chunks.reduce((sum, chunk) => sum + chunk.content.length, 0);
    const estimatedTokens = Math.ceil(totalCharacters / 4);

    // Ada-002 pricing: $0.0001 per 1K tokens
    const costPer1KTokens = 0.0001;
    const estimatedCost = (estimatedTokens / 1000) * costPer1KTokens;

    return {
      tokens: estimatedTokens,
      estimatedCost: estimatedCost,
    };
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
