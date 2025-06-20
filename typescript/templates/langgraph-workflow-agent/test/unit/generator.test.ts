import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generatorNode } from '../../src/workflow/nodes/generator.js';
import type { GreetingState } from '../../src/workflow/state.js';
import type { LanguageModelV1 } from 'ai';

// Mock the AI SDK
vi.mock('ai', () => ({
  generateText: vi.fn(),
}));

describe('Generator Node', () => {
  let mockModel: LanguageModelV1;
  let baseState: GreetingState;

  beforeEach(() => {
    vi.clearAllMocks();

    // Create a mock model
    mockModel = {} as LanguageModelV1;

    // Base state for testing
    baseState = {
      userInput: 'hello',
      currentGreeting: '',
      overallSatisfaction: 'Not satisfied',
      evaluationCriteria: {
        friendliness: 'Not satisfied',
        engagement: 'Not satisfied',
        personalization: 'Not satisfied',
      },
      feedback: [],
      iteration: 0,
      maxIterations: 3,
      isAcceptable: false,
      evaluationHistory: [],
      feedbackHistory: [],
    };
  });

  it('should generate initial greeting for normal input', async () => {
    const { generateText } = await import('ai');
    vi.mocked(generateText).mockResolvedValueOnce({
      text: 'Hello there! How can I help you today?',
      finishReason: 'stop',
      usage: { promptTokens: 10, completionTokens: 10, totalTokens: 20 },
    } as any);

    const result = await generatorNode(baseState, mockModel);

    expect(generateText).toHaveBeenCalledWith({
      model: mockModel,
      prompt: expect.stringContaining('hello'),
      temperature: 0.7,
      maxTokens: 200,
    });

    expect(result).toEqual({
      currentGreeting: 'Hello there! How can I help you today?',
      iteration: 1,
    });
  });

  it('should handle weird input - numbers', async () => {
    const { generateText } = await import('ai');
    vi.mocked(generateText).mockResolvedValueOnce({
      text: "I see you're greeting me with numbers! Let me turn that into a warm hello: Hi there! 👋",
      finishReason: 'stop',
      usage: { promptTokens: 10, completionTokens: 10, totalTokens: 20 },
    } as any);

    const numberState = { ...baseState, userInput: '12345' };
    const result = await generatorNode(numberState, mockModel);

    expect(generateText).toHaveBeenCalledWith({
      model: mockModel,
      prompt: expect.stringContaining("it's just numbers"),
      temperature: 0.7,
      maxTokens: 200,
    });

    expect(result.currentGreeting).toContain('numbers');
  });

  it('should handle weird input - very long text', async () => {
    const { generateText } = await import('ai');
    vi.mocked(generateText).mockResolvedValueOnce({
      text: "That's quite a long greeting! Let me respond with something more concise: Hello! 😊",
      finishReason: 'stop',
      usage: { promptTokens: 10, completionTokens: 10, totalTokens: 20 },
    } as any);

    const longInput = 'hello'.repeat(50); // 250 characters
    const longState = { ...baseState, userInput: longInput };
    const result = await generatorNode(longState, mockModel);

    expect(generateText).toHaveBeenCalledWith({
      model: mockModel,
      prompt: expect.stringContaining("it's unusually long"),
      temperature: 0.7,
      maxTokens: 200,
    });

    expect(result.currentGreeting).toBeTruthy();
  });

  it('should handle weird input - no letters', async () => {
    const { generateText } = await import('ai');
    vi.mocked(generateText).mockResolvedValueOnce({
      text: "I see you're using symbols and numbers! Let me greet you properly: Hello! 👋",
      finishReason: 'stop',
      usage: { promptTokens: 10, completionTokens: 10, totalTokens: 20 },
    } as any);

    const noLettersState = { ...baseState, userInput: '123!@#456' };
    const result = await generatorNode(noLettersState, mockModel);

    expect(generateText).toHaveBeenCalledWith({
      model: mockModel,
      prompt: expect.stringContaining('it contains no letters'),
      temperature: 0.7,
      maxTokens: 200,
    });

    expect(result.currentGreeting).toBeTruthy();
  });

  it('should handle weird input - special characters only', async () => {
    const { generateText } = await import('ai');
    vi.mocked(generateText).mockResolvedValueOnce({
      text: "Those are some interesting symbols! Here's a proper greeting: Hi there! 😊",
      finishReason: 'stop',
      usage: { promptTokens: 10, completionTokens: 10, totalTokens: 20 },
    } as any);

    const specialCharsState = { ...baseState, userInput: '!@#$%^&*()' };
    const result = await generatorNode(specialCharsState, mockModel);

    // Special chars with no letters gets caught by "no letters" check first
    expect(generateText).toHaveBeenCalledWith({
      model: mockModel,
      prompt: expect.stringContaining('it contains no letters'),
      temperature: 0.7,
      maxTokens: 200,
    });

    expect(result.currentGreeting).toBeTruthy();
  });

  it('should handle whitespace input as weird (no letters)', async () => {
    const { generateText } = await import('ai');
    vi.mocked(generateText).mockResolvedValueOnce({
      text: 'I see you sent just spaces! Let me greet you properly: Hello! 👋',
      finishReason: 'stop',
      usage: { promptTokens: 10, completionTokens: 10, totalTokens: 20 },
    } as any);

    const emptyState = { ...baseState, userInput: '   ' };
    const result = await generatorNode(emptyState, mockModel);

    // Whitespace-only is weird because it contains no letters
    expect(generateText).toHaveBeenCalledWith({
      model: mockModel,
      prompt: expect.stringContaining('it contains no letters'),
      temperature: 0.7,
      maxTokens: 200,
    });

    expect(result.currentGreeting).toBeTruthy();
  });

  it('should improve greeting based on feedback', async () => {
    const { generateText } = await import('ai');
    vi.mocked(generateText).mockResolvedValueOnce({
      text: "Hello there! 👋 It's wonderful to hear from you. How can I brighten your day?",
      finishReason: 'stop',
      usage: { promptTokens: 10, completionTokens: 10, totalTokens: 20 },
    } as any);

    const improveState = {
      ...baseState,
      iteration: 1,
      currentGreeting: 'Hello.',
      feedback: ['Add more warmth and enthusiasm', 'Include an emoji', 'Ask an engaging question'],
    };

    const result = await generatorNode(improveState, mockModel);

    expect(generateText).toHaveBeenCalledWith({
      model: mockModel,
      prompt: expect.stringContaining('Add more warmth'),
      temperature: 0.7,
      maxTokens: 200,
    });

    expect(result).toEqual({
      currentGreeting:
        "Hello there! 👋 It's wonderful to hear from you. How can I brighten your day?",
      iteration: 2,
    });
  });

  it('should handle generation errors gracefully', async () => {
    const { generateText } = await import('ai');
    vi.mocked(generateText).mockRejectedValueOnce(new Error('API error'));

    const result = await generatorNode(baseState, mockModel);

    expect(result).toEqual({
      currentGreeting: "Hello! I'm here to help. How can I assist you today?",
      iteration: 1,
    });
  });

  it('should preserve existing greeting on error if available', async () => {
    const { generateText } = await import('ai');
    vi.mocked(generateText).mockRejectedValueOnce(new Error('API error'));

    const stateWithGreeting = {
      ...baseState,
      currentGreeting: 'Hi there!',
      iteration: 1,
    };

    const result = await generatorNode(stateWithGreeting, mockModel);

    expect(result).toEqual({
      currentGreeting: 'Hi there!',
      iteration: 2,
    });
  });
});
