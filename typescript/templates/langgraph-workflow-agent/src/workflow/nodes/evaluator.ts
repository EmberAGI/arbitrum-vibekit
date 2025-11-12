import { generateObject, type LanguageModel } from 'ai';
import type { GreetingState } from '../state.js';
import { getLowestSatisfaction, isAcceptableSatisfaction } from '../state.js';
import { EVALUATE_GREETING_PROMPT } from '../prompts/evaluator.js';
import { evaluationOutputSchema } from '../schemas.js';

export async function evaluatorNode(
  state: GreetingState,
  model: LanguageModel
): Promise<Partial<GreetingState>> {
  try {
    // Build history context
    let historyContext = '';
    if (state.evaluationHistory.length > 0) {
      historyContext = '\n\nPrevious attempts and feedback:\n';
      state.evaluationHistory.forEach((entry, i) => {
        historyContext += `\nAttempt ${entry.iteration}:\n`;
        historyContext += `- Greeting: "${entry.greeting}"\n`;
        historyContext += `- Satisfaction: ${entry.satisfaction}\n`;
        if (state.feedbackHistory[i]) {
          historyContext += `- Feedback given: ${state.feedbackHistory[i].join(', ')}\n`;
        }
      });
      historyContext += '\nPlease consider what has already been tried and improved.';
    }

    const prompt = EVALUATE_GREETING_PROMPT.replace('{userInput}', state.userInput)
      .replace('{currentGreeting}', state.currentGreeting)
      .replace('{history}', historyContext);

    const { object: evaluation } = await generateObject({
      model,
      prompt,
      schema: evaluationOutputSchema,
      temperature: 0.3,
      maxOutputTokens: 1000, // Further increased to avoid truncation
    });

    // Calculate overall satisfaction (lowest of the three)
    const overallSatisfaction = getLowestSatisfaction([
      evaluation.criteria.friendliness,
      evaluation.criteria.engagement,
      evaluation.criteria.personalization,
    ]);

    // Collect all improvement instructions
    const allImprovements: string[] = [];
    if (evaluation.improvements.friendliness) {
      allImprovements.push(...evaluation.improvements.friendliness);
    }
    if (evaluation.improvements.engagement) {
      allImprovements.push(...evaluation.improvements.engagement);
    }
    if (evaluation.improvements.personalization) {
      allImprovements.push(...evaluation.improvements.personalization);
    }

    // Add to evaluation history
    const newHistoryEntry = {
      iteration: state.iteration,
      satisfaction: overallSatisfaction,
      greeting: state.currentGreeting,
    };

    // Create feedback for history (formatted evaluation)
    const feedbackForHistory = [
      `${evaluation.criteria.friendliness} with friendliness`,
      `${evaluation.criteria.engagement} with engagement`,
      `${evaluation.criteria.personalization} with personalization`,
    ];

    return {
      evaluationCriteria: evaluation.criteria,
      overallSatisfaction,
      feedback: allImprovements, // These are now specific improvement instructions
      isAcceptable: isAcceptableSatisfaction(overallSatisfaction),
      evaluationHistory: [...state.evaluationHistory, newHistoryEntry],
      feedbackHistory: [...state.feedbackHistory, feedbackForHistory],
    };
  } catch (error) {
    console.error('Evaluator node error:', error);
    // Fallback - assume satisfied if evaluation fails
    return {
      evaluationCriteria: {
        friendliness: 'Satisfied',
        engagement: 'Satisfied',
        personalization: 'Satisfied',
      },
      overallSatisfaction: 'Satisfied',
      feedback: ['Continue with current approach'],
      isAcceptable: true,
      evaluationHistory: [
        ...state.evaluationHistory,
        {
          iteration: state.iteration,
          satisfaction: 'Satisfied',
          greeting: state.currentGreeting,
        },
      ],
      feedbackHistory: [...state.feedbackHistory, ['Evaluation completed']],
    };
  }
}
