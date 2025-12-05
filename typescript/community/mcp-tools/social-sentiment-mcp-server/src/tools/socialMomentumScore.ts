import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { SocialMomentumScoreInputSchema } from '../types/sentiment.js';
import { searchRedditForToken } from '../services/reddit.js';
import { searchTwitterForToken } from '../services/twitter.js';
import { searchFarcasterForToken } from '../services/farcaster.js';
import { aggregateMultiSourceSentiment, computeMultiPlatformMomentumScore } from '../utils/aggregator.js';
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

  // Fetch data from all platforms
  const redditData = await searchRedditForToken(tokenSymbol, 24);
  const twitterData = await searchTwitterForToken(tokenSymbol, 24);
  const farcasterData = await searchFarcasterForToken(tokenSymbol, 24);

  // Get sentiment
  const sentiment = await aggregateMultiSourceSentiment(tokenSymbol, redditData);

  // Compute multi-platform momentum score
  const momentum = await computeMultiPlatformMomentumScore(tokenSymbol, redditData, sentiment);

  // Generate contextual explanation
  const level = momentum.overallScore >= 70 ? 'high' : momentum.overallScore >= 40 ? 'medium' : 'low';
  const explanation = `The momentum score of ${momentum.overallScore}/100 indicates ${level} social momentum. `;
  const explanation2 =
    momentum.overallScore >= 70
      ? 'This suggests strong community engagement and positive sentiment across multiple platforms. '
      : momentum.overallScore >= 40
        ? 'This suggests moderate community interest with room for growth. '
        : 'This suggests limited social activity, which may indicate low current interest or early-stage discussion. ';

  const actionableInsights: string[] = [];
  if (momentum.overallScore >= 70) {
    actionableInsights.push('High momentum suggests strong community interest - monitor for trend continuation');
    actionableInsights.push('Consider this as a positive signal for short-term price action');
  } else if (momentum.overallScore >= 40) {
    actionableInsights.push('Moderate momentum - monitor for acceleration or deceleration');
    actionableInsights.push('Watch for catalysts that could boost engagement');
  } else {
    actionableInsights.push('Low momentum - may present early entry opportunity if fundamentals are strong');
    actionableInsights.push('Monitor for sudden spikes in social activity');
  }

  const platformBreakdown = [
    {
      platform: 'reddit',
      score: momentum.breakdown.reddit,
      volume: redditData.totalMentions,
      contribution: redditData.totalMentions > 0 ? `${redditData.totalMentions} posts analyzed` : 'No data',
    },
    {
      platform: 'twitter',
      score: momentum.breakdown.twitter || 0,
      volume: twitterData.totalMentions,
      contribution: twitterData.totalMentions > 0 ? `${twitterData.totalMentions} tweets analyzed` : 'No data',
    },
    {
      platform: 'farcaster',
      score: momentum.breakdown.farcaster || 0,
      volume: farcasterData.totalMentions,
      contribution: farcasterData.totalMentions > 0 ? `${farcasterData.totalMentions} casts analyzed` : 'No data',
    },
  ];

  const response = {
    tokenSymbol: tokenSymbol.toUpperCase(),
    tokenName: tokenInfo.name,
    momentum: {
      ...momentum,
      context: {
        explanation: explanation + explanation2,
        actionableInsights,
        platformBreakdown,
      },
    },
    breakdown: {
      sentiment: {
        score: sentiment.score,
        trend: sentiment.trend,
        confidence: sentiment.confidence,
        context: sentiment.context,
      },
      volume: {
        reddit: redditData.totalMentions,
        twitter: twitterData.totalMentions,
        farcaster: farcasterData.totalMentions,
        discord: 0,
        telegram: 0,
        total: redditData.totalMentions + twitterData.totalMentions + farcasterData.totalMentions,
      },
      engagement: {
        topPost: redditData.posts[0]
          ? {
              title: redditData.posts[0].title,
              score: redditData.posts[0].score,
              comments: redditData.posts[0].comments,
              engagement: redditData.posts[0].score + redditData.posts[0].comments * 2,
              url: redditData.posts[0].url,
            }
          : null,
        topTweet: twitterData.posts[0]
          ? {
              text: twitterData.posts[0].text.substring(0, 200),
              author: twitterData.posts[0].author,
              likes: twitterData.posts[0].likes,
              retweets: twitterData.posts[0].retweets,
              engagement: twitterData.posts[0].likes + twitterData.posts[0].retweets * 2,
              url: twitterData.posts[0].url,
            }
          : null,
        topCast: farcasterData.casts[0]
          ? {
              text: farcasterData.casts[0].text.substring(0, 200),
              author: farcasterData.casts[0].author,
              likes: farcasterData.casts[0].likes,
              recasts: farcasterData.casts[0].recasts,
              engagement: farcasterData.casts[0].likes + farcasterData.casts[0].recasts * 2,
              url: farcasterData.casts[0].url,
            }
          : null,
      },
    },
    interpretation: {
      score: momentum.overallScore,
      level,
      recommendation:
        momentum.overallScore >= 70
          ? 'Strong social momentum detected. High engagement and positive sentiment across multiple platforms. Consider this as a positive signal for short-term price action.'
          : momentum.overallScore >= 40
            ? 'Moderate social momentum. Monitor for changes and watch for catalysts that could boost engagement.'
            : 'Low social momentum. Limited social activity. May present early entry opportunity if fundamentals are strong.',
      context: sentiment.context,
    },
    meta: {
      generatedAt: new Date().toISOString(),
      notes: 'Momentum score combines sentiment, volume, and velocity across Reddit, Twitter, Farcaster, Discord, and Telegram. Higher scores indicate stronger social interest.',
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

