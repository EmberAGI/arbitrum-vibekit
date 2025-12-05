/**
 * Farcaster API client using Neynar API (free tier available).
 * Farcaster is a decentralized social network protocol.
 */

import fetch from 'node-fetch';
import { getTokenInfo } from '../utils/tokenMapping.js';
import { cache, CACHE_TTL } from '../utils/cache.js';

interface FarcasterCast {
  text: string;
  author: string;
  likes: number;
  recasts: number;
  replies: number;
  timestamp: Date;
  url: string;
  hash: string;
}

/**
 * Search Farcaster for token mentions using Neynar API.
 * Free tier: 1,000 requests/day
 */
export async function searchFarcasterForToken(
  tokenSymbol: string,
  timeRangeHours = 24,
): Promise<{
  casts: FarcasterCast[];
  totalMentions: number;
}> {
  const tokenInfo = getTokenInfo(tokenSymbol);
  const searchTerms = tokenInfo?.searchTerms || [tokenSymbol.toUpperCase()];

  const cacheKey = `farcaster:${tokenSymbol}:${timeRangeHours}`;
  const cached = cache.get<{ casts: FarcasterCast[]; totalMentions: number }>(cacheKey);
  if (cached) {
    return cached;
  }

  const apiKey = process.env['NEYNAR_API_KEY'];
  if (!apiKey) {
    console.error('Neynar API key not configured. Set NEYNAR_API_KEY in .env for Farcaster integration');
    console.error('Current env keys:', Object.keys(process.env).filter(k => k.includes('TWITTER') || k.includes('NEYNAR')));
    return {
      casts: [],
      totalMentions: 0,
    };
  }

  console.error(`Farcaster API: Searching for ${tokenSymbol} with ${searchTerms.length} search terms`);

  const allCasts: FarcasterCast[] = [];

  for (const searchQuery of searchTerms) {
    try {
      // Neynar API v2: Search casts - using the correct endpoint
      // Try multiple search approaches
      const searchQueries = [
        searchQuery,
        `$${searchQuery}`,
        `#${searchQuery}`,
      ];

      for (const query of searchQueries) {
        try {
          // Neynar API v2 search endpoint
          const url = new URL('https://api.neynar.com/v2/farcaster/cast/search');
          url.searchParams.set('q', query);
          url.searchParams.set('limit', '25');

          console.error(`Farcaster: Searching for "${query}"`);

          const response = await fetch(url.toString(), {
            headers: {
              'api-key': apiKey,
              'Content-Type': 'application/json',
            },
          });

          if (!response.ok) {
            const errorText = await response.text().catch(() => '');
            console.error(`Farcaster API error for "${query}": ${response.status} ${response.statusText}`, errorText.substring(0, 300));
            if (response.status === 429) {
              console.error('Neynar API rate limit reached');
              await new Promise((resolve) => setTimeout(resolve, 5000));
            } else if (response.status === 401 || response.status === 403) {
              console.error('Neynar API authentication failed - check your API key');
              console.error('API Key format check:', apiKey.substring(0, 10) + '...');
            }
            continue;
          }

          const data = (await response.json()) as {
            result?: {
              casts?: Array<{
                hash: string;
                text: string;
                author?: { username?: string };
                reactions?: { likes?: Array<unknown>; recasts?: Array<unknown> };
                replies?: { count?: number };
                timestamp: string;
              }>;
            };
            casts?: Array<{
              hash: string;
              text: string;
              author?: { username?: string };
              reactions?: { likes?: Array<unknown>; recasts?: Array<unknown> };
              replies?: { count?: number };
              timestamp: string;
            }>;
          };

          // Handle different response structures
          const casts = data.result?.casts || data.casts || [];

          console.error(`Farcaster: Found ${casts.length} casts for "${query}"`);

          const timeLimit = new Date(Date.now() - timeRangeHours * 60 * 60 * 1000);

          for (const cast of casts) {
            const castDate = new Date(cast.timestamp);
            if (castDate < timeLimit) {
              continue;
            }

            // Avoid duplicates
            if (allCasts.some((c) => c.hash === cast.hash)) {
              continue;
            }

            allCasts.push({
              text: cast.text,
              author: cast.author?.username || 'unknown',
              likes: cast.reactions?.likes?.length || 0,
              recasts: cast.reactions?.recasts?.length || 0,
              replies: cast.replies?.count || 0,
              timestamp: castDate,
              url: `https://warpcast.com/${cast.author?.username || 'unknown'}/${cast.hash}`,
              hash: cast.hash,
            });
          }

          // Rate limiting between queries
          await new Promise((resolve) => setTimeout(resolve, 1000));
        } catch (error) {
          console.error(`Error searching Farcaster for "${query}":`, error);
        }
      }

      // Rate limiting between search terms
      await new Promise((resolve) => setTimeout(resolve, 1000));
    } catch (error) {
      console.error(`Error searching Farcaster for ${searchQuery}:`, error);
    }
  }

  console.error(`Farcaster: Total casts found: ${allCasts.length}`);

  // Sort by engagement (likes + recasts + replies)
  const sorted = allCasts.sort((a, b) => {
    const engagementA = a.likes + a.recasts * 2 + a.replies * 1.5;
    const engagementB = b.likes + b.recasts * 2 + b.replies * 1.5;
    return engagementB - engagementA;
  });

  const result = {
    casts: sorted,
    totalMentions: sorted.length,
  };

  cache.set(cacheKey, result, CACHE_TTL.SENTIMENT);
  return result;
}

