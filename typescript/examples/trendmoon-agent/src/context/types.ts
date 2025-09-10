/**
 * Context types for Trendmoon Agent
 * Demonstrates custom context with type safety
 */

export interface TrendmoonContext {
  // When the context was loaded
  loadedAt: Date;

  // Cached categories and platforms
  categories: string[];
  platforms: string[];

  // Additional metadata
  metadata: {
    mcpServersConnected: number;
    environment: string;
    cacheLastUpdated: Date;
  };
}
