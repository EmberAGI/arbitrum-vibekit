/**
 * Market Relationship Detector
 *
 * Detects logical relationships between Polymarket prediction markets using
 * both pattern matching and LLM-based analysis.
 *
 * Relationship Types:
 * - IMPLIES: If A happens, B must happen (P(A) ≤ P(B))
 * - REQUIRES: B is necessary for A (reverse implication)
 * - MUTUAL_EXCLUSION: Both can't happen (P(A) + P(B) ≤ 1.00)
 * - EQUIVALENCE: Same event, different phrasing
 */

import type {
  Market,
  MarketRelationship,
  RelationshipType,
  CrossMarketOpportunity,
} from '../workflow/context.js';
import { logInfo } from '../workflow/context.js';

// ============================================================================
// Pattern-Based Detection (Fallback)
// ============================================================================

type RelationshipPattern = {
  parent: RegExp;
  child: RegExp;
  type: RelationshipType;
  confidence: 'high' | 'medium' | 'low';
  description: string;
};

/**
 * Predefined patterns for common market relationships.
 * These serve as fallback when LLM is unavailable or for high-confidence matches.
 */
const RELATIONSHIP_PATTERNS: RelationshipPattern[] = [
  // Political: Candidate → Party
  {
    parent: /Trump wins (.+)/i,
    child: /Republican wins (.+)/i, // Will be matched dynamically
    type: 'IMPLIES',
    confidence: 'high',
    description: 'Trump is Republican, so Trump winning implies Republican winning',
  },
  {
    parent: /Biden wins (.+)/i,
    child: /Democrat wins (.+)/i, // Will be matched dynamically
    type: 'IMPLIES',
    confidence: 'high',
    description: 'Biden is Democrat, so Biden winning implies Democrat winning',
  },

  // Time-based: Subset → Superset
  {
    parent: /(.+) in Q1 2025/i,
    child: /(.+) in 2025/i, // Will be matched dynamically
    type: 'IMPLIES',
    confidence: 'high',
    description: 'Q1 is part of 2025, so Q1 occurrence implies 2025 occurrence',
  },
  {
    parent: /(.+) in January/i,
    child: /(.+) in Q1/i, // Will be matched dynamically
    type: 'IMPLIES',
    confidence: 'high',
    description: 'January is part of Q1, so January occurrence implies Q1 occurrence',
  },

  // Sports: Semi-final → Final
  {
    parent: /(.+) wins semi-?final/i,
    child: /(.+) (reaches|makes|in) final/i, // Will be matched dynamically
    type: 'IMPLIES',
    confidence: 'medium',
    description: 'Winning semi-final implies reaching the final',
  },

  // Mutual Exclusion: Competing outcomes
  {
    parent: /Democrat wins (.+)/i,
    child: /Republican wins (.+)/i, // Will be matched dynamically
    type: 'MUTUAL_EXCLUSION',
    confidence: 'high',
    description: 'Only one party can win the same race',
  },

  // Additional Political: More candidates
  {
    parent: /Harris wins (.+)/i,
    child: /Democrat wins (.+)/i,
    type: 'IMPLIES',
    confidence: 'high',
    description: 'Harris is Democrat, so Harris winning implies Democrat winning',
  },
  {
    parent: /DeSantis wins (.+)/i,
    child: /Republican wins (.+)/i,
    type: 'IMPLIES',
    confidence: 'high',
    description: 'DeSantis is Republican, so DeSantis winning implies Republican winning',
  },

  // Time-based: More quarter/month relationships
  {
    parent: /(.+) in Q2 2025/i,
    child: /(.+) in 2025/i,
    type: 'IMPLIES',
    confidence: 'high',
    description: 'Q2 is part of 2025, so Q2 occurrence implies 2025 occurrence',
  },
  {
    parent: /(.+) in Q3 2025/i,
    child: /(.+) in 2025/i,
    type: 'IMPLIES',
    confidence: 'high',
    description: 'Q3 is part of 2025, so Q3 occurrence implies 2025 occurrence',
  },
  {
    parent: /(.+) in Q4 2025/i,
    child: /(.+) in 2025/i,
    type: 'IMPLIES',
    confidence: 'high',
    description: 'Q4 is part of 2025, so Q4 occurrence implies 2025 occurrence',
  },
  {
    parent: /(.+) in February/i,
    child: /(.+) in Q1/i,
    type: 'IMPLIES',
    confidence: 'high',
    description: 'February is part of Q1, so February occurrence implies Q1 occurrence',
  },
  {
    parent: /(.+) in March/i,
    child: /(.+) in Q1/i,
    type: 'IMPLIES',
    confidence: 'high',
    description: 'March is part of Q1, so March occurrence implies Q1 occurrence',
  },

  // Economic: Price thresholds
  {
    parent: /Bitcoin.+\$100k/i,
    child: /Bitcoin.+\$80k/i,
    type: 'IMPLIES',
    confidence: 'high',
    description: 'Bitcoin reaching $100k implies it reached $80k',
  },
  {
    parent: /Bitcoin.+\$120k/i,
    child: /Bitcoin.+\$100k/i,
    type: 'IMPLIES',
    confidence: 'high',
    description: 'Bitcoin reaching $120k implies it reached $100k',
  },
  {
    parent: /S&P 500.+6000/i,
    child: /S&P 500.+5500/i,
    type: 'IMPLIES',
    confidence: 'high',
    description: 'S&P 500 reaching 6000 implies it reached 5500',
  },
  {
    parent: /Ethereum.+\$5000/i,
    child: /Ethereum.+\$4000/i,
    type: 'IMPLIES',
    confidence: 'high',
    description: 'Ethereum reaching $5000 implies it reached $4000',
  },

  // Political: Primary → General election
  {
    parent: /(.+) wins (.+) primary/i,
    child: /(.+) runs in (.+) election/i,
    type: 'IMPLIES',
    confidence: 'high',
    description: 'Winning a primary implies running in the general election',
  },

  // Electoral: Specific states → Overall victory
  {
    parent: /(.+) wins election/i,
    child: /(.+) wins (.+) state/i,
    type: 'REQUIRES',
    confidence: 'high',
    description: 'Winning overall may require winning key swing states',
  },

  // Economic: Market cap thresholds
  {
    parent: /(.+) market cap.+\$2T/i,
    child: /(.+) market cap.+\$1T/i,
    type: 'IMPLIES',
    confidence: 'high',
    description: 'Reaching $2T market cap implies reaching $1T',
  },

  // Time-based: Year progression
  {
    parent: /(.+) by end of 2025/i,
    child: /(.+) by end of 2026/i,
    type: 'IMPLIES',
    confidence: 'high',
    description: 'Happening by end of 2025 implies it happens by end of 2026',
  },
];

/**
 * Detect relationships using pattern matching (fast, deterministic)
 */
function detectRelationshipsByPattern(
  market1: Market,
  market2: Market,
): MarketRelationship | null {
  for (const pattern of RELATIONSHIP_PATTERNS) {
    // Check if market1 matches parent pattern
    const parentMatch = pattern.parent.exec(market1.title);
    if (parentMatch && parentMatch[1]) {
      const capturedGroup = parentMatch[1]!;

      // Check if market2 title contains the same captured group
      // For example: if market1 is "Trump wins Florida" (captured="Florida")
      // Check if market2 is "Republican wins Florida"
      const childMatch = pattern.child.exec(market2.title);
      if (childMatch && childMatch[1]) {
        // For most patterns, we want the captured groups to match
        // Exception: MUTUAL_EXCLUSION might have different second parts
        if (pattern.type === 'MUTUAL_EXCLUSION' || capturedGroup === childMatch[1]) {
          return {
            id: `${market1.id}->${market2.id}`,
            type: pattern.type,
            parentMarket: market1,
            childMarket: market2,
            detectedAt: new Date().toISOString(),
            confidence: pattern.confidence,
            reasoning: pattern.description,
          };
        }
      }
    }

    // Also check reverse (market2 as parent, market1 as child)
    const reverseParentMatch = pattern.parent.exec(market2.title);
    if (reverseParentMatch && reverseParentMatch[1]) {
      const capturedGroup = reverseParentMatch[1]!;

      const reverseChildMatch = pattern.child.exec(market1.title);
      if (reverseChildMatch && reverseChildMatch[1]) {
        if (pattern.type === 'MUTUAL_EXCLUSION' || capturedGroup === reverseChildMatch[1]) {
          return {
            id: `${market2.id}->${market1.id}`,
            type: pattern.type,
            parentMarket: market2,
            childMarket: market1,
            detectedAt: new Date().toISOString(),
            confidence: pattern.confidence,
            reasoning: pattern.description,
          };
        }
      }
    }
  }

  return null;
}

// ============================================================================
// LLM-Based Detection (Primary Method)
// ============================================================================

type LLMRelationshipResponse = {
  hasRelationship: boolean;
  relationshipType?: RelationshipType;
  confidence?: 'high' | 'medium' | 'low';
  reasoning?: string;
  parentMarketId?: string; // Which market is the parent/specific one
};

/**
 * Use LLM to detect relationships between markets.
 * This is more flexible and can find novel relationships.
 */
async function detectRelationshipByLLM(
  market1: Market,
  market2: Market,
): Promise<MarketRelationship | null> {
  // TODO: Implement LLM call once OpenAI/Anthropic client is integrated
  // For now, return null to use pattern-based detection as fallback

  const prompt = buildLLMPrompt(market1, market2);

  logInfo('LLM detection prompt', { prompt });

  // Placeholder: In real implementation, call LLM API here
  // const response = await callLLM(prompt);
  // const parsed = JSON.parse(response) as LLMRelationshipResponse;

  // For MVP, return null to use patterns
  return null;
}

/**
 * Build a prompt for the LLM to analyze market relationships
 */
function buildLLMPrompt(market1: Market, market2: Market): string {
  return `Analyze these two prediction markets and determine if they have a logical relationship:

Market 1:
Title: "${market1.title}"
Description: ${market1.description || 'N/A'}
Current YES price: $${market1.yesPrice.toFixed(2)}
Current NO price: $${market2.noPrice.toFixed(2)}

Market 2:
Title: "${market2.title}"
Description: ${market2.description || 'N/A'}
Current YES price: $${market2.yesPrice.toFixed(2)}
Current NO price: $${market2.noPrice.toFixed(2)}

Determine if these markets have one of these logical relationships:

1. IMPLIES (A → B): If Market A happens, Market B MUST happen
   - Example: "Trump wins Florida" → "Republican wins Florida"
   - Logic: Trump IS a Republican, so his win guarantees Republican win
   - Price constraint: P(A) should be ≤ P(B)

2. REQUIRES (A ← B): Market A requires Market B to happen first
   - Example: "Biden wins election" ← "Biden is Democratic nominee"
   - Logic: Can't win without being nominated
   - Price constraint: P(A) should be ≤ P(B)

3. MUTUAL_EXCLUSION (A ⊕ B): Both markets cannot happen simultaneously
   - Example: "Democrats win Senate" ⊕ "Republicans win Senate"
   - Logic: Only one party can have majority
   - Price constraint: P(A) + P(B) should be ≤ $1.00

4. EQUIVALENCE (A ↔ B): Same event, different phrasing
   - Example: "S&P 500 > 5000" ↔ "Stock market hits 5000"
   - Logic: Literally the same event
   - Price constraint: P(A) ≈ P(B)

Respond in JSON format:
{
  "hasRelationship": true/false,
  "relationshipType": "IMPLIES" | "REQUIRES" | "MUTUAL_EXCLUSION" | "EQUIVALENCE",
  "confidence": "high" | "medium" | "low",
  "reasoning": "Brief explanation of why this relationship exists",
  "parentMarketId": "${market1.id}" or "${market2.id}" (which market is more specific/conditional)
}

If there is NO logical relationship, respond:
{
  "hasRelationship": false
}

Important: Only return relationships based on LOGICAL/DEFINITIONAL constraints, not statistical correlation.
For example, "Bitcoin price" and "Ethereum price" may be correlated, but neither IMPLIES the other.`;
}

// ============================================================================
// Main Detection Function
// ============================================================================

/**
 * Detect all market relationships in a list of markets.
 * Uses both pattern matching and LLM analysis.
 *
 * @param markets - List of active markets to analyze
 * @param useLLM - Whether to use LLM detection (default: false for MVP)
 * @returns List of detected relationships
 */
export async function detectMarketRelationships(
  markets: Market[],
  useLLM = false,
): Promise<MarketRelationship[]> {
  const relationships: MarketRelationship[] = [];
  const checked = new Set<string>();

  logInfo('Starting relationship detection', {
    marketCount: markets.length,
    useLLM,
    maxComparisons: (markets.length * (markets.length - 1)) / 2,
  });

  // Compare each pair of markets
  for (let i = 0; i < markets.length; i++) {
    for (let j = i + 1; j < markets.length; j++) {
      const market1 = markets[i]!;
      const market2 = markets[j]!;

      // Skip if already checked this pair
      const pairKey = `${market1.id}-${market2.id}`;
      if (checked.has(pairKey)) continue;
      checked.add(pairKey);

      // Try LLM detection first if enabled
      let relationship: MarketRelationship | null = null;
      if (useLLM) {
        relationship = await detectRelationshipByLLM(market1, market2);
      }

      // Fallback to pattern matching
      if (!relationship) {
        relationship = detectRelationshipsByPattern(market1, market2);
      }

      if (relationship) {
        relationships.push(relationship);
        logInfo('Detected relationship', {
          type: relationship.type,
          parent: relationship.parentMarket.title,
          child: relationship.childMarket.title,
          confidence: relationship.confidence,
        });
      }
    }
  }

  logInfo('Relationship detection complete', {
    detected: relationships.length,
    byType: countByType(relationships),
  });

  return relationships;
}

// ============================================================================
// Violation Detection
// ============================================================================

/**
 * Check if a market relationship has a price violation that creates an arbitrage opportunity.
 *
 * @param relationship - The relationship to check
 * @returns CrossMarketOpportunity if violation exists, null otherwise
 */
export function checkPriceViolation(
  relationship: MarketRelationship,
): CrossMarketOpportunity | null {
  const { type, parentMarket, childMarket } = relationship;

  if (type === 'IMPLIES' || type === 'REQUIRES') {
    return checkImpliesViolation(relationship);
  } else if (type === 'MUTUAL_EXCLUSION') {
    return checkMutualExclusionViolation(relationship);
  } else if (type === 'EQUIVALENCE') {
    return checkEquivalenceViolation(relationship);
  }

  return null;
}

/**
 * Check IMPLIES/REQUIRES violation: P(parent) should ≤ P(child)
 */
function checkImpliesViolation(
  relationship: MarketRelationship,
): CrossMarketOpportunity | null {
  const { parentMarket, childMarket } = relationship;
  const parentPrice = parentMarket.yesPrice;
  const childPrice = childMarket.yesPrice;

  // Violation: Parent price > Child price (with 1% threshold to avoid noise)
  const threshold = 0.01;
  if (parentPrice > childPrice + threshold) {
    const severity = parentPrice - childPrice; // Price difference
    const expectedProfitPerShare = severity; // Direct profit from price difference

    return {
      relationship,
      violation: {
        type: 'PRICE_INVERSION',
        description: `${parentMarket.title} ($${parentPrice.toFixed(2)}) > ${childMarket.title} ($${childPrice.toFixed(2)})`,
        severity,
      },
      trades: {
        sellMarket: {
          marketId: parentMarket.id,
          outcome: 'yes',
          price: parentPrice,
        },
        buyMarket: {
          marketId: childMarket.id,
          outcome: 'yes',
          price: childPrice,
        },
      },
      expectedProfitPerShare,
      timestamp: new Date().toISOString(),
    };
  }

  return null;
}

/**
 * Check MUTUAL_EXCLUSION violation: P(A) + P(B) should ≤ 1.00
 */
function checkMutualExclusionViolation(
  relationship: MarketRelationship,
): CrossMarketOpportunity | null {
  const { parentMarket, childMarket } = relationship;
  const sumPrices = parentMarket.yesPrice + childMarket.yesPrice;

  // Violation: Sum > 1.00 (with 1% threshold)
  const threshold = 1.01;
  if (sumPrices > threshold) {
    const severity = sumPrices - 1.0;
    const expectedProfitPerShare = severity; // Profit from selling both

    return {
      relationship,
      violation: {
        type: 'SUM_EXCEEDS_ONE',
        description: `${parentMarket.title} ($${parentMarket.yesPrice.toFixed(2)}) + ${childMarket.title} ($${childMarket.yesPrice.toFixed(2)}) = $${sumPrices.toFixed(2)} > $1.00`,
        severity,
      },
      trades: {
        sellMarket: {
          marketId: parentMarket.id,
          outcome: 'yes',
          price: parentMarket.yesPrice,
        },
        buyMarket: {
          marketId: childMarket.id,
          outcome: 'yes',
          price: childMarket.yesPrice,
        },
      },
      expectedProfitPerShare,
      timestamp: new Date().toISOString(),
    };
  }

  return null;
}

/**
 * Check EQUIVALENCE violation: P(A) should ≈ P(B)
 */
function checkEquivalenceViolation(
  relationship: MarketRelationship,
): CrossMarketOpportunity | null {
  const { parentMarket, childMarket } = relationship;
  const priceDiff = Math.abs(parentMarket.yesPrice - childMarket.yesPrice);

  // Violation: Price difference > 5%
  const threshold = 0.05;
  if (priceDiff > threshold) {
    const higherPriceMarket =
      parentMarket.yesPrice > childMarket.yesPrice ? parentMarket : childMarket;
    const lowerPriceMarket =
      parentMarket.yesPrice > childMarket.yesPrice ? childMarket : parentMarket;

    return {
      relationship,
      violation: {
        type: 'PRICE_INVERSION',
        description: `Equivalent markets have different prices: $${higherPriceMarket.yesPrice.toFixed(2)} vs $${lowerPriceMarket.yesPrice.toFixed(2)}`,
        severity: priceDiff,
      },
      trades: {
        sellMarket: {
          marketId: higherPriceMarket.id,
          outcome: 'yes',
          price: higherPriceMarket.yesPrice,
        },
        buyMarket: {
          marketId: lowerPriceMarket.id,
          outcome: 'yes',
          price: lowerPriceMarket.yesPrice,
        },
      },
      expectedProfitPerShare: priceDiff,
      timestamp: new Date().toISOString(),
    };
  }

  return null;
}

// ============================================================================
// Helper Functions
// ============================================================================

function countByType(relationships: MarketRelationship[]): Record<RelationshipType, number> {
  const counts: Record<RelationshipType, number> = {
    IMPLIES: 0,
    REQUIRES: 0,
    MUTUAL_EXCLUSION: 0,
    EQUIVALENCE: 0,
  };

  for (const rel of relationships) {
    counts[rel.type]++;
  }

  return counts;
}
