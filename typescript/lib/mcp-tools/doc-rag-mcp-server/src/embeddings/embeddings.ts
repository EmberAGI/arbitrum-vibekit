/**
 * Embeddings generator using OpenAI API
 */

import OpenAI from 'openai';
import type { DocumentChunk, EmbeddingOptions } from './types.js';

export class EmbeddingsGenerator {
  private openai: OpenAI | null = null;
  private options: Required<EmbeddingOptions>;

  constructor(options?: EmbeddingOptions) {
    this.options = {
      model: options?.model || 'text-embedding-ada-002',
      batchSize: options?.batchSize || 20,
    };
  }

  /**
   * Initialize the OpenAI client
   * Returns true if successful, false if API key is not available
   */
  initialize(): boolean {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      console.warn('OPENAI_API_KEY not found in environment variables');
      return false;
    }

    this.openai = new OpenAI({ apiKey });
    return true;
  }

  /**
   * Generate embeddings for a batch of document chunks
   */
  async generateEmbeddings(chunks: DocumentChunk[]): Promise<Map<string, number[]>> {
    if (!this.openai) {
      throw new Error('EmbeddingsGenerator not initialized. Call initialize() first.');
    }

    const embeddings = new Map<string, number[]>();

    // Process in batches to avoid rate limits
    for (let i = 0; i < chunks.length; i += this.options.batchSize) {
      const batch = chunks.slice(i, i + this.options.batchSize);

      try {
        const response = await this.openai.embeddings.create({
          model: this.options.model,
          input: batch.map(chunk => chunk.content),
        });

        // Map embeddings back to chunk IDs
        batch.forEach((chunk, index) => {
          const embedding = response.data[index]?.embedding;
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
    if (!this.openai) {
      throw new Error('EmbeddingsGenerator not initialized. Call initialize() first.');
    }

    try {
      const response = await this.openai.embeddings.create({
        model: this.options.model,
        input: text,
      });

      return response.data[0]?.embedding || null;
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
