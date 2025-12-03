import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { SocialMomentumScoreInputSchema } from '../types/sentiment.js';
import { searchRedditForToken } from '../services/reddit.js';
import { aggregateMultiSourceSentiment, computeRedditMomentumScore } from '../utils/aggregator.js';
import { getTokenInfo } from '../utils/tokenMapping.js';

export const socialMomentumScoreTool: Tool = {
  name: 'social-momentum-score',
  description:
    'Calculate a combined social momentum score (0-100) based on sentiment, volume, and velocity across Reddit, Discord, and Telegram.',
  inputSchema: {
    type: 'object',
    properties: {
      tokenSymbol: {
        type: 'string',
        description: 'Token symbol to score (e.g., ETH, BTC, ARB, UNI, AAVE)',
      },
    },
    required: ['tokenSymbol'],
  },
};

export async function executeSocialMomentumScore(args: unknown): Promise<{ content: unknown }> {
  const { tokenSymbol } = SocialMomentumScoreInputSchema.parse(args);

  const tokenInfo = getTokenInfo(tokenSymbol);
  if (!tokenInfo) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              error: `Token ${tokenSymbol.toUpperCase()} not supported. Use list-supported-tokens to see available tokens.`,
            },
            null,
            2,
          ),
        },
      ],
    };
  }

  // Fetch Reddit data
  const redditData = await searchRedditForToken(tokenSymbol, 24);

  // Get sentiment
  const sentiment = await aggregateMultiSourceSentiment(tokenSymbol, redditData);

  // Compute momentum score
  const momentum = computeRedditMomentumScore(tokenSymbol, redditData, sentiment);

  const response = {
    tokenSymbol: tokenSymbol.toUpperCase(),
    tokenName: tokenInfo.name,
    momentum,
    breakdown: {
      sentiment: {
        score: sentiment.score,
        trend: sentiment.trend,
        confidence: sentiment.confidence,
      },
      volume: {
        reddit: redditData.totalMentions,
        discord: 0, // Will be populated when Discord is implemented
        telegram: 0, // Will be populated when Telegram is implemented
        total: redditData.totalMentions,
      },
      engagement: {
        topPost: redditData.posts[0]
          ? {
              title: redditData.posts[0].title,
              score: redditData.posts[0].score,
              comments: redditData.posts[0].comments,
              engagement: redditData.posts[0].score + redditData.posts[0].comments * 2,
            }
          : null,
      },
    },
    interpretation: {
      score: momentum.overallScore,
      level: momentum.overallScore >= 70 ? 'high' : momentum.overallScore >= 40 ? 'medium' : 'low',
      recommendation:
        momentum.overallScore >= 70
          ? 'Strong social momentum detected. High engagement and positive sentiment.'
          : momentum.overallScore >= 40
            ? 'Moderate social momentum. Monitor for changes.'
            : 'Low social momentum. Limited social activity.',
    },
    meta: {
      generatedAt: new Date().toISOString(),
      notes: 'Momentum score combines sentiment, volume, and velocity. Higher scores indicate stronger social interest.',
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

