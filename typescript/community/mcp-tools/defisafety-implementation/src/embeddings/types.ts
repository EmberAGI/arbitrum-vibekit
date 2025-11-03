/**
 * Types for the embeddings module
 */

export interface DocumentChunk {
  id: string;
  content: string;
  metadata: {
    url: string;
    title: string;
    chunkIndex: number;
    totalChunks: number;
  };
}

export interface VectorDocument {
  id: string;
  chunk: DocumentChunk;
  embedding: number[];
  timestamp: Date;
}

export interface SearchResult {
  document: VectorDocument;
  score: number;
}

export interface ChunkingOptions {
  maxChunkSize: number;
  overlapSize: number;
  minChunkSize?: number;
}

export interface EmbeddingOptions {
  model?: string;
  batchSize?: number;
} 