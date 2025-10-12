import { describe, it, expect } from 'vitest';
import { createProviderSelector } from '@emberai/arbitrum-vibekit-core';
import { createGreetingWorkflow } from '../src/workflow/index.js';
import { createInitialState } from '../src/workflow/state.js';

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const describeIfApiKey = OPENROUTER_API_KEY ? describe : describe.skip;

describeIfApiKey('Structured Workflow Test', () => {
  const providers = createProviderSelector({
    openRouterApiKey: OPENROUTER_API_KEY,
  });

  it('should handle simple hello with improved personalization', async () => {
    const model = providers.openrouter!('openai/gpt-4o-mini');
    const workflow = createGreetingWorkflow(model);
    const initialState = createInitialState('hello');

    console.log('\n=== Testing Structured Workflow with "hello" ===\n');

    const result = await workflow.invoke(initialState);

    console.log('Final greeting:', result.currentGreeting);
    console.log('Final satisfaction:', result.overallSatisfaction);
    console.log('Evaluation criteria:', result.evaluationCriteria);
    console.log('Iterations:', result.iteration);

    console.log('\nEvaluation history:');
    result.evaluationHistory.forEach((entry, i) => {
      console.log(`  Iteration ${i + 1}: ${entry.satisfaction}`);
      console.log(`    Greeting: ${entry.greeting}`);
    });

    // The workflow should achieve better personalization
    const acceptableLevels = ['Satisfied', 'Very satisfied', 'Extremely satisfied'];
    expect(acceptableLevels).toContain(result.evaluationCriteria.personalization);

    // Should have at least 2 iterations (initial + 1 improvement)
    expect(result.iteration).toBeGreaterThanOrEqual(2);
    expect(result.iteration).toBeLessThanOrEqual(3);

    // Verify progression - should show improvement from first to final
    if (result.evaluationHistory.length >= 2) {
      const firstEval = result.evaluationHistory[0];
      const lastEval = result.evaluationHistory[result.evaluationHistory.length - 1];
      console.log('\nProgression:');
      console.log(`  First: ${firstEval.satisfaction}`);
      console.log(`  Final: ${lastEval.satisfaction}`);

      // Map satisfaction levels to numeric values for comparison
      const satisfactionLevels = {
        'Not satisfied': 1,
        'Somewhat satisfied': 2,
        Satisfied: 3,
        'Very satisfied': 4,
        'Extremely satisfied': 5,
      };

      const firstScore = satisfactionLevels[firstEval.satisfaction] || 0;
      const lastScore = satisfactionLevels[lastEval.satisfaction] || 0;

      // Should show improvement (or at least maintain high level)
      expect(lastScore).toBeGreaterThanOrEqual(firstScore);
      if (firstScore < 3) {
        // If starting below "Satisfied"
        expect(lastScore).toBeGreaterThan(firstScore); // Must improve
      }
    }
  }, 60000);

  it('should make strategic decisions based on satisfaction levels', async () => {
    const model = providers.openrouter!('openai/gpt-4o-mini');
    const workflow = createGreetingWorkflow(model);
    const initialState = createInitialState('hey there');

    console.log('\n=== Testing Strategic Decision Making ===\n');

    const result = await workflow.invoke(initialState);

    console.log('Final result:', {
      greeting: result.currentGreeting,
      satisfaction: result.overallSatisfaction,
      iterations: result.iteration,
      stopped: result.isAcceptable,
    });

    // Should stop when satisfied or at max iterations
    if (
      result.overallSatisfaction === 'Very satisfied' ||
      result.overallSatisfaction === 'Extremely satisfied'
    ) {
      expect(result.isAcceptable).toBe(true);
    }

    expect(result.iteration).toBeLessThanOrEqual(3);
  }, 60000);

  it('should demonstrate iterative improvement through feedback', async () => {
    const model = providers.openrouter!('openai/gpt-4o-mini');
    const workflow = createGreetingWorkflow(model);
    const initialState = createInitialState('hi');

    console.log('\n=== Testing Iterative Improvement ===\n');

    const result = await workflow.invoke(initialState);

    console.log('Iterations:', result.iteration);
    console.log('\nFeedback progression:');
    result.feedbackHistory.forEach((feedback, i) => {
      console.log(`  Round ${i + 1}:`);
      feedback.forEach(f => console.log(`    - ${f}`));
    });

    // Must have at least one round of feedback
    expect(result.feedbackHistory.length).toBeGreaterThanOrEqual(1);
    expect(result.iteration).toBeGreaterThanOrEqual(2);

    // Each greeting should be different (showing improvement)
    const greetings = result.evaluationHistory.map(e => e.greeting);
    const uniqueGreetings = new Set(greetings);
    expect(uniqueGreetings.size).toBe(greetings.length);
  }, 60000);
});
