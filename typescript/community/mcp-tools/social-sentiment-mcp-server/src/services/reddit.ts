/**
 * Reddit API client using public JSON endpoints (no OAuth).
 * Free tier: ~10 requests/minute per IP.
 *
 * We intentionally avoid OAuth here to keep setup simple and stay within Reddit's
 * free tier limits. For more advanced use, this can be upgraded to OAuth.
 */

import fetch from 'node-fetch';
import { getTokenInfo, type TokenInfo } from '../utils/tokenMapping.js';

const CRYPTO_SUBREDDITS = ['cryptocurrency', 'ethereum', 'defi', 'CryptoCurrency', 'ethtrader', 'Arbitrum', 'optimismEthereum', '0xPolygon'] as const;

/**
 * Check if a post is relevant to the token (filters out false positives)
 * VERY lenient filtering - we want to catch real posts. Only exclude obvious false positives.
 */
function isRelevantPost(post: { title: string; content: string }, tokenInfo: TokenInfo | null): boolean {
  const text = `${post.title} ${post.content}`.toLowerCase();
  const symbol = tokenInfo?.symbol.toLowerCase() || '';
  const tokenName = tokenInfo?.name.toLowerCase() || '';

  // If no token info, be very lenient - just check if symbol appears
  if (!tokenInfo) {
    return text.includes(symbol.toLowerCase());
  }

  // STRICT exclude: Only exclude if exclude term appears AND token symbol/name doesn't appear at all
  if (tokenInfo.excludeTerms && tokenInfo.excludeTerms.length > 0) {
    let hasExcludeTerm = false;
    let hasTokenMention = false;

    for (const exclude of tokenInfo.excludeTerms) {
      if (text.includes(exclude.toLowerCase())) {
        hasExcludeTerm = true;
        break;
      }
    }

    // Check if token symbol or name appears
    if (symbol && text.includes(symbol)) {
      hasTokenMention = true;
    }
    if (tokenName && text.includes(tokenName)) {
      hasTokenMention = true;
    }

    // Only exclude if exclude term appears BUT token doesn't appear
    if (hasExcludeTerm && !hasTokenMention) {
      return false;
    }
  }

  // Must contain the token symbol OR token name (very lenient)
  if (symbol && !text.includes(symbol) && (!tokenName || !text.includes(tokenName))) {
    return false;
  }

  // For very short symbols (2-3 chars), be EXTRA lenient
  // Only exclude if it's clearly not crypto-related AND token name doesn't appear
  if (symbol.length <= 3) {
    const cryptoKeywords = [
      'token', 'coin', 'crypto', 'defi', 'blockchain', 'price', 'trading', 'buy', 'sell', 'hold',
      'ethereum', 'bitcoin', 'arbitrum', 'uniswap', 'exchange', 'wallet', 'staking', 'yield',
      'liquidity', 'pool', 'swap', 'bridge', 'nft', 'dao', 'governance'
    ];
    const hasCryptoContext = cryptoKeywords.some((keyword) => text.includes(keyword));
    const hasTokenName = tokenName && text.includes(tokenName);

    // If no crypto context AND no token name, might be irrelevant
    // But be lenient - only exclude if it's clearly not crypto
    if (!hasCryptoContext && !hasTokenName) {
      // Still allow if it's in a crypto subreddit (we trust the subreddit context)
      return true; // Be lenient - subreddit context is enough
    }
  }

  return true;
}

export async function searchRedditForToken(tokenSymbol: string, timeRangeHours = 24): Promise<{
  posts: Array<{
    title: string;
    content: string;
    score: number;
    comments: number;
    timestamp: Date;
    subreddit: string;
    url: string;
  }>;
  totalMentions: number;
}> {
  const tokenInfo = getTokenInfo(tokenSymbol);
  const searchTerms = tokenInfo?.searchTerms || [tokenSymbol.toUpperCase()];

  // Use token-specific subreddits if available, otherwise use default
  const subreddits = tokenInfo?.subreddits?.length
    ? [...new Set([...tokenInfo.subreddits, ...CRYPTO_SUBREDDITS])]
    : CRYPTO_SUBREDDITS;

  const allPosts: Array<{
    title: string;
    content: string;
    score: number;
    comments: number;
    timestamp: Date;
    subreddit: string;
    url: string;
  }> = [];

  const timeLimit = new Date(Date.now() - timeRangeHours * 60 * 60 * 1000);

  // Search with each search term
  for (const searchQuery of searchTerms) {
    for (const subreddit of subreddits) {
      try {
        // Search for posts containing the token symbol using Reddit's public JSON API
        // Try multiple time ranges if "day" doesn't return results
        const timeRanges = ['day', 'week', 'month'];

        for (const timeRange of timeRanges) {
          const url = new URL(`https://www.reddit.com/r/${subreddit}/search.json`);
          url.searchParams.set('q', searchQuery);
          url.searchParams.set('restrict_sr', '1');
          url.searchParams.set('sort', 'new');
          url.searchParams.set('t', timeRange);
          url.searchParams.set('limit', '25');

          const res = await fetch(url.toString(), {
            headers: {
              'User-Agent': process.env['REDDIT_USER_AGENT'] || 'social-sentiment-mcp/1.0.0',
            },
          });

          if (!res.ok) {
            // Log errors for debugging
            console.error(`Reddit API error for ${subreddit}/${searchQuery} (${timeRange}): ${res.status} ${res.statusText}`);
            // Skip if rate limited or error
            if (res.status === 429) {
              await new Promise((resolve) => setTimeout(resolve, 5000)); // Wait 5s on rate limit
            }
            continue;
          }

          const data = (await res.json()) as {
            data?: { children?: Array<{ data?: any }> };
          };

          const children = data.data?.children ?? [];

          // Log for debugging
          if (children.length > 0) {
            console.error(`Found ${children.length} posts in r/${subreddit} for "${searchQuery}" (${timeRange})`);
          }

          let foundInThisRange = 0;
          for (const child of children) {
            const d = child.data;
            if (!d) continue;

            const createdUtc = typeof d.created_utc === 'number' ? d.created_utc : Number(d.created_utc);
            const postDate = new Date(createdUtc * 1000);
            if (Number.isNaN(postDate.getTime()) || postDate < timeLimit) {
              continue;
            }

            const post = {
              title: d.title ?? '',
              content: d.selftext ?? '',
              score: typeof d.score === 'number' ? d.score : 0,
              comments: typeof d.num_comments === 'number' ? d.num_comments : 0,
              timestamp: postDate,
              subreddit,
              url: `https://www.reddit.com${d.permalink ?? ''}`,
            };

            // Filter out irrelevant posts (but be lenient - only exclude obvious false positives)
            const isRelevant = isRelevantPost(post, tokenInfo);
            if (!isRelevant) {
              // Log filtered posts for debugging
              console.error(`Filtered post: "${post.title.substring(0, 50)}..." (doesn't match relevance criteria)`);
            } else {
              // Avoid duplicates
              if (!allPosts.some((p) => p.url === post.url)) {
                allPosts.push(post);
                foundInThisRange++;
                console.error(`✅ Added post: "${post.title.substring(0, 60)}..." from r/${subreddit} (score: ${post.score}, comments: ${post.comments})`);
              }
            }
          }

          // If we found posts in this time range, we can stop trying other ranges for this subreddit
          if (foundInThisRange > 0 && timeRange === 'day') {
            break; // Found recent posts, no need to check week/month
          }

          // Rate limiting: be respectful (simple 1s delay between requests)
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      } catch (error) {
        console.error(`Error searching subreddit ${subreddit} with query ${searchQuery}:`, error);
        // Continue with other subreddits
      }
    }
  }

  // Sort by score * comments (engagement) and then by recency
  const sorted = allPosts.sort((a, b) => {
    const engagementA = a.score + a.comments * 2;
    const engagementB = b.score + b.comments * 2;
    if (Math.abs(engagementA - engagementB) > 10) {
      return engagementB - engagementA;
    }
    return b.timestamp.getTime() - a.timestamp.getTime();
  });

  console.error(`Total posts found for ${tokenSymbol}: ${sorted.length} (from ${searchTerms.length} search terms, ${subreddits.length} subreddits)`);

  return {
    posts: sorted,
    totalMentions: sorted.length,
  };
}

// For MVP we do not fetch comments separately – post bodies + titles are enough for sentiment.
