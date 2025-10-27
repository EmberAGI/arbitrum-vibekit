import { generateObject, type LanguageModel } from 'ai';
import type { GreetingState } from '../state.js';
import { OPTIMIZE_STRATEGY_PROMPT } from '../prompts/optimizer.js';
import { optimizerStrategySchema } from '../schemas.js';

export async function optimizerNode(
  state: GreetingState,
  model: LanguageModel
): Promise<Partial<GreetingState>> {
  try {
    const prompt = OPTIMIZE_STRATEGY_PROMPT.replace(
      '{friendlinessSatisfaction}',
      state.evaluationCriteria.friendliness
    )
      .replace('{engagementSatisfaction}', state.evaluationCriteria.engagement)
      .replace('{personalizationSatisfaction}', state.evaluationCriteria.personalization)
      .replace('{overallSatisfaction}', state.overallSatisfaction)
      .replace('{currentIteration}', state.iteration.toString())
      .replace('{improvementInstructions}', state.feedback.join('\n'));

    const { object: strategy } = await generateObject({
      model,
      prompt,
      schema: optimizerStrategySchema,
      temperature: 0.4,
      maxOutputTokens: 300,
    });

    // Update state based on strategy decision
    return {
      feedback: strategy.specificInstructions,
      isAcceptable: !strategy.continueIterating,
    };
  } catch (error) {
    console.error('Optimizer node error:', error);
    // Fallback strategy
    return {
      feedback: state.feedback || [
        'Maintain current approach',
        'Focus on natural conversation flow',
      ],
      isAcceptable: state.iteration >= 2, // Stop after 2 iterations on error
    };
  }
}
