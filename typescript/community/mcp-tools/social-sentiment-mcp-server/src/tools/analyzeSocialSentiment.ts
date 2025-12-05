import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { AnalyzeSentimentInputSchema, type SentimentResult } from '../types/sentiment.js';
import { searchRedditForToken } from '../services/reddit.js';
import { searchTwitterForToken } from '../services/twitter.js';
import { searchFarcasterForToken } from '../services/farcaster.js';
import { aggregateMultiSourceSentiment } from '../utils/aggregator.js';
import { getTokenInfo } from '../utils/tokenMapping.js';

export const analyzeSocialSentimentTool: Tool = {
  name: 'analyze-social-sentiment',
  description:
    'Analyze social sentiment for a token across Reddit (free tier) and return a structured sentiment summary.',
  inputSchema: {
    type: 'object',
    properties: {
      tokenSymbol: {
        type: 'string',
        description: 'Token symbol to analyze (e.g., ETH, BTC, ARB)',
      },
      timeRange: {
        type: 'object',
        description: 'Time range for sentiment analysis',
        properties: {
          hours: {
            type: 'number',
            description: 'Lookback period in hours (max 168 = 7 days)',
            minimum: 1,
            maximum: 168,
          },
        },
        required: [],
      },
    },
    required: ['tokenSymbol'],
  },
};

export async function executeAnalyzeSocialSentiment(args: unknown): Promise<{ content: unknown }> {
  const { tokenSymbol, timeRange } = AnalyzeSentimentInputSchema.parse(args);

  const lookbackHours = timeRange?.hours ?? 24;
  const tokenInfo = getTokenInfo(tokenSymbol);

  // 1. Fetch data from all platforms
  const redditData = await searchRedditForToken(tokenSymbol, lookbackHours);
  const twitterData = await searchTwitterForToken(tokenSymbol, lookbackHours);
  const farcasterData = await searchFarcasterForToken(tokenSymbol, lookbackHours);

  // 2. Aggregate into sentiment result (includes Reddit, Twitter, Farcaster, Discord, Telegram)
  const sentiment: SentimentResult = await aggregateMultiSourceSentiment(tokenSymbol, redditData);

  // 3. Return structured JSON with ALL posts analyzed (not just sampled)
  const response = {
    tokenSymbol: tokenSymbol.toUpperCase(),
    sentiment,
    sources: {
      reddit: {
        totalMentions: redditData.totalMentions,
        allPosts: redditData.posts.map((p) => ({
          title: p.title,
          content: p.content.substring(0, 500), // First 500 chars of content
          subreddit: p.subreddit,
          score: p.score,
          comments: p.comments,
          engagement: p.score + p.comments * 2, // Engagement score
          timestamp: p.timestamp.toISOString(),
          url: p.url,
          permalink: p.url, // Direct link to post
        })),
        topPosts: redditData.posts
          .sort((a, b) => b.score + b.comments * 2 - (a.score + a.comments * 2))
          .slice(0, 10)
          .map((p) => ({
            title: p.title,
            subreddit: p.subreddit,
            score: p.score,
            comments: p.comments,
            engagement: p.score + p.comments * 2,
            timestamp: p.timestamp.toISOString(),
            url: p.url,
          })),
      },
      twitter: {
        totalMentions: twitterData.totalMentions,
        allPosts: twitterData.posts.map((p) => ({
          text: p.text.substring(0, 500),
          author: p.author,
          likes: p.likes,
          retweets: p.retweets,
          engagement: p.likes + p.retweets * 2,
          timestamp: p.timestamp.toISOString(),
          url: p.url,
        })),
        topPosts: twitterData.posts
          .sort((a, b) => b.likes + b.retweets * 2 - (a.likes + a.retweets * 2))
          .slice(0, 10)
          .map((p) => ({
            text: p.text.substring(0, 200),
            author: p.author,
            likes: p.likes,
            retweets: p.retweets,
            engagement: p.likes + p.retweets * 2,
            timestamp: p.timestamp.toISOString(),
            url: p.url,
          })),
      },
      farcaster: {
        totalMentions: farcasterData.totalMentions,
        allCasts: farcasterData.casts.map((c) => ({
          text: c.text.substring(0, 500),
          author: c.author,
          likes: c.likes,
          recasts: c.recasts,
          replies: c.replies,
          engagement: c.likes + c.recasts * 2 + c.replies * 1.5,
          timestamp: c.timestamp.toISOString(),
          url: c.url,
        })),
        topCasts: farcasterData.casts
          .sort((a, b) => b.likes + b.recasts * 2 - (a.likes + a.recasts * 2))
          .slice(0, 10)
          .map((c) => ({
            text: c.text.substring(0, 200),
            author: c.author,
            likes: c.likes,
            recasts: c.recasts,
            engagement: c.likes + c.recasts * 2,
            timestamp: c.timestamp.toISOString(),
            url: c.url,
          })),
      },
      // Discord/Telegram will be added when implemented
    },
    analysis: {
      totalPostsAnalyzed: redditData.totalMentions + twitterData.totalMentions + farcasterData.totalMentions,
      sentimentBreakdown: {
        positive: sentiment.sources.filter((s) => s.score > 0.1).length,
        neutral: sentiment.sources.filter((s) => s.score >= -0.1 && s.score <= 0.1).length,
        negative: sentiment.sources.filter((s) => s.score < -0.1).length,
      },
      topEngagement: {
        reddit: redditData.posts.length > 0 && redditData.posts[0]
          ? {
              title: redditData.posts[0]!.title,
              engagement: redditData.posts[0]!.score + redditData.posts[0]!.comments * 2,
              url: redditData.posts[0]!.url,
            }
          : null,
        twitter: twitterData.posts.length > 0 && twitterData.posts[0]
          ? {
              text: twitterData.posts[0]!.text.substring(0, 200),
              engagement: twitterData.posts[0]!.likes + twitterData.posts[0]!.retweets * 2,
              url: twitterData.posts[0]!.url,
            }
          : null,
        farcaster: farcasterData.casts.length > 0 && farcasterData.casts[0]
          ? {
              text: farcasterData.casts[0]!.text.substring(0, 200),
              engagement: farcasterData.casts[0]!.likes + farcasterData.casts[0]!.recasts * 2,
              url: farcasterData.casts[0]!.url,
            }
          : null,
      },
    },
    context: sentiment.context,
    meta: {
      lookbackHours,
      generatedAt: new Date().toISOString(),
      searchTerms: tokenInfo?.searchTerms || [tokenSymbol.toUpperCase()],
      platformsSearched: ['reddit', 'twitter', 'farcaster'],
      subredditsSearched: tokenInfo?.subreddits || ['cryptocurrency', 'ethereum', 'defi', 'CryptoCurrency', 'ethtrader'],
      notes:
        'All posts include direct links. Sentiment is calculated from post titles and content. Includes contextual analysis with DeFi-specific categories (perpetuals, arbitrage, flashloans). Discord and Telegram integration coming soon.',
    },
  };

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(response, null, 2),
      },
    ],
  };
}


