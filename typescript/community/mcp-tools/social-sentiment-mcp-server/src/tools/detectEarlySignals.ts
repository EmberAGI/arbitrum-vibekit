import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { DetectEarlySignalsInputSchema } from '../types/sentiment.js';
import { searchRedditForToken } from '../services/reddit.js';
import { detectRedditEarlySignals } from '../utils/aggregator.js';
import { getTokenInfo } from '../utils/tokenMapping.js';

export const detectEarlySignalsTool: Tool = {
  name: 'detect-early-signals',
  description:
    'Detect early social signals (volume spikes, sentiment shifts) before they become mainstream. Useful for finding emerging opportunities.',
  inputSchema: {
    type: 'object',
    properties: {
      tokenSymbol: {
        type: 'string',
        description: 'Token symbol to monitor (e.g., ETH, BTC, ARB, UNI, AAVE)',
      },
      lookbackHours: {
        type: 'number',
        description: 'Hours to look back for comparison (default: 24)',
        minimum: 1,
        maximum: 168,
        default: 24,
      },
    },
    required: ['tokenSymbol'],
  },
};

export async function executeDetectEarlySignals(args: unknown): Promise<{ content: unknown }> {
  const { tokenSymbol, lookbackHours } = DetectEarlySignalsInputSchema.parse(args);

  const tokenInfo = getTokenInfo(tokenSymbol);
  if (!tokenInfo) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              error: `Token ${tokenSymbol.toUpperCase()} not supported. Use list-supported-tokens to see available tokens.`,
              supportedTokens: ['ARB', 'ETH', 'BTC', 'USDC', 'UNI', 'AAVE', 'LINK', 'MATIC', 'OP', 'GMX', 'CRV', 'MKR', 'SNX', 'COMP'],
            },
            null,
            2,
          ),
        },
      ],
    };
  }

  // Fetch Reddit data
  const redditData = await searchRedditForToken(tokenSymbol, lookbackHours);

  // Detect early signals
  const signal = detectRedditEarlySignals(tokenSymbol, redditData);

  const detectedSignal = signal || {
    tokenSymbol: tokenSymbol.toUpperCase(),
    signalType: 'social_spike' as const,
    strength: 0,
    description: `No significant early signals detected for ${tokenSymbol.toUpperCase()}. Social activity is within normal range.`,
    timestamp: new Date().toISOString(),
    historicalComparison: {
      average: 5,
      current: redditData.totalMentions,
      change: 0,
    },
  };

  // Generate contextual explanation
  let explanation = '';
  let actionableInsights: string[] = [];

  if (detectedSignal.strength > 0.5) {
    explanation = `Strong early signal detected! Social volume has spiked ${detectedSignal.historicalComparison.change.toFixed(1)}% above baseline, indicating growing community interest before mainstream awareness. `;
    actionableInsights.push('High signal strength suggests potential price movement - monitor closely');
    actionableInsights.push('Consider this as an early entry opportunity if fundamentals align');
    actionableInsights.push('Watch for confirmation from other platforms (Twitter, Farcaster)');
  } else if (detectedSignal.strength > 0.2) {
    explanation = `Moderate early signal detected. Social volume is ${detectedSignal.historicalComparison.change.toFixed(1)}% above baseline, showing increased interest. `;
    actionableInsights.push('Moderate signal - monitor for trend continuation');
    actionableInsights.push('Cross-reference with on-chain data for confirmation');
  } else {
    explanation = `No significant early signals detected. Current social volume (${redditData.totalMentions} mentions) is within normal range. `;
    actionableInsights.push('Low signal strength - social activity is stable');
    actionableInsights.push('Monitor for sudden spikes in volume or sentiment shifts');
  }

  const response = {
    tokenSymbol: tokenSymbol.toUpperCase(),
    tokenName: tokenInfo.name,
    signal: {
      ...detectedSignal,
      context: {
        explanation,
        actionableInsights,
        interpretation: detectedSignal.strength > 0.5
          ? 'Strong early signal - high probability of price movement'
          : detectedSignal.strength > 0.2
            ? 'Moderate early signal - monitor for confirmation'
            : 'No significant early signal - normal social activity',
      },
    },
    redditData: {
      totalMentions: redditData.totalMentions,
      topPosts: redditData.posts.slice(0, 5).map((p) => ({
        title: p.title,
        subreddit: p.subreddit,
        score: p.score,
        comments: p.comments,
        engagement: p.score + p.comments * 2,
        url: p.url,
      })),
    },
    meta: {
      lookbackHours,
      generatedAt: new Date().toISOString(),
      notes: 'Early signal detection uses volume spike heuristics. Signals with strength > 0.5 are considered strong. For production, historical data would improve accuracy.',
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

