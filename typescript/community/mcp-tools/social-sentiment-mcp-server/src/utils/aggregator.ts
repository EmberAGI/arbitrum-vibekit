import type { SentimentSource, SentimentResult } from '../types/sentiment.js';
import type { EarlySignal, MomentumScore } from '../types/sentiment.js';
import { analyzeTextsSentiment, buildSentimentResult } from '../services/sentiment.js';
import { getDiscordSentiment } from '../services/discord.js';
import { getTelegramSentiment } from '../services/telegram.js';
import { cache, CACHE_TTL } from './cache.js';

interface RedditPost {
  title: string;
  content: string;
  score: number;
  comments: number;
  timestamp: Date;
  subreddit: string;
  url: string;
}

interface RedditSearchResult {
  posts: RedditPost[];
  totalMentions: number;
}

/**
 * Aggregate sentiment from multiple sources (Reddit, Discord, Telegram) into a SentimentResult.
 */
export async function aggregateMultiSourceSentiment(
  tokenSymbol: string,
  redditData: RedditSearchResult,
): Promise<SentimentResult> {
  const cacheKey = `multi-sentiment:${tokenSymbol.toUpperCase()}:${redditData.totalMentions}`;
  const cached = cache.get<SentimentResult>(cacheKey);
  if (cached) {
    return cached;
  }

  const sources: SentimentSource[] = [];

  // 1. Reddit sentiment
  const redditTexts: string[] = [];
  for (const post of redditData.posts) {
    redditTexts.push(`${post.title} ${post.content}`.trim());
  }

  if (redditTexts.length > 0) {
    const { score } = await analyzeTextsSentiment(redditTexts);
    sources.push({
      platform: 'reddit',
      score,
      volume: redditData.totalMentions,
      sampleText: redditTexts.slice(0, 5),
    });
  }

  // 2. Discord sentiment (if available)
  try {
    const discordSentiment = await getDiscordSentiment(tokenSymbol);
    if (discordSentiment.volume > 0) {
      sources.push({
        platform: 'discord',
        score: discordSentiment.score,
        volume: discordSentiment.volume,
        sampleText: discordSentiment.sampleMessages,
      });
    }
  } catch (error) {
    console.error('Error fetching Discord sentiment:', error);
    // Continue without Discord data
  }

  // 3. Telegram sentiment (if available)
  try {
    const telegramSentiment = await getTelegramSentiment(tokenSymbol);
    if (telegramSentiment.volume > 0) {
      sources.push({
        platform: 'telegram',
        score: telegramSentiment.score,
        volume: telegramSentiment.volume,
        sampleText: telegramSentiment.sampleMessages,
      });
    }
  } catch (error) {
    console.error('Error fetching Telegram sentiment:', error);
    // Continue without Telegram data
  }

  // Build combined result
  const result = buildSentimentResult(sources);

  // Adjust confidence based on total volume across all sources
  const totalVolume = sources.reduce((sum, s) => sum + s.volume, 0);
  const volumeFactor = Math.min(1, totalVolume / 50);
  result.confidence = Math.min(1, (result.confidence + volumeFactor) / 2);

  cache.set(cacheKey, result, CACHE_TTL.SENTIMENT);
  return result;
}

/**
 * Aggregate Reddit data into a SentimentSource and then into a SentimentResult.
 * @deprecated Use aggregateMultiSourceSentiment instead
 */
export async function aggregateRedditSentiment(
  tokenSymbol: string,
  redditData: RedditSearchResult,
): Promise<SentimentResult> {
  return aggregateMultiSourceSentiment(tokenSymbol, redditData);
}

/**
 * Very simple early signal detection based on Reddit volume spike.
 * For MVP we don't have historical DB, so we use heuristics based on current volume.
 */
export function detectRedditEarlySignals(
  tokenSymbol: string,
  redditData: RedditSearchResult,
): EarlySignal | null {
  const volume = redditData.totalMentions;

  // Heuristic thresholds – these would be refined with real data
  if (volume < 10) {
    return null;
  }

  const average = 5; // pretend historical average
  const change = ((volume - average) / average) * 100;

  if (change < 100) {
    // Require at least 2x increase over heuristic average
    return null;
  }

  const strength = Math.min(1, change / 500); // cap strength

  const description = `Reddit mentions for ${tokenSymbol.toUpperCase()} have spiked to ${volume}, approximately ${change.toFixed(
    1,
  )}% above the heuristic baseline. This may indicate early social interest.`;

  const signal: EarlySignal = {
    tokenSymbol,
    signalType: 'social_spike',
    strength,
    description,
    timestamp: new Date().toISOString(),
    historicalComparison: {
      average,
      current: volume,
      change,
    },
  };

  return signal;
}

/**
 * Compute a simple Reddit-based social momentum score.
 * For now, only Reddit is used; Discord/Telegram can be added later.
 */
export function computeRedditMomentumScore(
  tokenSymbol: string,
  redditData: RedditSearchResult,
  sentiment: SentimentResult,
): MomentumScore {
  const volume = redditData.totalMentions;

  // Map sentiment score [-1,1] and volume into a 0-100 score
  const sentimentFactor = (sentiment.score + 1) / 2; // 0..1
  const volumeFactor = Math.min(1, volume / 100); // 0..1

  const overallScore = Math.round((sentimentFactor * 0.6 + volumeFactor * 0.4) * 100);

  const momentum: MomentumScore = {
    tokenSymbol,
    overallScore,
    breakdown: {
      reddit: overallScore,
      discord: 0,
      telegram: 0,
    },
    velocity: volumeFactor,
    volume,
    timestamp: new Date().toISOString(),
  };

  return momentum;
}


