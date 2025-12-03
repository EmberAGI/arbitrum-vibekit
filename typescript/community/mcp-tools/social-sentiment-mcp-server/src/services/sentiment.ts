import type { SentimentResult, SentimentSource } from '../types/sentiment.js';
import { cache, CACHE_TTL } from '../utils/cache.js';

const HF_DEFAULT_MODEL = 'cardiffnlp/twitter-roberta-base-sentiment-latest';

type HFSentimentLabel = 'negative' | 'neutral' | 'positive';

interface HFSentimentOutput {
  label: HFSentimentLabel;
  score: number;
}

/**
 * Map Hugging Face sentiment labels to a normalized score in range [-1, 1]
 */
function mapLabelToScore(label: HFSentimentLabel, score: number): number {
  switch (label) {
    case 'negative':
      return -score;
    case 'positive':
      return score;
    case 'neutral':
    default:
      return 0;
  }
}

/**
 * Very simple fallback sentiment analysis if Hugging Face is not configured.
 * This is NOT meant to be production-grade – just avoids hard failing on missing API keys.
 */
function naiveSentiment(text: string): number {
  const lower = text.toLowerCase();

  const positiveWords = ['bull', 'bullish', 'moon', 'pump', 'green', 'up', 'profit', 'gain'];
  const negativeWords = ['bear', 'bearish', 'dump', 'red', 'down', 'loss', 'rug', 'rekt'];

  let score = 0;

  for (const word of positiveWords) {
    if (lower.includes(word)) {
      score += 1;
    }
  }

  for (const word of negativeWords) {
    if (lower.includes(word)) {
      score -= 1;
    }
  }

  // Normalize to [-1, 1]
  if (score === 0) return 0;
  if (score > 0) return Math.min(1, score / positiveWords.length);
  return Math.max(-1, score / negativeWords.length);
}

/**
 * Call Hugging Face sentiment analysis API for a single text.
 * Returns a score in [-1, 1] and a confidence in [0, 1].
 */
async function analyzeTextWithHuggingFace(text: string): Promise<{ score: number; confidence: number }> {
  const apiKey = process.env['HUGGING_FACE_API_KEY'];
  if (!apiKey) {
    // Fallback to naive sentiment if no API key configured
    const score = naiveSentiment(text);
    return { score, confidence: 0.3 };
  }

  const cached = cache.get<{ score: number; confidence: number }>(`hf:${HF_DEFAULT_MODEL}:${text}`);
  if (cached) {
    return cached;
  }

  const response = await fetch(`https://api-inference.huggingface.co/models/${HF_DEFAULT_MODEL}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ inputs: text }),
  });

  if (!response.ok) {
    // Degrade gracefully to naive sentiment
    const score = naiveSentiment(text);
    return { score, confidence: 0.3 };
  }

  const data = (await response.json()) as HFSentimentOutput[][] | HFSentimentOutput[];

  // HF can return either an array of arrays or a flat array depending on model
  const firstRow = Array.isArray(data[0]) ? (data[0] as HFSentimentOutput[]) : (data as HFSentimentOutput[]);

  // Pick the label with max score
  let best: HFSentimentOutput | null = null;
  for (const item of firstRow) {
    if (!best || item.score > best.score) {
      best = item;
    }
  }

  if (!best) {
    const score = naiveSentiment(text);
    return { score, confidence: 0.3 };
  }

  const normalizedScore = mapLabelToScore(best.label, best.score);
  const result = { score: normalizedScore, confidence: best.score };

  cache.set(`hf:${HF_DEFAULT_MODEL}:${text}`, result, CACHE_TTL.SENTIMENT);
  return result;
}

/**
 * Aggregate sentiment for a collection of texts.
 * Returns a normalized score in [-1, 1] and a confidence in [0, 1].
 */
export async function analyzeTextsSentiment(texts: string[]): Promise<{ score: number; confidence: number }> {
  if (texts.length === 0) {
    return { score: 0, confidence: 0 };
  }

  // Limit to a reasonable number of samples to stay within free tier limits
  const samples = texts.slice(0, 50);

  const results = await Promise.all(
    samples.map(async (text) => {
      try {
        return await analyzeTextWithHuggingFace(text);
      } catch {
        const score = naiveSentiment(text);
        return { score, confidence: 0.2 };
      }
    }),
  );

  if (results.length === 0) {
    return { score: 0, confidence: 0 };
  }

  let totalScore = 0;
  let totalConfidence = 0;

  for (const r of results) {
    totalScore += r.score;
    totalConfidence += r.confidence;
  }

  const avgScore = totalScore / results.length;
  const avgConfidence = totalConfidence / results.length;

  return { score: avgScore, confidence: avgConfidence };
}

/**
 * Build a SentimentResult from per-platform sources.
 */
export function buildSentimentResult(sources: SentimentSource[]): SentimentResult {
  if (sources.length === 0) {
    return {
      score: 0,
      confidence: 0,
      sources: [],
      trend: 'neutral',
      timestamp: new Date().toISOString(),
    };
  }

  let weightedScoreSum = 0;
  let totalVolume = 0;

  for (const source of sources) {
    const volume = Math.max(1, source.volume);
    weightedScoreSum += source.score * volume;
    totalVolume += volume;
  }

  const overallScore = totalVolume > 0 ? weightedScoreSum / totalVolume : 0;

  let trend: SentimentResult['trend'] = 'neutral';
  if (overallScore > 0.1) {
    trend = 'bullish';
  } else if (overallScore < -0.1) {
    trend = 'bearish';
  }

  // Confidence heuristic: more volume → higher confidence
  const confidence = Math.min(1, totalVolume / 100);

  return {
    score: overallScore,
    confidence,
    sources,
    trend,
    timestamp: new Date().toISOString(),
  };
}


