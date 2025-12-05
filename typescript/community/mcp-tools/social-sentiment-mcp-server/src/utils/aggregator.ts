import type { SentimentSource, SentimentResult } from '../types/sentiment.js';
import type { EarlySignal, MomentumScore } from '../types/sentiment.js';
import { analyzeTextsSentiment, buildSentimentResult } from '../services/sentiment.js';
import { getDiscordSentiment } from '../services/discord.js';
import { getTelegramSentiment } from '../services/telegram.js';
import { searchTwitterForToken } from '../services/twitter.js';
import { searchFarcasterForToken } from '../services/farcaster.js';
import { enhanceSentimentWithContext } from './contextGenerator.js';
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

  // 4. Twitter/X sentiment (if available)
  try {
    const twitterData = await searchTwitterForToken(tokenSymbol, 24);
    if (twitterData.totalMentions > 0) {
      const twitterTexts = twitterData.posts.map((p) => p.text);
      const { score } = await analyzeTextsSentiment(twitterTexts);
      sources.push({
        platform: 'twitter',
        score,
        volume: twitterData.totalMentions,
        sampleText: twitterTexts.slice(0, 5),
      });
    }
  } catch (error) {
    console.error('Error fetching Twitter sentiment:', error);
    // Continue without Twitter data
  }

  // 5. Farcaster sentiment (if available)
  try {
    const farcasterData = await searchFarcasterForToken(tokenSymbol, 24);
    if (farcasterData.totalMentions > 0) {
      const farcasterTexts = farcasterData.casts.map((c) => c.text);
      const { score } = await analyzeTextsSentiment(farcasterTexts);
      sources.push({
        platform: 'farcaster',
        score,
        volume: farcasterData.totalMentions,
        sampleText: farcasterTexts.slice(0, 5),
      });
    }
  } catch (error) {
    console.error('Error fetching Farcaster sentiment:', error);
    // Continue without Farcaster data
  }

  // Build combined result
  const result = buildSentimentResult(sources);

  // Adjust confidence based on total volume across all sources
  const totalVolume = sources.reduce((sum, s) => sum + s.volume, 0);
  const volumeFactor = Math.min(1, totalVolume / 50);
  result.confidence = Math.min(1, (result.confidence + volumeFactor) / 2);

  // Enhance with contextual analysis
  const enhancedResult = enhanceSentimentWithContext(result);

  cache.set(cacheKey, enhancedResult, CACHE_TTL.SENTIMENT);
  return enhancedResult;
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
 * Compute a multi-platform social momentum score.
 * Includes Reddit, Twitter, Farcaster, Discord, and Telegram.
 */
export async function computeMultiPlatformMomentumScore(
  tokenSymbol: string,
  redditData: RedditSearchResult,
  sentiment: SentimentResult,
): Promise<MomentumScore> {
  const redditVolume = redditData.totalMentions;

  // Get volumes from other platforms
  let twitterVolume = 0;
  let farcasterVolume = 0;
  let discordVolume = 0;
  let telegramVolume = 0;

  try {
    const twitterData = await searchTwitterForToken(tokenSymbol, 24);
    twitterVolume = twitterData.totalMentions;
  } catch {
    // Ignore errors
  }

  try {
    const farcasterData = await searchFarcasterForToken(tokenSymbol, 24);
    farcasterVolume = farcasterData.totalMentions;
  } catch {
    // Ignore errors
  }

  try {
    const discordSentiment = await getDiscordSentiment(tokenSymbol);
    discordVolume = discordSentiment.volume;
  } catch {
    // Ignore errors
  }

  try {
    const telegramSentiment = await getTelegramSentiment(tokenSymbol);
    telegramVolume = telegramSentiment.volume;
  } catch {
    // Ignore errors
  }

  const totalVolume = redditVolume + twitterVolume + farcasterVolume + discordVolume + telegramVolume;

  // Map sentiment score [-1,1] and volume into a 0-100 score
  const sentimentFactor = (sentiment.score + 1) / 2; // 0..1
  const volumeFactor = Math.min(1, totalVolume / 100); // 0..1

  const overallScore = Math.round((sentimentFactor * 0.6 + volumeFactor * 0.4) * 100);

  // Calculate per-platform scores
  const redditScore = redditVolume > 0 ? Math.round((sentimentFactor * 0.6 + Math.min(1, redditVolume / 100) * 0.4) * 100) : 0;
  const twitterScore = twitterVolume > 0 ? Math.round((sentimentFactor * 0.6 + Math.min(1, twitterVolume / 100) * 0.4) * 100) : 0;
  const farcasterScore = farcasterVolume > 0 ? Math.round((sentimentFactor * 0.6 + Math.min(1, farcasterVolume / 100) * 0.4) * 100) : 0;
  const discordScore = discordVolume > 0 ? Math.round((sentimentFactor * 0.6 + Math.min(1, discordVolume / 100) * 0.4) * 100) : 0;
  const telegramScore = telegramVolume > 0 ? Math.round((sentimentFactor * 0.6 + Math.min(1, telegramVolume / 100) * 0.4) * 100) : 0;

  const momentum: MomentumScore = {
    tokenSymbol,
    overallScore,
    breakdown: {
      reddit: redditScore,
      discord: discordScore,
      telegram: telegramScore,
      twitter: twitterScore,
      farcaster: farcasterScore,
    },
    velocity: volumeFactor,
    volume: totalVolume,
    timestamp: new Date().toISOString(),
  };

  return momentum;
}

/**
 * @deprecated Use computeMultiPlatformMomentumScore instead
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


