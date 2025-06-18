import { describe, it, expect, vi, beforeEach } from 'vitest';
import { optimizerNode } from '../../src/workflow/nodes/optimizer.js';
import type { GreetingState } from '../../src/workflow/state.js';
import type { LanguageModelV1 } from 'ai';

// Mock the AI SDK
vi.mock('ai', () => ({
  generateObject: vi.fn(),
}));

describe('Optimizer Node', () => {
  let mockModel: LanguageModelV1;
  let baseState: GreetingState;

  beforeEach(() => {
    vi.clearAllMocks();

    // Create a mock model
    mockModel = {} as LanguageModelV1;

    // Base state for testing
    baseState = {
      userInput: 'hello',
      currentGreeting: 'Hello.',
      overallSatisfaction: 'Not satisfied',
      evaluationCriteria: {
        friendliness: 'Not satisfied',
        engagement: 'Not satisfied',
        personalization: 'Somewhat satisfied',
      },
      feedback: ['Too basic and cold', 'No engagement or follow-up', 'Lacks warmth'],
      iteration: 1,
      maxIterations: 3,
      isAcceptable: false,
      evaluationHistory: [],
      feedbackHistory: [],
    };
  });

  it('should generate improvement strategy for low satisfaction', async () => {
    const { generateObject } = await import('ai');
    vi.mocked(generateObject).mockResolvedValueOnce({
      object: {
        strategy: 'major_revision',
        priority: 'friendliness',
        continueIterating: true,
        specificInstructions: [
          'Add a warm greeting phrase like "It\'s great to hear from you!"',
          'Include an emoji to make it more friendly (👋 or 😊)',
          'Ask an open-ended question like "How can I help you today?"',
        ],
        reasoning: 'All criteria are low, need major improvements',
      },
      finishReason: 'stop',
      usage: { promptTokens: 10, completionTokens: 10, totalTokens: 20 },
    } as any);

    const result = await optimizerNode(baseState, mockModel);

    expect(generateObject).toHaveBeenCalledWith({
      model: mockModel,
      prompt: expect.stringContaining('Not satisfied'),
      schema: expect.any(Object),
      temperature: 0.4,
      maxTokens: 300,
    });

    expect(result).toEqual({
      feedback: [
        'Add a warm greeting phrase like "It\'s great to hear from you!"',
        'Include an emoji to make it more friendly (👋 or 😊)',
        'Ask an open-ended question like "How can I help you today?"',
      ],
      isAcceptable: false,
    });
  });

  it('should generate refinement strategy for medium satisfaction', async () => {
    const { generateObject } = await import('ai');
    vi.mocked(generateObject).mockResolvedValueOnce({
      object: {
        strategy: 'incremental',
        priority: 'engagement',
        continueIterating: true,
        specificInstructions: [
          'Add a bit more warmth to the greeting',
          'Include a friendly emoji',
          'Ensure the question is more engaging',
        ],
        reasoning: 'Minor improvements needed',
      },
      finishReason: 'stop',
      usage: { promptTokens: 10, completionTokens: 10, totalTokens: 20 },
    } as any);

    const mediumState = {
      ...baseState,
      overallSatisfaction: 'Satisfied' as const,
      evaluationCriteria: {
        friendliness: 'Satisfied' as const,
        engagement: 'Somewhat satisfied' as const,
        personalization: 'Satisfied' as const,
      },
      feedback: ['Good but could be warmer', 'Question could be more engaging'],
    };

    const result = await optimizerNode(mediumState, mockModel);

    expect(result.feedback).toHaveLength(3);
    expect(result.feedback).toContain('Add a bit more warmth to the greeting');
    expect(result.isAcceptable).toBe(false);
  });

  it('should handle empty response lines', async () => {
    const { generateObject } = await import('ai');
    vi.mocked(generateObject).mockResolvedValueOnce({
      object: {
        strategy: 'incremental',
        priority: 'balanced',
        continueIterating: true,
        specificInstructions: ['Add more warmth', 'Include emoji', 'Ask engaging question'],
        reasoning: 'Incremental improvements across all areas',
      },
      finishReason: 'stop',
      usage: { promptTokens: 10, completionTokens: 10, totalTokens: 20 },
    } as any);

    const result = await optimizerNode(baseState, mockModel);

    expect(result.feedback).toEqual(['Add more warmth', 'Include emoji', 'Ask engaging question']);
  });

  it('should handle optimization errors with fallback', async () => {
    const { generateObject } = await import('ai');
    vi.mocked(generateObject).mockRejectedValueOnce(new Error('API error'));

    const result = await optimizerNode(baseState, mockModel);

    // Should use fallback with existing feedback
    expect(result).toEqual({
      feedback: ['Too basic and cold', 'No engagement or follow-up', 'Lacks warmth'],
      isAcceptable: false,
    });
  });

  it('should generate appropriate strategy based on satisfaction levels', async () => {
    const { generateObject } = await import('ai');
    vi.mocked(generateObject).mockResolvedValueOnce({
      object: {
        strategy: 'major_revision',
        priority: 'friendliness',
        continueIterating: true,
        specificInstructions: [
          'Complete rewrite needed - add warmth, emoji, and engaging question',
          'Transform "Hello." into something like "Hello there! 👋 How can I help you today?"',
          'Make it sound genuinely happy to interact',
        ],
        reasoning: 'Major revision needed for friendliness and engagement',
      },
      finishReason: 'stop',
      usage: { promptTokens: 10, completionTokens: 10, totalTokens: 20 },
    } as any);

    const result = await optimizerNode(baseState, mockModel);

    // Check that the prompt included all satisfaction levels
    expect(generateObject).toHaveBeenCalledWith({
      model: mockModel,
      prompt: expect.stringContaining('Friendliness: Not satisfied'),
      schema: expect.any(Object),
      temperature: 0.4,
      maxTokens: 300,
    });

    // Also verify other satisfaction levels are in the prompt
    const callArgs = vi.mocked(generateObject).mock.calls[0][0];
    expect(callArgs.prompt).toContain('Engagement: Not satisfied');
    expect(callArgs.prompt).toContain('Personalization: Somewhat satisfied');

    expect(result.feedback).toHaveLength(3);
  });
});
