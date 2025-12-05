/**
 * Generate contextual explanations for sentiment scores
 * Provides human-readable insights and actionable recommendations
 */

import type { SentimentResult } from '../types/sentiment.js';

/**
 * Analyze DeFi-specific keywords in text
 */
function analyzeDefiCategories(texts: string[]): NonNullable<SentimentResult['context']>['defiCategories'] {
  const lowerTexts = texts.map((t) => t.toLowerCase()).join(' ');

  const categories: NonNullable<SentimentResult['context']>['defiCategories'] = {};

  // Perpetuals analysis
  const perpetualsKeywords = ['perpetual', 'perp', 'futures', 'long', 'short', 'leverage', 'gmx', 'synthetix'];
  const perpetualsMentions = perpetualsKeywords.filter((kw) => lowerTexts.includes(kw)).length;
  if (perpetualsMentions > 0) {
    const isPositive = ['long', 'bull', 'pump', 'green', 'profit'].some((w) => lowerTexts.includes(w));
    const isNegative = ['short', 'bear', 'dump', 'red', 'loss', 'rekt'].some((w) => lowerTexts.includes(w));
    categories.perpetuals = {
      score: isPositive ? 0.3 : isNegative ? -0.3 : 0,
      mentions: perpetualsMentions,
      context: isPositive
        ? 'Positive perpetuals sentiment - traders discussing long positions'
        : isNegative
          ? 'Negative perpetuals sentiment - traders discussing short positions or losses'
          : 'Neutral perpetuals discussion',
    };
  }

  // Arbitrage analysis
  const arbitrageKeywords = ['arbitrage', 'arb', 'arbitrageur', 'price gap', 'cex dex', 'spread'];
  const arbitrageMentions = arbitrageKeywords.filter((kw) => lowerTexts.includes(kw)).length;
  if (arbitrageMentions > 0) {
    const isOpportunity = ['opportunity', 'profit', 'gap', 'spread'].some((w) => lowerTexts.includes(w));
    categories.arbitrage = {
      score: isOpportunity ? 0.2 : 0,
      mentions: arbitrageMentions,
      context: isOpportunity
        ? 'Arbitrage opportunities being discussed'
        : 'General arbitrage discussion',
    };
  }

  // Flashloans analysis
  const flashloanKeywords = ['flashloan', 'flash loan', 'aave', 'dydx', 'instant loan'];
  const flashloanMentions = flashloanKeywords.filter((kw) => lowerTexts.includes(kw)).length;
  if (flashloanMentions > 0) {
    const isPositive = ['profit', 'opportunity', 'exploit'].some((w) => lowerTexts.includes(w));
    categories.flashloans = {
      score: isPositive ? 0.1 : 0,
      mentions: flashloanMentions,
      context: isPositive
        ? 'Flashloan opportunities or exploits discussed'
        : 'General flashloan discussion',
    };
  }

  // Lending analysis
  const lendingKeywords = ['lend', 'borrow', 'collateral', 'apy', 'interest', 'aave', 'compound'];
  const lendingMentions = lendingKeywords.filter((kw) => lowerTexts.includes(kw)).length;
  if (lendingMentions > 0) {
    const isPositive = ['high apy', 'good rate', 'yield'].some((w) => lowerTexts.includes(w));
    const isNegative = ['low apy', 'bad rate', 'risk'].some((w) => lowerTexts.includes(w));
    categories.lending = {
      score: isPositive ? 0.2 : isNegative ? -0.2 : 0,
      mentions: lendingMentions,
      context: isPositive
        ? 'Positive lending sentiment - attractive yields discussed'
        : isNegative
          ? 'Negative lending sentiment - concerns about rates or risks'
          : 'Neutral lending discussion',
    };
  }

  // Staking analysis
  const stakingKeywords = ['stake', 'staking', 'validator', 'reward', 'apr', 'eth2', 'pos'];
  const stakingMentions = stakingKeywords.filter((kw) => lowerTexts.includes(kw)).length;
  if (stakingMentions > 0) {
    const isPositive = ['high reward', 'good apr', 'profitable'].some((w) => lowerTexts.includes(w));
    categories.staking = {
      score: isPositive ? 0.2 : 0,
      mentions: stakingMentions,
      context: isPositive
        ? 'Positive staking sentiment - attractive rewards discussed'
        : 'General staking discussion',
    };
  }

  return Object.keys(categories).length > 0 ? categories : undefined;
}

/**
 * Extract key themes from texts
 */
function extractKeyThemes(texts: string[]): string[] {
  const themes: string[] = [];
  const lowerTexts = texts.map((t) => t.toLowerCase()).join(' ');

  const themeKeywords: Record<string, string[]> = {
    'Network Upgrades': ['upgrade', 'fork', 'hardfork', 'eip', 'improvement'],
    'Institutional Adoption': ['institution', 'blackrock', 'etf', 'adoption', 'mainstream'],
    'Price Action': ['price', 'pump', 'dump', 'bull', 'bear', 'rally', 'crash'],
    'DeFi Activity': ['defi', 'yield', 'liquidity', 'pool', 'swap', 'protocol'],
    'Regulation': ['regulation', 'sec', 'compliance', 'legal', 'ban'],
    'Technology': ['scalability', 'layer 2', 'l2', 'rollup', 'zk', 'optimistic'],
  };

  for (const [theme, keywords] of Object.entries(themeKeywords)) {
    if (keywords.some((kw) => lowerTexts.includes(kw))) {
      themes.push(theme);
    }
  }

  return themes.slice(0, 5); // Limit to top 5 themes
}

/**
 * Generate actionable insights based on sentiment
 */
function generateActionableInsights(sentiment: SentimentResult): string[] {
  const insights: string[] = [];
  const { score, confidence, trend, sources } = sentiment;
  const totalVolume = sources.reduce((sum, s) => sum + s.volume, 0);

  // High confidence insights
  if (confidence > 0.7) {
    if (trend === 'bullish' && score > 0.3) {
      insights.push('Strong positive sentiment detected - consider monitoring for entry opportunities');
      insights.push('High engagement suggests growing community interest');
    } else if (trend === 'bearish' && score < -0.3) {
      insights.push('Negative sentiment detected - exercise caution with new positions');
      insights.push('Consider waiting for sentiment to stabilize before entering');
    }
  }

  // Volume-based insights
  if (totalVolume > 50) {
    insights.push('High social volume indicates active discussion - monitor for trend changes');
  } else if (totalVolume < 10) {
    insights.push('Low social volume - sentiment may not be representative of broader market');
  }

  // Multi-platform insights
  const platformCount = sources.length;
  if (platformCount >= 3) {
    insights.push('Sentiment confirmed across multiple platforms - higher reliability');
  } else if (platformCount === 1) {
    insights.push('Single platform data - consider cross-referencing with other sources');
  }

  // DeFi category insights
  const defiCategories = sentiment.context?.defiCategories;
  if (defiCategories) {
    if (defiCategories.perpetuals && defiCategories.perpetuals.score > 0) {
      insights.push('Positive perpetuals sentiment - traders may be positioning long');
    }
    if (defiCategories.arbitrage && defiCategories.arbitrage.mentions > 0) {
      insights.push('Arbitrage opportunities being discussed - monitor price gaps');
    }
  }

  return insights.length > 0 ? insights : ['Monitor social sentiment trends for emerging patterns'];
}

/**
 * Generate human-readable explanation of sentiment score
 */
function generateExplanation(sentiment: SentimentResult): string {
  const { score, confidence, trend, sources } = sentiment;
  const totalVolume = sources.reduce((sum, s) => sum + s.volume, 0);
  const platformNames = sources.map((s) => s.platform).join(', ');

  let explanation = `The sentiment score of ${score.toFixed(3)} indicates a ${trend} outlook `;

  if (confidence > 0.7) {
    explanation += 'with high confidence. ';
  } else if (confidence > 0.4) {
    explanation += 'with moderate confidence. ';
  } else {
    explanation += 'with low confidence. ';
  }

  explanation += `This is based on ${totalVolume} mentions across ${sources.length} platform(s): ${platformNames}. `;

  if (trend === 'bullish') {
    explanation +=
      'The positive sentiment suggests growing optimism in the community, potentially driven by recent developments, network upgrades, or favorable market conditions. ';
  } else if (trend === 'bearish') {
    explanation +=
      'The negative sentiment suggests concerns or pessimism in the community, which could be related to market conditions, technical issues, or regulatory concerns. ';
  } else {
    explanation +=
      'The neutral sentiment suggests mixed or balanced discussions, with no strong directional bias in the community. ';
  }

  if (totalVolume > 50) {
    explanation += 'High engagement levels indicate active community discussion. ';
  }

  return explanation.trim();
}

/**
 * Enhance sentiment result with contextual analysis
 */
export function enhanceSentimentWithContext(sentiment: SentimentResult): SentimentResult {
  const allTexts = sentiment.sources.flatMap((s) => s.sampleText);

  const context = {
    explanation: generateExplanation(sentiment),
    keyThemes: extractKeyThemes(allTexts),
    actionableInsights: generateActionableInsights(sentiment),
    defiCategories: analyzeDefiCategories(allTexts),
  };

  return {
    ...sentiment,
    context,
  };
}

