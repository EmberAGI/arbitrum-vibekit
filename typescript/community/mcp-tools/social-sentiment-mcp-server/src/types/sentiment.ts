import { z } from 'zod';

/**
 * Sentiment analysis result with contextual explanations
 */
export interface SentimentResult {
  score: number; // -1 (very negative) to 1 (very positive)
  confidence: number; // 0 to 1
  sources: SentimentSource[];
  trend: 'bullish' | 'bearish' | 'neutral';
  timestamp: string;
  // Enhanced contextual analysis
  context?: {
    explanation: string; // Human-readable explanation of the score
    keyThemes: string[]; // Main topics discussed
    actionableInsights: string[]; // What actions users might take
    defiCategories?: {
      perpetuals?: { score: number; mentions: number; context: string };
      arbitrage?: { score: number; mentions: number; context: string };
      flashloans?: { score: number; mentions: number; context: string };
      lending?: { score: number; mentions: number; context: string };
      staking?: { score: number; mentions: number; context: string };
    };
  };
}

/**
 * Individual sentiment source
 */
export interface SentimentSource {
  platform: 'reddit' | 'discord' | 'telegram' | 'twitter' | 'farcaster';
  score: number;
  volume: number; // Number of mentions/posts
  sampleText: string[]; // Sample posts/comments
}

/**
 * Early signal detection result
 */
export interface EarlySignal {
  tokenSymbol: string;
  signalType: 'social_spike' | 'influencer_activity' | 'sentiment_shift';
  strength: number; // 0 to 1
  description: string;
  timestamp: string;
  historicalComparison: {
    average: number;
    current: number;
    change: number; // Percentage change
  };
}

/**
 * Social momentum score
 */
export interface MomentumScore {
  tokenSymbol: string;
  overallScore: number; // 0 to 100
  breakdown: {
    reddit: number;
    discord: number;
    telegram: number;
    twitter?: number;
    farcaster?: number;
  };
  velocity: number; // Rate of change
  volume: number; // Total mentions
  timestamp: string;
  context?: {
    explanation: string;
    actionableInsights: string[];
    platformBreakdown: {
      platform: string;
      score: number;
      volume: number;
      contribution: string;
    }[];
  };
}

/**
 * Influencer wallet correlation
 */
export interface InfluencerWalletData {
  walletAddress: string;
  socialPlatform: 'twitter' | 'reddit' | 'discord' | 'telegram';
  socialHandle?: string;
  recentActivity: {
    socialPosts: Array<{
      timestamp: string;
      content: string;
      sentiment: number;
    }>;
    onChainTransactions: Array<{
      timestamp: string;
      type: 'buy' | 'sell' | 'transfer';
      tokenSymbol: string;
      amount: string;
    }>;
  };
  correlation: {
    postsBeforeTrades: number;
    averageTimeBetween: number; // minutes
    confidence: number;
  };
}

/**
 * Price prediction based on social sentiment
 */
export interface SocialPricePrediction {
  tokenSymbol: string;
  predictedImpact: number; // Percentage change
  confidence: number; // 0 to 1
  timeWindow: number; // Hours
  reasoning: string;
  factors: Array<{
    factor: string;
    weight: number;
    impact: number;
  }>;
}

/**
 * Zod schemas for tool inputs
 */
export const AnalyzeSentimentInputSchema = z.object({
  tokenSymbol: z.string().describe('Token symbol to analyze (e.g., ETH, BTC, ARB)'),
  timeRange: z
    .object({
      hours: z.number().min(1).max(168).optional().describe('Lookback period in hours (max 168 = 7 days)'),
    })
    .optional()
    .describe('Time range for sentiment analysis'),
});

export const DetectEarlySignalsInputSchema = z.object({
  tokenSymbol: z.string().describe('Token symbol to monitor'),
  lookbackHours: z.number().min(1).max(168).default(24).describe('Hours to look back for comparison'),
});

export const TrackInfluencerWalletsInputSchema = z.object({
  walletAddress: z.string().describe('Wallet address to track'),
  socialPlatform: z.enum(['twitter', 'reddit', 'discord', 'telegram']).optional().describe('Social platform to correlate'),
});

export const SocialMomentumScoreInputSchema = z.object({
  tokenSymbol: z.string().describe('Token symbol to score'),
});

export const PredictSocialDrivenMovesInputSchema = z.object({
  tokenSymbol: z.string().describe('Token symbol to predict'),
  predictionWindow: z.number().min(1).max(168).default(24).describe('Prediction window in hours'),
});

