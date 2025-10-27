/**
 * Simple document chunker for creating embeddings
 */

import type { DocumentChunk, ChunkingOptions } from './types.js';

export class DocumentChunker {
  private options: Required<ChunkingOptions>;

  constructor(options: ChunkingOptions) {
    this.options = {
      maxChunkSize: options.maxChunkSize,
      overlapSize: options.overlapSize,
      minChunkSize: options.minChunkSize || 100,
    };
  }

  /**
   * Chunk a document into smaller pieces suitable for embedding
   */
  chunk(content: string, metadata: { url: string; title: string }): DocumentChunk[] {
    const chunks: DocumentChunk[] = [];
    
    // Clean and normalize the content
    const cleanedContent = this.cleanContent(content);
    
    // Split by paragraphs first
    const paragraphs = this.splitByParagraphs(cleanedContent);
    
    // Combine or split paragraphs to create chunks of appropriate size
    const rawChunks = this.createChunks(paragraphs);
    
    // Create DocumentChunk objects with metadata
    rawChunks.forEach((chunkContent, index) => {
      chunks.push({
        id: `${metadata.url}#chunk-${index}`,
        content: chunkContent,
        metadata: {
          url: metadata.url,
          title: metadata.title,
          chunkIndex: index,
          totalChunks: rawChunks.length,
        },
      });
    });
    
    return chunks;
  }

  private cleanContent(content: string): string {
    return content
      .replace(/\s+/g, ' ') // Normalize whitespace
      .replace(/\n{3,}/g, '\n\n') // Limit consecutive newlines
      .trim();
  }

  private splitByParagraphs(content: string): string[] {
    // Split by double newlines or common paragraph markers
    const paragraphs = content.split(/\n\n+|\r\n\r\n+/);
    
    // Filter out empty paragraphs and trim
    return paragraphs
      .map(p => p.trim())
      .filter(p => p.length > 0);
  }

  private createChunks(paragraphs: string[]): string[] {
    const chunks: string[] = [];
    let currentChunk = '';
    
    for (const paragraph of paragraphs) {
      // If paragraph is too large, split it
      if (paragraph.length > this.options.maxChunkSize) {
        // Save current chunk if it exists
        if (currentChunk.length >= this.options.minChunkSize) {
          chunks.push(currentChunk.trim());
          currentChunk = '';
        }
        
        // Split large paragraph by sentences
        const sentences = this.splitBySentences(paragraph);
        for (const sentence of sentences) {
          if (currentChunk.length + sentence.length > this.options.maxChunkSize) {
            if (currentChunk.length >= this.options.minChunkSize) {
              chunks.push(currentChunk.trim());
              // Start new chunk with overlap from previous
              currentChunk = this.getOverlap(currentChunk) + sentence;
            } else {
              currentChunk += ' ' + sentence;
            }
          } else {
            currentChunk += (currentChunk ? ' ' : '') + sentence;
          }
        }
      } else {
        // Check if adding this paragraph would exceed max size
        if (currentChunk.length + paragraph.length > this.options.maxChunkSize) {
          // Save current chunk
          if (currentChunk.length >= this.options.minChunkSize) {
            chunks.push(currentChunk.trim());
            // Start new chunk with overlap
            currentChunk = this.getOverlap(currentChunk) + paragraph;
          } else {
            currentChunk += '\n\n' + paragraph;
          }
        } else {
          // Add paragraph to current chunk
          currentChunk += (currentChunk ? '\n\n' : '') + paragraph;
        }
      }
    }
    
    // Don't forget the last chunk
    if (currentChunk.length >= this.options.minChunkSize) {
      chunks.push(currentChunk.trim());
    }
    
    return chunks;
  }

  private splitBySentences(text: string): string[] {
    // Simple sentence splitting - can be improved
    const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
    return sentences.map(s => s.trim());
  }

  private getOverlap(chunk: string): string {
    if (this.options.overlapSize === 0) {
      return '';
    }
    
    // Get last N characters as overlap
    const overlap = chunk.slice(-this.options.overlapSize);
    
    // Try to find a word boundary to avoid cutting words
    const lastSpace = overlap.lastIndexOf(' ');
    if (lastSpace > overlap.length / 2) {
      return overlap.slice(lastSpace + 1) + ' ';
    }
    
    return overlap + ' ';
  }
} 