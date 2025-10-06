import { z } from 'zod';
import { generateText } from 'ai';
import type { VibkitToolDefinition } from 'arbitrum-vibekit-core';
import { createSuccessTask, createErrorTask } from 'arbitrum-vibekit-core';
import type { Task, Message } from '@google-a2a/types';
import type { RebalancerContext } from '../context/types.js';

const analyzePositionWithLLMParametersSchema = z.object({
  positionId: z.string().describe('Position ID to analyze'),
  poolAddress: z.string().describe('Pool address'),
  currentRange: z
    .object({
      lower: z.number().describe('Current lower tick'),
      upper: z.number().describe('Current upper tick'),
    })
    .describe('Current position range'),
  currentPrice: z.number().describe('Current token0-in-token1 price (e.g., ARB/USDC)'),
  token0Decimals: z.number().describe('Token0 decimals'),
  token1Decimals: z.number().describe('Token1 decimals'),
  tickSpacing: z.number().describe('Pool tick spacing'),
  kpis: z
    .object({
      liquidity_metrics: z.record(z.any()).describe('Liquidity distribution metrics'),
      price_metrics: z.record(z.any()).describe('Price and volatility metrics'),
      volume_fee_metrics: z.record(z.any()).describe('Volume and fee metrics'),
    })
    .describe('Pool KPIs data'),
  riskProfile: z
    .enum(['conservative', 'medium', 'aggressive'])
    .describe('Risk profile for rebalancing'),
});

type AnalyzePositionWithLLMParams = z.infer<typeof analyzePositionWithLLMParametersSchema>;

/**
 * Deterministic range builder that converts LLM parameters to safe tick calculations
 */
function buildRangeFromParameters(
  currentPrice: number,
  halfWidthPct: number,
  centerSkewPct: number = 0,
  tickSpacing: number
): { lower: number; upper: number; rangeWidthPct: number } {
  // Constants
  const LN_1p0001 = Math.log(1.0001);

  // 1) Build price bounds in plain USD terms (token0-in-token1)
  const P0 = currentPrice;

  // Validate and clamp half width to reasonable range
  const clampedHalfWidth = Math.max(0.1, Math.min(50, halfWidthPct)); // 0.1% to 50%
  if (clampedHalfWidth !== halfWidthPct) {
    console.warn(`⚠️  Half width ${halfWidthPct}% clamped to ${clampedHalfWidth}%`);
  }

  const w = clampedHalfWidth / 100;
  const s = centerSkewPct / 100;

  const Pcenter = P0 * (1 + s);
  const P_lower_0in1 = Pcenter * (1 - w);
  const P_upper_0in1 = Pcenter * (1 + w);

  console.log(`🔍 Range building debug:`);
  console.log(`   Current price (P0): ${P0}`);
  console.log(`   Half width %: ${halfWidthPct}%`);
  console.log(`   Center skew %: ${centerSkewPct}%`);
  console.log(`   w (half width): ${w}`);
  console.log(`   s (center skew): ${s}`);
  console.log(`   Pcenter: ${Pcenter}`);
  console.log(`   P_lower_0in1: ${P_lower_0in1}`);
  console.log(`   P_upper_0in1: ${P_upper_0in1}`);

  // 2) Convert to pool's price orientation (token1 per token0)
  // Uniswap/Algebra ticks are on price_uni = token1/token0 = 1 / (token0/token1)
  // No decimal scaling needed - use raw price values like the existing code
  const U_lower = 1 / P_upper_0in1; // token1 per token0 (USDC per ARB)
  const U_upper = 1 / P_lower_0in1;

  console.log(`   U_lower (1/P_upper): ${U_lower}`);
  console.log(`   U_upper (1/P_lower): ${U_upper}`);
  console.log(`   ln(U_lower): ${Math.log(U_lower)}`);
  console.log(`   ln(U_upper): ${Math.log(U_upper)}`);
  console.log(`   ln(1.0001): ${LN_1p0001}`);

  // 3) Convert prices → ticks
  function priceToTick(price_uni: number): number {
    return Math.floor(Math.log(price_uni) / LN_1p0001);
  }

  let rawLower = priceToTick(U_lower);
  let rawUpper = priceToTick(U_upper);

  console.log(`   Raw ticks: [${rawLower}, ${rawUpper}]`);

  if (rawLower >= rawUpper) {
    throw new Error('Range collapsed: lower tick >= upper tick');
  }

  // 4) Snap to on-chain spacing
  function floorToSpacing(t: number, s: number): number {
    return Math.floor(t / s) * s;
  }

  function ceilToSpacing(t: number, s: number): number {
    return Math.ceil(t / s) * s;
  }

  const tickLower = floorToSpacing(rawLower, tickSpacing);
  const tickUpper = ceilToSpacing(rawUpper, tickSpacing);

  console.log(`   Final ticks: [${tickLower}, ${tickUpper}]`);

  // 5) Sanity gate - convert back to human prices and verify
  // Use simple tick-to-price conversion without decimal scaling
  function tickToPriceSimple(tick: number): number {
    return Math.pow(1.0001, tick);
  }

  // For sanity check, convert back to token0-in-token1 prices
  const Ul = tickToPriceSimple(tickLower); // token1 per token0 (USDC per ARB)
  const Uu = tickToPriceSimple(tickUpper);

  // Convert back to token0-in-token1 (ARB/USDC) by taking reciprocal
  const P_lower_check = 1 / Uu;
  const P_upper_check = 1 / Ul;

  console.log(`   Converted back to prices: [${P_lower_check}, ${P_upper_check}]`);

  const inRange = P_lower_check < P0 && P0 < P_upper_check;
  const widthPct = 100 * (P_upper_check / P0 - 1);

  if (!inRange) {
    throw new Error(
      `LLM range build bug: current price ${P0} not in range [${P_lower_check}, ${P_upper_check}]`
    );
  }

  if (widthPct < 1 || widthPct > 25) {
    throw new Error(`Range width ${widthPct.toFixed(2)}% out of policy (1-25%)`);
  }

  return {
    lower: tickLower,
    upper: tickUpper,
    rangeWidthPct: widthPct,
  };
}

/**
 * Calculate optimal amounts based on range-implied ratio
 */
function calculateOptimalAmounts(
  currentPrice: number,
  tickLower: number,
  tickUpper: number,
  available0: number,
  available1: number
): { amount0: number; amount1: number } {
  // Use approximate sqrt calculations for amount sizing
  function sqrtFromTick(tick: number): number {
    return Math.sqrt(Math.pow(1.0001, tick));
  }

  const sqrtP = Math.sqrt(1 / currentPrice); // sqrt(price_uni) from human price
  const sqrtPL = sqrtFromTick(tickLower);
  const sqrtPU = sqrtFromTick(tickUpper);

  let want0 = 0;
  let want1 = 0;

  if (sqrtP <= sqrtPL) {
    // All token0 - price below range
    want0 = available0 * 0.99;
    want1 = 0;
  } else if (sqrtP >= sqrtPU) {
    // All token1 - price above range
    want0 = 0;
    want1 = available1 * 0.99;
  } else {
    // Inside range - match the theoretical ratio
    // ratio R = amount0/amount1 at equal-L
    const R = (sqrtPU - sqrtP) / (sqrtPU * sqrtP) / (sqrtP - sqrtPL);

    // Fit to wallet
    const maxBy0 = available0;
    const maxBy1 = available1;
    const by0_amt1 = maxBy0 / R;
    const by1_amt0 = maxBy1 * R;

    if (by0_amt1 <= maxBy1) {
      // Token0 is limiting
      want0 = 0.995 * maxBy0;
      want1 = 0.995 * (maxBy0 / R);
    } else {
      // Token1 is limiting
      want1 = 0.995 * maxBy1;
      want0 = 0.995 * (maxBy1 * R);
    }
  }

  return { amount0: want0, amount1: want1 };
}

/**
 * Generate fallback analysis when LLM is not available
 */
function generateFallbackAnalysis(params: AnalyzePositionWithLLMParams, kpis: any) {
  const {
    positionId,
    poolAddress,
    currentRange,
    currentPrice,
    token0Decimals,
    token1Decimals,
    tickSpacing,
    riskProfile,
  } = params;
  const { price_metrics, liquidity_metrics } = kpis;

  // Simple heuristic-based analysis
  const liquidityUtilization = price_metrics?.liquidity_utilization_pct || 0;
  const priceChange = price_metrics?.hourly_price_change_pct || 0;
  const volatility = price_metrics?.token0_hourly_volatility || 0;
  const impermanentLoss = price_metrics?.impermanent_loss_est_pct || 0;

  // Determine position health
  let positionHealth = 'fair';
  if (liquidityUtilization > 80 && volatility < 0.05) {
    positionHealth = 'excellent';
  } else if (liquidityUtilization > 50 && volatility < 0.1) {
    positionHealth = 'good';
  } else if (liquidityUtilization < 20 || volatility > 0.2) {
    positionHealth = 'poor';
  }

  // Determine market conditions
  let marketConditions = 'neutral';
  if (volatility < 0.05 && Math.abs(priceChange) < 2) {
    marketConditions = 'favorable';
  } else if (volatility > 0.15 || Math.abs(priceChange) > 10) {
    marketConditions = 'unfavorable';
  }

  // Determine risk level
  let riskLevel = 'medium';
  if (volatility < 0.05 && impermanentLoss < 5) {
    riskLevel = 'low';
  } else if (volatility > 0.15 || impermanentLoss > 15) {
    riskLevel = 'high';
  }

  // Generate recommendation based on heuristics
  let action = 'maintain';
  let confidence = 0.5;
  let newRange = currentRange;

  if (positionHealth === 'poor' || liquidityUtilization < 20) {
    action = 'rebalance';
    confidence = 0.7;

    // Calculate new range using deterministic range builder
    try {
      // Map risk profile to half width percentage
      const halfWidthPct = riskProfile === 'conservative' ? 3 : riskProfile === 'medium' ? 7 : 12;

      console.log(`🔍 Fallback analysis - building range:`);
      console.log(`   Risk profile: ${riskProfile}`);
      console.log(`   Half width %: ${halfWidthPct}%`);
      console.log(`   Current price: ${currentPrice}`);
      console.log(`   Tick spacing: ${tickSpacing}`);

      const rangeResult = buildRangeFromParameters(
        currentPrice,
        halfWidthPct,
        0, // no center skew for fallback
        tickSpacing
      );

      newRange = {
        lower: rangeResult.lower,
        upper: rangeResult.upper,
      };
    } catch (error) {
      console.warn('Failed to build range in fallback analysis:', error);
      // Keep current range if range building fails
    }
  }

  return {
    position_id: positionId,
    pool_address: poolAddress,
    analyzed_at: new Date().toISOString(),
    risk_profile: riskProfile,
    analysis: {
      position_health: positionHealth,
      market_conditions: marketConditions,
      risk_level: riskLevel,
      key_insights: [
        `Liquidity utilization: ${liquidityUtilization.toFixed(1)}%`,
        `Price volatility: ${(volatility * 100).toFixed(2)}%`,
        `Impermanent loss risk: ${impermanentLoss.toFixed(1)}%`,
      ],
    },
    recommendation: {
      action,
      confidence,
      reasoning: `Based on liquidity utilization (${liquidityUtilization.toFixed(1)}%) and volatility (${(volatility * 100).toFixed(2)}%), ${action} is recommended.`,
      new_range: newRange,
      expected_outcomes: {
        fee_earnings_potential: liquidityUtilization > 50 ? 'high' : 'medium',
        impermanent_loss_risk: impermanentLoss > 10 ? 'high' : 'medium',
        liquidity_utilization: liquidityUtilization > 70 ? 'high' : 'medium',
      },
    },
    monitoring_suggestions: {
      check_frequency_hours: riskLevel === 'high' ? 2 : 6,
      rebalance_triggers: ['liquidity utilization < 20%', 'volatility > 15%'],
      alert_conditions: ['position out of range for >4 hours'],
    },
  };
}

/**
 * Analyze position with LLM and recommend optimal ranges
 */
export const analyzePositionWithLLMTool: VibkitToolDefinition<
  typeof analyzePositionWithLLMParametersSchema,
  Task | Message,
  RebalancerContext
> = {
  name: 'analyzePositionWithLLM',
  description:
    'Analyze LP position using LLM to recommend optimal rebalancing ranges based on market conditions and KPIs',
  parameters: analyzePositionWithLLMParametersSchema,

  execute: async (params: AnalyzePositionWithLLMParams, context: { custom: RebalancerContext }) => {
    try {
      console.log(`🤖 Analyzing position ${params.positionId} with LLM...`);

      // Prepare analysis prompt for LLM
      const analysisPrompt = `
You are an expert DeFi LP analyst for Camelot v3 (Algebra).

Given the KPIs and market context, recommend ONLY these fields (JSON):
{
  "analysis": {
    "position_health": "excellent|good|fair|poor",
    "market_conditions": "favorable|neutral|unfavorable", 
    "risk_level": "low|medium|high",
    "key_insights": ["insight1", "insight2", "insight3"]
  },
  "recommendation": {
    "action": "rebalance|maintain|withdraw",
    "confidence": 0.0-1.0,
    "reasoning": "Detailed explanation of recommendation",
    "risk_level": "conservative|medium|aggressive",
    "half_width_pct": number,     // percent half-width around current token0-in-token1 price (e.g., 5 means ±5%)
    "center_skew_pct": number,    // optional, shift center by +/−% of current price; default 0
    "expected_outcomes": {
      "fee_earnings_potential": "high|medium|low",
      "impermanent_loss_risk": "low|medium|high", 
      "liquidity_utilization": "high|medium|low"
    }
  },
  "monitoring_suggestions": {
    "check_frequency_hours": number,
    "rebalance_triggers": ["trigger1", "trigger2"],
    "alert_conditions": ["condition1", "condition2"]
  }
}

## Position Details:
- Position ID: ${params.positionId}
- Pool Address: ${params.poolAddress}
- Current Price: ${params.currentPrice} (token0-in-token1)
- Current Range: [${params.currentRange.lower}, ${params.currentRange.upper}] ticks
- Risk Profile: ${params.riskProfile}

## Pool KPIs:

### Liquidity Metrics:
${JSON.stringify(params.kpis.liquidity_metrics, null, 2)}

### Price & Volatility Metrics:
${JSON.stringify(params.kpis.price_metrics, null, 2)}

### Volume & Fee Metrics:
${JSON.stringify(params.kpis.volume_fee_metrics, null, 2)}

## Analysis Framework:

1. **Current Position Health**: Assess if the position is in range and earning fees
2. **Market Conditions**: Analyze volatility, liquidity distribution, and trading activity  
3. **Risk Assessment**: Consider impermanent loss potential and concentration risk
4. **Range Recommendation**: Suggest range parameters based on:
   - Current price position
   - Volatility patterns
   - Liquidity concentration
   - Risk profile preferences

## Risk Profile Guidelines:
- **Conservative**: half_width_pct = 2-5%, lower impermanent loss risk
- **Medium**: half_width_pct = 5-10%, moderate risk/reward
- **Aggressive**: half_width_pct = 10-20%, higher fee potential but more risk

STRICT RULES:
- DO NOT output ticks.
- DO NOT output sqrt prices.
- DO NOT output token amounts.
- half_width_pct must be: conservative=2–5, medium=5–10, aggressive=10–20.
- center_skew_pct usually 0; use only if liquidity skew or volatility strongly suggests bias.

Focus on data-driven insights and provide specific, actionable recommendations.
`;

      // Check if LLM is available
      if (!context.custom.llm) {
        console.warn('⚠️  LLM not available, using fallback analysis');
        const fallbackAnalysis = generateFallbackAnalysis(params, params.kpis);
        console.log('🔍 Fallback analysis result:', JSON.stringify(fallbackAnalysis, null, 2));
        return createSuccessTask(
          'analyzePositionWithLLM',
          [
            {
              artifactId: 'llm-analysis-fallback-' + Date.now(),
              parts: [{ kind: 'text', text: JSON.stringify(fallbackAnalysis, null, 2) }],
            },
          ],
          'Position analysis completed with fallback method'
        );
      }

      // Use the LLM to analyze the position
      if (!context.custom.llm) {
        throw new Error('LLM model not available in context');
      }

      const llmResponse = await generateText({
        model: context.custom.llm,
        messages: [
          {
            role: 'system',
            content:
              'You are an expert DeFi liquidity provider analyst. Provide detailed, data-driven analysis and recommendations in the exact JSON format requested.',
          },
          {
            role: 'user',
            content: analysisPrompt,
          },
        ],
        temperature: 0.3, // Lower temperature for more consistent analysis
        maxTokens: 2000,
      });

      // Parse LLM response
      let analysisResult;
      try {
        console.log('🤖 LLM response:', llmResponse.text);
        // Extract JSON from LLM response
        const jsonMatch = llmResponse.text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          analysisResult = JSON.parse(jsonMatch[0]);
          console.log('🔍 Parsed LLM analysis:', JSON.stringify(analysisResult, null, 2));

          // Convert LLM range parameters to actual ticks using deterministic builder
          if (
            analysisResult.recommendation?.action === 'rebalance' &&
            analysisResult.recommendation?.half_width_pct
          ) {
            try {
              console.log(
                `🤖 LLM recommended half_width_pct: ${analysisResult.recommendation.half_width_pct}%`
              );
              console.log(
                `🤖 LLM recommended center_skew_pct: ${analysisResult.recommendation.center_skew_pct || 0}%`
              );

              const rangeResult = buildRangeFromParameters(
                params.currentPrice,
                analysisResult.recommendation.half_width_pct,
                analysisResult.recommendation.center_skew_pct || 0,
                params.tickSpacing
              );

              // Add the calculated range to the recommendation
              analysisResult.recommendation.new_range = {
                lower_tick: rangeResult.lower,
                upper_tick: rangeResult.upper,
                range_width_pct: rangeResult.rangeWidthPct,
              };

              console.log(
                `✅ Built range from LLM parameters: [${rangeResult.lower}, ${rangeResult.upper}] ticks (${rangeResult.rangeWidthPct.toFixed(2)}% width)`
              );
            } catch (rangeError) {
              console.warn('Failed to build range from LLM parameters:', rangeError);
              // Fall back to current range if range building fails
              analysisResult.recommendation.new_range = {
                lower_tick: params.currentRange.lower,
                upper_tick: params.currentRange.upper,
                range_width_pct: 0,
              };
            }
          } else {
            // For maintain/withdraw actions, keep current range
            analysisResult.recommendation.new_range = {
              lower_tick: params.currentRange.lower,
              upper_tick: params.currentRange.upper,
              range_width_pct: 0,
            };
          }
        } else {
          throw new Error('No JSON found in LLM response');
        }
      } catch (parseError) {
        console.warn('Failed to parse LLM response as JSON, using fallback analysis');
        console.log('Parse error:', parseError);
        analysisResult = {
          analysis: {
            position_health: 'fair',
            market_conditions: 'neutral',
            risk_level: 'medium',
            key_insights: ['LLM response parsing failed, using fallback analysis'],
          },
          recommendation: {
            action: 'maintain',
            confidence: 0.5,
            reasoning: 'Unable to parse LLM analysis, maintaining current position',
            new_range: {
              lower_tick: params.currentRange.lower,
              upper_tick: params.currentRange.upper,
              range_width_pct: 0,
            },
            expected_outcomes: {
              fee_earnings_potential: 'medium',
              impermanent_loss_risk: 'medium',
              liquidity_utilization: 'medium',
            },
          },
          monitoring_suggestions: {
            check_frequency_hours: 6,
            rebalance_triggers: ['price moves out of range', 'volatility increases'],
            alert_conditions: ['position out of range for >2 hours'],
          },
        };
      }

      // Add metadata
      const result = {
        position_id: params.positionId,
        pool_address: params.poolAddress,
        analyzed_at: new Date().toISOString(),
        risk_profile: params.riskProfile,
        ...analysisResult,
      };

      console.log(`✅ LLM analysis completed for position ${params.positionId}`);
      console.log(`   - Action: ${result.recommendation.action}`);
      console.log(`   - Confidence: ${(result.recommendation.confidence * 100).toFixed(1)}%`);
      console.log(
        `   - New range: [${result.recommendation.new_range.lower_tick}, ${result.recommendation.new_range.upper_tick}] ticks`
      );
      if (result.recommendation.new_range.range_width_pct > 0) {
        console.log(
          `   - Range width: ${result.recommendation.new_range.range_width_pct.toFixed(2)}%`
        );
      }

      return createSuccessTask(
        'analyzePositionWithLLM',
        [
          {
            artifactId: 'llm-analysis-' + Date.now(),
            parts: [{ kind: 'text', text: JSON.stringify(result, null, 2) }],
          },
        ],
        'Position analysis completed successfully'
      );
    } catch (error) {
      console.error('❌ Error analyzing position with LLM:', error);
      return createErrorTask(
        'analyzePositionWithLLM',
        error instanceof Error ? error : new Error(`Failed to analyze position: ${error}`)
      );
    }
  },
};
