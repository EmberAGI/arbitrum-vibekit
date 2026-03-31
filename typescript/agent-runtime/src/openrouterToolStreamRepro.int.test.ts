import { Type, streamSimple, type Model } from '@mariozechner/pi-ai';
import { describe, expect, it } from 'vitest';

const RUN_OPENROUTER_TOOL_STREAM_REPRO =
  process.env.RUN_OPENROUTER_TOOL_STREAM_REPRO === '1';
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY?.trim();
const maybeIt =
  RUN_OPENROUTER_TOOL_STREAM_REPRO && OPENROUTER_API_KEY ? it : it.skip;

type OpenRouterStreamEvent = {
  type?: string;
  item?: {
    type?: string;
    arguments?: string;
  };
  response?: {
    status?: string;
  };
};

function createOpenRouterModel(): Model<'openai-responses'> {
  return {
    id: 'openai/gpt-5.4-mini',
    name: 'openai/gpt-5.4-mini',
    api: 'openai-responses',
    provider: 'openrouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    reasoning: true,
    input: ['text'],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 8192,
    maxTokens: 2048,
  };
}

function createDiagnosticToolParameters() {
  return Type.Object({
    label: Type.String(),
  });
}

async function readRawOpenRouterToolCallEvents(): Promise<OpenRouterStreamEvent[]> {
  const response = await fetch('https://openrouter.ai/api/v1/responses', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${OPENROUTER_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'openai/gpt-5.4-mini',
      input: [
        {
          role: 'system',
          content:
            'Call diagnostic_runtime_ping with the provided label when the user asks. Do not answer without calling it.',
        },
        {
          role: 'user',
          content:
            'Call diagnostic_runtime_ping with label repro-openrouter and then tell me the exact result.',
        },
      ],
      tools: [
        {
          type: 'function',
          name: 'diagnostic_runtime_ping',
          description: 'Diagnostic-only ping tool.',
          parameters: {
            type: 'object',
            properties: {
              label: { type: 'string' },
            },
            required: ['label'],
            additionalProperties: false,
          },
        },
      ],
      tool_choice: {
        type: 'function',
        name: 'diagnostic_runtime_ping',
      },
      reasoning: { effort: 'low' },
      stream: true,
      store: false,
    }),
  });

  expect(response.status).toBe(200);

  const body = await response.text();
  const events: OpenRouterStreamEvent[] = [];
  for (const line of body.split('\n')) {
    if (!line.startsWith('data: ')) {
      continue;
    }

    const data = line.slice(6).trim();
    if (!data || data === '[DONE]') {
      continue;
    }

    events.push(JSON.parse(data) as OpenRouterStreamEvent);
  }

  return events;
}

async function readPiAiTerminalError(): Promise<{
  errorMessage: string | undefined;
  finalMessage: Awaited<ReturnType<ReturnType<typeof streamSimple>['result']>>;
  stopReason: string;
}> {
  const stream = await streamSimple(
    createOpenRouterModel(),
    {
      systemPrompt:
        'Call diagnostic_runtime_ping with the provided label when the user asks. Do not answer without calling it.',
      messages: [
        {
          role: 'user',
          content:
            'Call diagnostic_runtime_ping with label repro-openrouter and then tell me the exact result.',
          timestamp: Date.now(),
        },
      ],
      tools: [
        {
          name: 'diagnostic_runtime_ping',
          label: 'Diagnostic Runtime Ping',
          description: 'Diagnostic-only ping tool.',
          parameters: createDiagnosticToolParameters(),
          execute: async () => ({
            content: [{ type: 'text' as const, text: 'unused' }],
            details: {},
          }),
        },
      ],
    },
    {
      apiKey: OPENROUTER_API_KEY,
      reasoning: 'low',
    },
  );

  let terminalError:
    | {
        errorMessage: string | undefined;
        stopReason: string;
      }
    | undefined;
  for await (const event of stream) {
    if (event.type === 'error') {
      terminalError = {
        errorMessage: event.error.errorMessage,
        stopReason: event.error.stopReason,
      };
    }
  }

  const result = await stream.result();
  return {
    errorMessage: terminalError?.errorMessage ?? result.errorMessage,
    finalMessage: result,
    stopReason: terminalError?.stopReason ?? result.stopReason,
  };
}

describe('openrouter tool-call stream repro', () => {
  maybeIt(
    'proves the raw provider stream and pi-ai both surface a tool-use result on a minimal prompt',
    async () => {
      const rawEvents = await readRawOpenRouterToolCallEvents();
      expect(rawEvents).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'response.function_call_arguments.done',
          }),
          expect.objectContaining({
            type: 'response.output_item.done',
            item: expect.objectContaining({
              type: 'function_call',
              arguments: '{"label":"repro-openrouter"}',
            }),
          }),
          expect.objectContaining({
            type: 'response.completed',
            response: expect.objectContaining({
              status: 'completed',
            }),
          }),
        ]),
      );

      const terminalError = await readPiAiTerminalError();
      expect(terminalError.stopReason).toBe('toolUse');
      expect(terminalError.errorMessage).toBeUndefined();
      expect(terminalError.finalMessage.content).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'toolCall',
            name: 'diagnostic_runtime_ping',
            arguments: {
              label: 'repro-openrouter',
            },
          }),
        ]),
      );
    },
    30_000,
  );
});
