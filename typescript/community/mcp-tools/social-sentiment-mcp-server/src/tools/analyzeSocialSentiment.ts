import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { AnalyzeSentimentInputSchema, type SentimentResult } from '../types/sentiment.js';
import { searchRedditForToken } from '../services/reddit.js';
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

  // 1. Fetch Reddit data (MVP: Reddit only)
  const redditData = await searchRedditForToken(tokenSymbol, lookbackHours);

  // 2. Aggregate into sentiment result (includes Reddit, Discord, Telegram)
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
      // Discord/Telegram will be added when implemented
    },
    analysis: {
      totalPostsAnalyzed: redditData.totalMentions,
      sentimentBreakdown: {
        positive: sentiment.sources.filter((s) => s.score > 0.1).length,
        neutral: sentiment.sources.filter((s) => s.score >= -0.1 && s.score <= 0.1).length,
        negative: sentiment.sources.filter((s) => s.score < -0.1).length,
      },
      topEngagement: redditData.posts.length > 0 && redditData.posts[0]
        ? {
            title: redditData.posts[0]!.title,
            engagement: redditData.posts[0]!.score + redditData.posts[0]!.comments * 2,
            url: redditData.posts[0]!.url,
          }
        : null,
    },
    meta: {
      lookbackHours,
      generatedAt: new Date().toISOString(),
      searchTerms: tokenInfo?.searchTerms || [tokenSymbol.toUpperCase()],
      subredditsSearched: tokenInfo?.subreddits || ['cryptocurrency', 'ethereum', 'defi', 'CryptoCurrency', 'ethtrader'],
      notes:
        'All posts include direct links. Sentiment is calculated from post titles and content. Discord and Telegram integration coming soon.',
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


