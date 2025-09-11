/**
 * In-memory vector store with cosine similarity search
 */

import type { VectorDocument, SearchResult, DocumentChunk } from './types.js';

export class VectorStore {
  private documents: Map<string, VectorDocument> = new Map();
  private documentsByUrl: Map<string, Set<string>> = new Map();

  /**
   * Add a document to the vector store
   */
  add(chunk: DocumentChunk, embedding: number[]): void {
    const doc: VectorDocument = {
      id: chunk.id,
      chunk,
      embedding,
      timestamp: new Date(),
    };

    this.documents.set(chunk.id, doc);

    // Track documents by URL for efficient clearing
    const urlDocs = this.documentsByUrl.get(chunk.metadata.url) || new Set();
    urlDocs.add(chunk.id);
    this.documentsByUrl.set(chunk.metadata.url, urlDocs);
  }

  /**
   * Add multiple documents in batch
   */
  addBatch(chunks: DocumentChunk[], embeddings: Map<string, number[]>): void {
    chunks.forEach(chunk => {
      const embedding = embeddings.get(chunk.id);
      if (embedding) {
        this.add(chunk, embedding);
      }
    });
  }

  /**
   * Search for similar documents using cosine similarity
   */
  search(queryEmbedding: number[], topK: number = 5): SearchResult[] {
    const results: SearchResult[] = [];

    // Calculate similarity for all documents
    for (const doc of this.documents.values()) {
      const score = this.cosineSimilarity(queryEmbedding, doc.embedding);
      results.push({ document: doc, score });
    }

    // Sort by score (descending) and return top K
    return results
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);
  }

  /**
   * Get all documents for a specific URL
   */
  getByUrl(url: string): VectorDocument[] {
    const docIds = this.documentsByUrl.get(url);
    if (!docIds) return [];

    return Array.from(docIds)
      .map(id => this.documents.get(id))
      .filter((doc): doc is VectorDocument => doc !== undefined);
  }

  /**
   * Clear all documents from the store
   */
  clear(): void {
    this.documents.clear();
    this.documentsByUrl.clear();
  }

  /**
   * Clear documents for a specific URL
   */
  clearByUrl(url: string): void {
    const docIds = this.documentsByUrl.get(url);
    if (docIds) {
      docIds.forEach(id => this.documents.delete(id));
      this.documentsByUrl.delete(url);
    }
  }

  /**
   * Get statistics about the vector store
   */
  getStats(): {
    totalDocuments: number;
    totalUrls: number;
    memoryUsageMB: number;
  } {
    const totalDocuments = this.documents.size;
    const totalUrls = this.documentsByUrl.size;
    
    // Rough memory estimation
    // Each embedding is ~1536 floats * 4 bytes = ~6KB
    // Plus metadata overhead ~1KB per document
    const memoryUsageMB = (totalDocuments * 7) / 1024;

    return {
      totalDocuments,
      totalUrls,
      memoryUsageMB: Math.round(memoryUsageMB * 100) / 100,
    };
  }

  /**
   * Get all indexed URLs
   */
  getIndexedUrls(): string[] {
    return Array.from(this.documentsByUrl.keys());
  }

  /**
   * Calculate cosine similarity between two vectors
   */
  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) {
      throw new Error('Vectors must have the same length');
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      const aVal = a[i] ?? 0;
      const bVal = b[i] ?? 0;
      dotProduct += aVal * bVal;
      normA += aVal * aVal;
      normB += bVal * bVal;
    }

    const denominator = Math.sqrt(normA) * Math.sqrt(normB);
    
    // Avoid division by zero
    if (denominator === 0) {
      return 0;
    }

    return dotProduct / denominator;
  }
} 