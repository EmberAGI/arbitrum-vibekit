/**
 * Twitter/X API client using free tier or public endpoints.
 * Free tier: Using public search endpoints (no auth required for basic searches).
 * For production, consider Twitter API v2 with Bearer token.
 */

import fetch from 'node-fetch';
import { getTokenInfo } from '../utils/tokenMapping.js';
import { cache, CACHE_TTL } from '../utils/cache.js';

interface TwitterPost {
  text: string;
  author: string;
  likes: number;
  retweets: number;
  timestamp: Date;
  url: string;
}

/**
 * Search Twitter/X for token mentions using public search (no auth required).
 * Note: This uses a simple approach. For production, use Twitter API v2 with Bearer token.
 */
export async function searchTwitterForToken(
  tokenSymbol: string,
  timeRangeHours = 24,
): Promise<{
  posts: TwitterPost[];
  totalMentions: number;
}> {
  const tokenInfo = getTokenInfo(tokenSymbol);
  const searchTerms = tokenInfo?.searchTerms || [tokenSymbol.toUpperCase()];

  const cacheKey = `twitter:${tokenSymbol}:${timeRangeHours}`;
  const cached = cache.get<{ posts: TwitterPost[]; totalMentions: number }>(cacheKey);
  if (cached) {
    return cached;
  }

  const allPosts: TwitterPost[] = [];

  // For MVP, we'll use a simple approach: search via public endpoints
  // In production, use Twitter API v2 with Bearer token
  // For now, return empty results and log that Twitter integration needs API key
  const apiKey = process.env['TWITTER_BEARER_TOKEN'];

  if (!apiKey) {
    console.error('Twitter API key not configured. Set TWITTER_BEARER_TOKEN in .env');
    console.error('Current env keys:', Object.keys(process.env).filter(k => k.includes('TWITTER') || k.includes('NEYNAR')));
    // Return empty results for now
    return {
      posts: [],
      totalMentions: 0,
    };
  }

  console.error(`Twitter API: Searching for ${tokenSymbol} with ${searchTerms.length} search terms`);

  // Twitter API v2 search implementation
  for (const searchQuery of searchTerms) {
    try {
      // Build query: token symbol + crypto keywords
      const query = `${searchQuery} (crypto OR defi OR blockchain OR ethereum OR bitcoin) -is:retweet lang:en`;
      const url = new URL('https://api.twitter.com/2/tweets/search/recent');
      url.searchParams.set('query', query);
      url.searchParams.set('max_results', '10');
      url.searchParams.set('tweet.fields', 'created_at,public_metrics,author_id');
      url.searchParams.set('expansions', 'author_id');
      url.searchParams.set('user.fields', 'username');

      const response = await fetch(url.toString(), {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'User-Agent': 'social-sentiment-mcp/1.0.0',
        },
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        console.error(`Twitter API error: ${response.status} ${response.statusText}`, errorText.substring(0, 200));
        if (response.status === 429) {
          console.error('Twitter API rate limit reached');
          await new Promise((resolve) => setTimeout(resolve, 5000));
        } else if (response.status === 401) {
          console.error('Twitter API authentication failed - check your Bearer Token');
        }
        continue;
      }

      const data = (await response.json()) as {
        data?: Array<{
          id: string;
          text: string;
          created_at: string;
          public_metrics?: { like_count?: number; retweet_count?: number };
          author_id?: string;
        }>;
        includes?: {
          users?: Array<{ id: string; username: string }>;
        };
      };

      const tweets = data.data || [];
      const users = data.includes?.users || [];
      const userMap = new Map(users.map((u) => [u.id, u.username]));

      const timeLimit = new Date(Date.now() - timeRangeHours * 60 * 60 * 1000);

      for (const tweet of tweets) {
        const tweetDate = new Date(tweet.created_at);
        if (tweetDate < timeLimit) {
          continue;
        }

        const authorId = tweet.author_id || '';
        const username = userMap.get(authorId) || 'unknown';

        allPosts.push({
          text: tweet.text,
          author: username,
          likes: tweet.public_metrics?.like_count || 0,
          retweets: tweet.public_metrics?.retweet_count || 0,
          timestamp: tweetDate,
          url: `https://twitter.com/${username}/status/${tweet.id}`,
        });
      }

      // Rate limiting
      await new Promise((resolve) => setTimeout(resolve, 1000));
    } catch (error) {
      console.error(`Error searching Twitter for ${searchQuery}:`, error);
    }
  }

  // Sort by engagement (likes + retweets)
  const sorted = allPosts.sort((a, b) => {
    const engagementA = a.likes + a.retweets * 2;
    const engagementB = b.likes + b.retweets * 2;
    return engagementB - engagementA;
  });

  const result = {
    posts: sorted,
    totalMentions: sorted.length,
  };

  cache.set(cacheKey, result, CACHE_TTL.SENTIMENT);
  return result;
}

