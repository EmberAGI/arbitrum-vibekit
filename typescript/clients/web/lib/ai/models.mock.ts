// @ts-nocheck
import { simulateReadableStream } from 'ai';
import { MockLanguageModelV2 } from 'ai/test';
import { getResponseChunksByPrompt } from '@/lib/test-utils/prompts/utils';

export const chatModel = new MockLanguageModelV2({
  doGenerate: async (_options) => ({
    finishReason: 'stop',
    usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
    content: [{ type: 'text', text: `Hello, world!` }],
    warnings: [],
  }),
  doStream: async ({ prompt }) => ({
    stream: simulateReadableStream({
      chunkDelayInMs: 50,
      initialDelayInMs: 100,
      chunks: getResponseChunksByPrompt(prompt),
    }),
  }),
});

export const reasoningModel = new MockLanguageModelV2({
  doGenerate: async (_options) => ({
    finishReason: 'stop',
    usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
    content: [{ type: 'text', text: `Hello, world!` }],
    warnings: [],
  }),
  doStream: async ({ prompt }) => ({
    stream: simulateReadableStream({
      chunkDelayInMs: 50,
      initialDelayInMs: 500,
      chunks: getResponseChunksByPrompt(prompt, true),
    }),
  }),
});

export const titleModel = new MockLanguageModelV2({
  doGenerate: async (_options) => ({
    finishReason: 'stop',
    usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
    content: [{ type: 'text', text: `This is a test title` }],
    warnings: [],
  }),
  doStream: async (_options) => ({
    stream: simulateReadableStream({
      chunkDelayInMs: 50,
      initialDelayInMs: 100,
      chunks: [
        { type: 'text-delta', id: '1', delta: 'This is a test title' },
        {
          type: 'finish',
          finishReason: 'stop',
          logprobs: undefined,
          usage: { inputTokens: 3, outputTokens: 10, totalTokens: 13 },
        },
      ],
    }),
  }),
});

export const artifactModel = new MockLanguageModelV2({
  doGenerate: async (_options) => ({
    finishReason: 'stop',
    usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
    content: [{ type: 'text', text: `Hello, world!` }],
    warnings: [],
  }),
  doStream: async ({ prompt }) => ({
    stream: simulateReadableStream({
      chunkDelayInMs: 50,
      initialDelayInMs: 100,
      chunks: getResponseChunksByPrompt(prompt),
    }),
  }),
});
