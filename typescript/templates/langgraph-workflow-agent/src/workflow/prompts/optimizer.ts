export const OPTIMIZE_STRATEGY_PROMPT = `You are a greeting optimization strategist. Based on the evaluation results, determine the best strategy for improvement.

Current satisfaction levels:
- Friendliness: {friendlinessSatisfaction}
- Engagement: {engagementSatisfaction}
- Personalization: {personalizationSatisfaction}

Overall satisfaction: {overallSatisfaction}
Current iteration: {currentIteration}

Improvement instructions from evaluator:
{improvementInstructions}

Your task is to create a strategy with these fields:

1. **strategy**: Choose the optimization approach
   - "incremental": Small tweaks to the current greeting (most common)
   - "major_revision": Significant changes to approach (if multiple criteria are low)
   - "maintain": Keep current greeting (only if "Very satisfied" or better)

2. **priority**: Identify which aspect needs most attention
   - Focus on the lowest-scoring criterion
   - If all are equal, choose "balanced"

3. **continueIterating**: Decide if more improvements are needed
   - true: If overall satisfaction is below "Very satisfied" AND iteration < 3
   - false: If "Very satisfied" or "Extremely satisfied" OR at iteration 3

4. **specificInstructions**: REQUIRED - Array of 1-3 improvement instructions
   - If evaluator provided instructions, include them
   - If no instructions provided, create basic ones like ["Maintain current approach"]
   - Never leave this field empty

5. **reasoning**: Explain your strategic decisions

Example output structure:
{
  "strategy": "incremental",
  "priority": "personalization",
  "continueIterating": true,
  "specificInstructions": ["Add acknowledgment of simple greeting", "Keep response brief"],
  "reasoning": "Focus on improving personalization which is the lowest criterion"
}`;
