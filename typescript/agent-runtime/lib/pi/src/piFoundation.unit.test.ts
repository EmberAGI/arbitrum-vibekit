import { Agent } from '@mariozechner/pi-agent-core';
import {
  EventStream,
  Type,
  type AssistantMessage,
  type AssistantMessageEvent,
  type Message,
  type Model,
} from '@mariozechner/pi-ai';
import { describe, expect, it } from 'vitest';

import { createPiRuntimeGatewayFoundation } from './index.js';

class MockAssistantStream extends EventStream<AssistantMessageEvent, AssistantMessage> {
  constructor() {
    super(
      (event) => event.type === 'done' || event.type === 'error',
      (event) => {
        if (event.type === 'done') return event.message;
        if (event.type === 'error') return event.error;
        throw new Error('Unexpected event type');
      },
    );
  }
}

const createUsage = () => ({
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: 0,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
});

const createModel = (id: string): Model<'openai-responses'> => ({
  id,
  name: id,
  api: 'openai-responses',
  provider: 'openai',
  baseUrl: 'https://example.invalid',
  reasoning: false,
  input: ['text'],
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  contextWindow: 8192,
  maxTokens: 2048,
});

const createAssistantMessage = (content: AssistantMessage['content']): AssistantMessage => ({
  role: 'assistant',
  content,
  api: 'openai-responses',
  provider: 'openai',
  model: 'mock',
  usage: createUsage(),
  stopReason: 'stop',
  timestamp: Date.now(),
});

describe('pi gateway foundation', () => {
  it('builds the gateway around a real pi-agent-core Agent and postgres bootstrap planning', () => {
    const foundation = createPiRuntimeGatewayFoundation({
      model: createModel('test-model'),
      systemPrompt: 'You are Pi.',
    });

    expect(foundation.agent).toBeInstanceOf(Agent);
    expect(foundation.bootstrapPlan).toEqual({
      mode: 'local-docker',
      databaseUrl: 'postgresql://postgres:postgres@127.0.0.1:55432/pi_runtime',
      startCommand:
        'docker run --name pi-runtime-postgres -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=pi_runtime -p 55432:5432 -d postgres:17',
    });
  });

  it('passes Pi-native agent options through while preserving explicit gateway model and prompt inputs', () => {
    const model = createModel('test-model');
    const conflictingModel = createModel('conflicting-model');
    const streamFn = (() => Promise.reject(new Error('unused in this test'))) as Agent['streamFn'];
    const getApiKey = () => 'test-key';

    const foundation = createPiRuntimeGatewayFoundation({
      model,
      systemPrompt: 'You are Pi.',
      agentOptions: {
        sessionId: 'pi-session-123',
        transport: 'fetch',
        maxRetryDelayMs: 2500,
        toolExecution: 'sequential',
        streamFn,
        getApiKey,
        initialState: {
          model: conflictingModel,
          systemPrompt: 'Conflicting prompt',
        },
      },
    });

    expect(foundation.agent.sessionId).toBe('pi-session-123');
    expect(foundation.agent.transport).toBe('fetch');
    expect(foundation.agent.maxRetryDelayMs).toBe(2500);
    expect(foundation.agent.toolExecution).toBe('sequential');
    expect(foundation.agent.streamFn).toBe(streamFn);
    expect(foundation.agent.getApiKey).toBe(getApiKey);
    expect(foundation.agent.state.model).toBe(model);
    expect(foundation.agent.state.systemPrompt).toBe('You are Pi.');
  });

  it('injects session context through Pi-native transformContext and convertToLlm defaults', async () => {
    const captured = {
      messages: [] as Message[],
    };

    const foundation = createPiRuntimeGatewayFoundation({
      model: createModel('test-model'),
      systemPrompt: 'You are Pi.',
      now: () => 456,
      getSessionContext: () => ({
        thread: { id: 'thread-ctx' },
        execution: {
          id: 'exec-ctx',
          status: 'interrupted',
          statusMessage: 'Waiting for wallet confirmation.',
        },
        artifacts: {
          current: { artifactId: 'artifact-1', data: { phase: 'setup' } },
        },
        a2ui: {
          kind: 'interrupt',
          payload: { type: 'operator-config-request' },
        },
      }),
      agentOptions: {
        streamFn: (_model, context) => {
          captured.messages = context.messages;
          const stream = new MockAssistantStream();
          queueMicrotask(() => {
            stream.push({
              type: 'done',
              reason: 'stop',
              message: createAssistantMessage([{ type: 'text', text: 'Context captured.' }]),
            });
          });
          return stream;
        },
      },
    });

    await foundation.agent.prompt('Hello Pi');

    expect(captured.messages).toEqual([
      {
        role: 'user',
        content: [{ type: 'text', text: 'Hello Pi' }],
        timestamp: expect.any(Number),
      },
      {
        role: 'user',
        content:
          '<pi-runtime-gateway>Thread thread-ctx execution exec-ctx is interrupted. Waiting for wallet confirmation.</pi-runtime-gateway>',
        timestamp: 456,
      },
    ]);
  });

  it('fails fast when tools use non-portable names', () => {
    expect(() =>
      createPiRuntimeGatewayFoundation({
        model: createModel('test-model'),
        systemPrompt: 'You are Pi.',
        tools: [
          {
            name: 'automation.schedule',
            description: 'Invalid for cross-provider tool naming.',
            parameters: Type.Object({}),
            execute: async () => ({
              content: [{ type: 'text' as const, text: 'unused' }],
            }),
          },
        ],
      }),
    ).toThrow(
      'Invalid Pi tool name(s): automation.schedule. Tool names must match ^[a-zA-Z0-9_-]+$ for cross-provider compatibility.',
    );
  });
});
