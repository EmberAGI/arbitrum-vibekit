/**
 * Simple in-memory cache for API responses
 * TODO: Replace with Redis or similar for production
 */

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number; // Time to live in milliseconds
}

class SimpleCache {
  private cache = new Map<string, CacheEntry<unknown>>();

  /**
   * Get cached value if not expired
   */
  get<T>(key: string): T | null {
    const entry = this.cache.get(key) as CacheEntry<T> | undefined;
    if (!entry) {
      return null;
    }

    const now = Date.now();
    if (now - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      return null;
    }

    return entry.data;
  }

  /**
   * Set cache value with TTL
   */
  set<T>(key: string, data: T, ttlMs: number): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl: ttlMs,
    });
  }

  /**
   * Clear expired entries
   */
  clearExpired(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > entry.ttl) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Clear all cache
   */
  clear(): void {
    this.cache.clear();
  }
}

// Cache TTL constants (in milliseconds)
export const CACHE_TTL = {
  SENTIMENT: 5 * 60 * 1000, // 5 minutes
  INFLUENCER_WALLET: 60 * 60 * 1000, // 1 hour
  HISTORICAL_DATA: 24 * 60 * 60 * 1000, // 24 hours
  MOMENTUM_SCORE: 5 * 60 * 1000, // 5 minutes
} as const;

export const cache = new SimpleCache();

// Clean up expired entries every 10 minutes
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    cache.clearExpired();
  }, 10 * 60 * 1000);
}

