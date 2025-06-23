import { describe, it, expect, vi, beforeEach } from 'vitest';
import { evaluatorNode } from '../../src/workflow/nodes/evaluator.js';
import type { GreetingState } from '../../src/workflow/state.js';
import type { LanguageModelV1 } from 'ai';

// Mock the AI SDK
vi.mock('ai', () => ({
  generateObject: vi.fn(),
}));

describe('Evaluator Node', () => {
  let mockModel: LanguageModelV1;
  let baseState: GreetingState;

  beforeEach(() => {
    vi.clearAllMocks();

    // Create a mock model
    mockModel = {} as LanguageModelV1;

    // Base state for testing
    baseState = {
      userInput: 'hello',
      currentGreeting: 'Hello there! How can I help you today?',
      overallSatisfaction: 'Not satisfied',
      evaluationCriteria: {
        friendliness: 'Not satisfied',
        engagement: 'Not satisfied',
        personalization: 'Not satisfied',
      },
      feedback: [],
      iteration: 1,
      maxIterations: 3,
      isAcceptable: false,
      evaluationHistory: [],
      feedbackHistory: [],
    };
  });

  it('should evaluate greeting with high satisfaction', async () => {
    const { generateObject } = await import('ai');
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
        reasoning: 'Excellent greeting with warmth and engagement',
      },
      finishReason: 'stop',
      usage: { promptTokens: 10, completionTokens: 10, totalTokens: 20 },
    } as any);

    const result = await evaluatorNode(baseState, mockModel);

    expect(generateObject).toHaveBeenCalledWith({
      model: mockModel,
      prompt: expect.stringContaining('hello'),
      schema: expect.any(Object),
      temperature: 0.3,
      maxTokens: 1000,
    });

    expect(result).toEqual({
      evaluationCriteria: {
        friendliness: 'Very satisfied',
        engagement: 'Very satisfied',
        personalization: 'Very satisfied',
      },
      overallSatisfaction: 'Very satisfied',
      feedback: [],
      isAcceptable: true,
      evaluationHistory: [
        {
          iteration: 1,
          satisfaction: 'Very satisfied',
          greeting: 'Hello there! How can I help you today?',
        },
      ],
      feedbackHistory: [
        [
          'Very satisfied with friendliness',
          'Very satisfied with engagement',
          'Very satisfied with personalization',
        ],
      ],
    });
  });

  it('should evaluate greeting with mixed satisfaction levels', async () => {
    const { generateObject } = await import('ai');
    vi.mocked(generateObject).mockResolvedValueOnce({
      object: {
        criteria: {
          friendliness: 'Satisfied',
          engagement: 'Not satisfied',
          personalization: 'Somewhat satisfied',
        },
        improvements: {
          friendliness: ['Could be warmer'],
          engagement: ['No engaging follow-up question'],
          personalization: ['Lacks personal touch'],
        },
        reasoning: 'Needs improvement in engagement',
      },
      finishReason: 'stop',
      usage: { promptTokens: 10, completionTokens: 10, totalTokens: 20 },
    } as any);

    const result = await evaluatorNode(baseState, mockModel);

    expect(result.overallSatisfaction).toEqual('Not satisfied'); // Lowest of the three
    expect(result.isAcceptable).toBe(false);
    expect(result.evaluationCriteria).toEqual({
      friendliness: 'Satisfied',
      engagement: 'Not satisfied',
      personalization: 'Somewhat satisfied',
    });
  });

  it('should handle extremely satisfied evaluation', async () => {
    const { generateObject } = await import('ai');
    vi.mocked(generateObject).mockResolvedValueOnce({
      object: {
        criteria: {
          friendliness: 'Extremely satisfied',
          engagement: 'Extremely satisfied',
          personalization: 'Very satisfied',
        },
        improvements: {
          friendliness: [],
          engagement: [],
          personalization: [],
        },
        reasoning: 'Outstanding greeting',
      },
      finishReason: 'stop',
      usage: { promptTokens: 10, completionTokens: 10, totalTokens: 20 },
    } as any);

    const result = await evaluatorNode(baseState, mockModel);

    expect(result.overallSatisfaction).toEqual('Very satisfied'); // Lowest of the three
    expect(result.isAcceptable).toBe(true); // Both "Very" and "Extremely" are acceptable
  });

  it('should handle malformed JSON response', async () => {
    const { generateObject } = await import('ai');
    vi.mocked(generateObject).mockRejectedValueOnce(new Error('Failed to parse JSON'));

    const result = await evaluatorNode(baseState, mockModel);

    // Should use fallback evaluation
    expect(result.overallSatisfaction).toEqual('Satisfied');
    expect(result.isAcceptable).toBe(true);
    expect(result.feedback).toContain('Continue with current approach');
  });

  it('should handle evaluation errors gracefully', async () => {
    const { generateObject } = await import('ai');
    vi.mocked(generateObject).mockRejectedValueOnce(new Error('API error'));

    const result = await evaluatorNode(baseState, mockModel);

    // Should use fallback evaluation
    expect(result.overallSatisfaction).toEqual('Satisfied');
    expect(result.isAcceptable).toBe(true);
    expect(result.feedback).toContain('Continue with current approach');
  });

  it('should accumulate evaluation history', async () => {
    const { generateObject } = await import('ai');
    vi.mocked(generateObject).mockResolvedValueOnce({
      object: {
        criteria: {
          friendliness: 'Somewhat satisfied',
          engagement: 'Satisfied',
          personalization: 'Satisfied',
        },
        improvements: {
          friendliness: ['Needs more warmth'],
          engagement: [],
          personalization: [],
        },
        reasoning: 'Good but could be warmer',
      },
      finishReason: 'stop',
      usage: { promptTokens: 10, completionTokens: 10, totalTokens: 20 },
    } as any);

    const stateWithHistory = {
      ...baseState,
      evaluationHistory: [
        {
          iteration: 0,
          satisfaction: 'Not satisfied' as const,
          greeting: 'Hello.',
        },
      ],
      feedbackHistory: [['Too basic', 'No engagement']],
    };

    const result = await evaluatorNode(stateWithHistory, mockModel);

    expect(result.evaluationHistory).toHaveLength(2);
    expect(result.evaluationHistory![1]).toEqual({
      iteration: 1,
      satisfaction: 'Somewhat satisfied',
      greeting: 'Hello there! How can I help you today?',
    });
    expect(result.feedbackHistory).toHaveLength(2);
  });
});
