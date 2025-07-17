import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createGreetingWorkflow } from '../../src/workflow/index.js';
import { createInitialState } from '../../src/workflow/state.js';
import type { LanguageModelV1 } from 'ai';

// Mock the AI SDK
vi.mock('ai', () => ({
  generateText: vi.fn(),
  generateObject: vi.fn(),
}));

describe('Greeting Workflow', () => {
  let mockModel: LanguageModelV1;

  beforeEach(() => {
    vi.clearAllMocks();
    mockModel = {} as LanguageModelV1;
  });

  it('should complete workflow with satisfactory result in one iteration', async () => {
    const { generateText, generateObject } = await import('ai');

    // Mock generator to create a good greeting
    vi.mocked(generateText).mockResolvedValueOnce({
      text: 'Hello there! 👋 Welcome! How can I help you today?',
      finishReason: 'stop',
      usage: { promptTokens: 10, completionTokens: 10, totalTokens: 20 },
    } as any);

    // Mock evaluator to rate it as "Very satisfied"
    vi.mocked(generateObject).mockResolvedValueOnce({
      object: {
        criteria: {
          friendliness: 'Very satisfied',
          engagement: 'Very satisfied',
          personalization: 'Very satisfied',
        },
        improvements: {
          friendliness: [],
          engagement: [],
          personalization: [],
        },
        reasoning: 'Excellent greeting!',
      },
      finishReason: 'stop',
      usage: { promptTokens: 10, completionTokens: 10, totalTokens: 20 },
    } as any);

    const workflow = createGreetingWorkflow(mockModel);
    const initialState = createInitialState('hello');
    const result = await workflow.invoke(initialState);

    // Verify workflow completed successfully
    expect(result.iteration).toBe(1);
    expect(result.isAcceptable).toBe(true);
    expect(result.overallSatisfaction).toBe('Very satisfied');
    expect(result.currentGreeting).toBe('Hello there! 👋 Welcome! How can I help you today?');

    // Verify only generator and evaluator were called (no optimizer needed)
    expect(generateText).toHaveBeenCalledTimes(1);
    expect(generateObject).toHaveBeenCalledTimes(1);
  });

  it('should iterate through full optimization cycle', async () => {
    const { generateText, generateObject } = await import('ai');

    // Iteration 1: Poor greeting
    vi.mocked(generateText).mockResolvedValueOnce({
      text: 'Hello.',
      finishReason: 'stop',
      usage: { promptTokens: 10, completionTokens: 10, totalTokens: 20 },
    } as any);

    // Evaluation 1: Not satisfied
    vi.mocked(generateObject).mockResolvedValueOnce({
      object: {
        criteria: {
          friendliness: 'Not satisfied',
          engagement: 'Not satisfied',
          personalization: 'Somewhat satisfied',
        },
        improvements: {
          friendliness: ['Too brief', 'No warmth'],
          engagement: ['No engagement'],
          personalization: [],
        },
        reasoning: 'Needs improvement',
      },
      finishReason: 'stop',
      usage: { promptTokens: 10, completionTokens: 10, totalTokens: 20 },
    } as any);

    // Optimizer 1: Suggest improvements
    vi.mocked(generateObject).mockResolvedValueOnce({
      object: {
        strategy: 'major_revision',
        priority: 'friendliness',
        continueIterating: true,
        specificInstructions: [
          'Add warmth with emoji',
          'Include engaging question',
          'Make it more personal',
        ],
        reasoning: 'Major improvements needed',
      },
      finishReason: 'stop',
      usage: { promptTokens: 10, completionTokens: 10, totalTokens: 20 },
    } as any);

    // Iteration 2: Better greeting
    vi.mocked(generateText).mockResolvedValueOnce({
      text: 'Hello there! 👋 How can I help you today?',
      finishReason: 'stop',
      usage: { promptTokens: 10, completionTokens: 10, totalTokens: 20 },
    } as any);

    // Evaluation 2: Very satisfied (all criteria must be at least "Very satisfied" to be acceptable)
    vi.mocked(generateObject).mockResolvedValueOnce({
      object: {
        criteria: {
          friendliness: 'Very satisfied',
          engagement: 'Very satisfied',
          personalization: 'Very satisfied',
        },
        improvements: {
          friendliness: [],
          engagement: [],
          personalization: [],
        },
        reasoning: 'Much better!',
      },
      finishReason: 'stop',
      usage: { promptTokens: 10, completionTokens: 10, totalTokens: 20 },
    } as any);

    const workflow = createGreetingWorkflow(mockModel);
    const initialState = createInitialState('hello');
    const result = await workflow.invoke(initialState);

    // Verify workflow completed after 2 iterations
    expect(result.iteration).toBe(2);
    expect(result.isAcceptable).toBe(true);
    expect(result.overallSatisfaction).toBe('Very satisfied'); // All are "Very satisfied"
    expect(result.currentGreeting).toBe('Hello there! 👋 How can I help you today?');

    // Verify full cycle: generate -> evaluate -> optimize -> generate -> evaluate
    expect(generateText).toHaveBeenCalledTimes(2);
    expect(generateObject).toHaveBeenCalledTimes(3);

    // Verify history was accumulated
    expect(result.evaluationHistory).toHaveLength(2);
    expect(result.evaluationHistory[0].satisfaction).toBe('Not satisfied');
    expect(result.evaluationHistory[1].satisfaction).toBe('Very satisfied');
    expect(result.feedbackHistory).toHaveLength(2);
  });

  it('should stop after max iterations even if not satisfied', async () => {
    const { generateText, generateObject } = await import('ai');

    // Mock all iterations to be "Somewhat satisfied" (not acceptable)
    for (let i = 0; i < 3; i++) {
      // Generator
      vi.mocked(generateText).mockResolvedValueOnce({
        text: `Hello attempt ${i + 1}`,
        finishReason: 'stop',
        usage: { promptTokens: 10, completionTokens: 10, totalTokens: 20 },
      } as any);

      // Evaluator
      vi.mocked(generateObject).mockResolvedValueOnce({
        object: {
          criteria: {
            friendliness: 'Somewhat satisfied',
            engagement: 'Somewhat satisfied',
            personalization: 'Somewhat satisfied',
          },
          improvements: {
            friendliness: ['Still needs work'],
            engagement: [],
            personalization: [],
          },
          reasoning: 'Not quite there yet',
        },
        finishReason: 'stop',
        usage: { promptTokens: 10, completionTokens: 10, totalTokens: 20 },
      } as any);

      // Optimizer (except on last iteration)
      if (i < 2) {
        vi.mocked(generateObject).mockResolvedValueOnce({
          object: {
            strategy: 'incremental',
            priority: 'friendliness',
            continueIterating: true,
            specificInstructions: ['Try harder'],
            reasoning: 'Keep improving',
          },
          finishReason: 'stop',
          usage: { promptTokens: 10, completionTokens: 10, totalTokens: 20 },
        } as any);
      }
    }

    const workflow = createGreetingWorkflow(mockModel);
    const initialState = createInitialState('hello');
    const result = await workflow.invoke(initialState);

    // Verify workflow stopped at max iterations
    expect(result.iteration).toBe(3);
    expect(result.isAcceptable).toBe(false);
    expect(result.overallSatisfaction).toBe('Somewhat satisfied');

    // 3 iterations: (gen + eval + opt) + (gen + eval + opt) + (gen + eval)
    expect(generateText).toHaveBeenCalledTimes(3);
    expect(generateObject).toHaveBeenCalledTimes(5);
  });

  it('should handle weird input through the workflow', async () => {
    const { generateText, generateObject } = await import('ai');

    // Generator handles numbers input
    vi.mocked(generateText).mockResolvedValueOnce({
      text: "I see you're greeting me with numbers! Here's a proper hello: Hi there! 👋",
      finishReason: 'stop',
      usage: { promptTokens: 10, completionTokens: 10, totalTokens: 20 },
    } as any);

    // Evaluator rates it well
    vi.mocked(generateObject).mockResolvedValueOnce({
      object: {
        criteria: {
          friendliness: 'Very satisfied',
          engagement: 'Very satisfied',
          personalization: 'Extremely satisfied',
        },
        improvements: {
          friendliness: [],
          engagement: [],
          personalization: [],
        },
        reasoning: 'Handled weird input perfectly!',
      },
      finishReason: 'stop',
      usage: { promptTokens: 10, completionTokens: 10, totalTokens: 20 },
    } as any);

    const workflow = createGreetingWorkflow(mockModel);
    const initialState = createInitialState('12345');
    const result = await workflow.invoke(initialState);

    expect(result.iteration).toBe(1);
    expect(result.isAcceptable).toBe(true);
    expect(result.currentGreeting).toContain('numbers');
  });

  it('should handle errors gracefully and continue workflow', async () => {
    const { generateText, generateObject } = await import('ai');

    // Generator succeeds
    vi.mocked(generateText).mockResolvedValueOnce({
      text: 'Hello!',
      finishReason: 'stop',
      usage: { promptTokens: 10, completionTokens: 10, totalTokens: 20 },
    } as any);

    // Evaluator fails (API error) - it will use fallback
    vi.mocked(generateObject).mockRejectedValueOnce(new Error('API error'));

    // Since evaluator fails with fallback as Satisfied/acceptable=true, workflow should end
    const workflow = createGreetingWorkflow(mockModel);
    const initialState = createInitialState('hello');
    const result = await workflow.invoke(initialState);

    // Workflow should complete after first iteration due to fallback
    expect(result.iteration).toBe(1);
    expect(result.isAcceptable).toBe(true);
    expect(result.overallSatisfaction).toBe('Satisfied');

    // Should see fallback feedback
    expect(result.feedback).toContain('Continue with current approach');
  });

  it('should verify correct node connections and conditional edges', async () => {
    const { generateText, generateObject } = await import('ai');

    // Set up a scenario that tests the conditional edge
    // First iteration: not acceptable -> goes to optimizer
    vi.mocked(generateText).mockResolvedValueOnce({
      text: 'Hi',
      finishReason: 'stop',
      usage: { promptTokens: 10, completionTokens: 10, totalTokens: 20 },
    } as any);

    vi.mocked(generateObject).mockResolvedValueOnce({
      object: {
        criteria: {
          friendliness: 'Not satisfied',
          engagement: 'Not satisfied',
          personalization: 'Not satisfied',
        },
        improvements: {
          friendliness: ['Too short'],
          engagement: [],
          personalization: [],
        },
        reasoning: 'Needs work',
      },
      finishReason: 'stop',
      usage: { promptTokens: 10, completionTokens: 10, totalTokens: 20 },
    } as any);

    // Verify that optimizer is called (proving the conditional edge works)
    let optimizerCalled = false;
    vi.mocked(generateObject).mockImplementationOnce(async () => {
      optimizerCalled = true;
      return {
        object: {
          strategy: 'major_revision',
          priority: 'friendliness',
          continueIterating: true,
          specificInstructions: ['Make it longer'],
          reasoning: 'Needs improvement',
        },
        finishReason: 'stop',
        usage: { promptTokens: 10, completionTokens: 10, totalTokens: 20 },
      } as any;
    });

    // Second iteration: acceptable -> should end
    vi.mocked(generateText).mockResolvedValueOnce({
      text: 'Hello! Welcome!',
      finishReason: 'stop',
      usage: { promptTokens: 10, completionTokens: 10, totalTokens: 20 },
    } as any);

    vi.mocked(generateObject).mockResolvedValueOnce({
      object: {
        criteria: {
          friendliness: 'Very satisfied',
          engagement: 'Very satisfied',
          personalization: 'Very satisfied',
        },
        improvements: {
          friendliness: [],
          engagement: [],
          personalization: [],
        },
        reasoning: 'Perfect!',
      },
      finishReason: 'stop',
      usage: { promptTokens: 10, completionTokens: 10, totalTokens: 20 },
    } as any);

    const workflow = createGreetingWorkflow(mockModel);
    const initialState = createInitialState('hello');
    const result = await workflow.invoke(initialState);

    // Verify optimizer was called in first iteration
    expect(optimizerCalled).toBe(true);

    // Verify workflow ended after acceptable result
    expect(result.iteration).toBe(2);
    expect(result.isAcceptable).toBe(true);

    // Verify no extra calls after acceptable result
    expect(generateText).toHaveBeenCalledTimes(2);
    expect(generateObject).toHaveBeenCalledTimes(3);
  });

  it('should maintain state consistency throughout workflow', async () => {
    const { generateText, generateObject } = await import('ai');

    // Track state changes through the workflow

    // Mock implementations that capture state
    vi.mocked(generateText)
      .mockImplementationOnce(async ({ prompt }) => {
        // Generator should see initial state
        expect(prompt).toContain('hello');
        return {
          text: 'Hello!',
          finishReason: 'stop',
          usage: { promptTokens: 10, completionTokens: 10, totalTokens: 20 },
        } as any;
      })
      .mockImplementationOnce(async ({ prompt }) => {
        // Second generator should see feedback
        expect(prompt).toContain('Add a question');
        return {
          text: 'Hello! How are you?',
          finishReason: 'stop',
          usage: { promptTokens: 10, completionTokens: 10, totalTokens: 20 },
        } as any;
      });

    vi.mocked(generateObject)
      .mockImplementationOnce(async ({ prompt }) => {
        // Evaluator should see the generated greeting
        expect(prompt).toContain('Hello!');
        return {
          object: {
            criteria: {
              friendliness: 'Satisfied',
              engagement: 'Not satisfied',
              personalization: 'Satisfied',
            },
            improvements: {
              friendliness: [],
              engagement: ['Needs engagement'],
              personalization: [],
            },
            reasoning: 'Missing engagement',
          },
          finishReason: 'stop',
          usage: { promptTokens: 10, completionTokens: 10, totalTokens: 20 },
        } as any;
      })
      .mockImplementationOnce(async ({ prompt }) => {
        // Optimizer should see evaluation results
        expect(prompt).toContain('Not satisfied');
        expect(prompt).toContain('Needs engagement');
        return {
          object: {
            strategy: 'incremental',
            priority: 'engagement',
            continueIterating: true,
            specificInstructions: ['Add a question'],
            reasoning: 'Improve engagement',
          },
          finishReason: 'stop',
          usage: { promptTokens: 10, completionTokens: 10, totalTokens: 20 },
        } as any;
      })
      .mockImplementationOnce(async () => {
        // Second evaluation
        return {
          object: {
            criteria: {
              friendliness: 'Very satisfied',
              engagement: 'Very satisfied',
              personalization: 'Very satisfied',
            },
            improvements: {
              friendliness: [],
              engagement: [],
              personalization: [],
            },
            reasoning: 'Great!',
          },
          finishReason: 'stop',
          usage: { promptTokens: 10, completionTokens: 10, totalTokens: 20 },
        } as any;
      });

    const workflow = createGreetingWorkflow(mockModel);
    const initialState = createInitialState('hello');
    const result = await workflow.invoke(initialState);

    // Verify state was properly maintained
    expect(result.userInput).toBe('hello'); // Original input preserved
    expect(result.currentGreeting).toBe('Hello! How are you?'); // Final greeting
    expect(result.iteration).toBe(2);
    expect(result.evaluationHistory).toHaveLength(2);
    expect(result.feedbackHistory).toHaveLength(2);
  });
});
