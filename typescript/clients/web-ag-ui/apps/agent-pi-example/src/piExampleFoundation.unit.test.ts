import { describe, expect, it } from 'vitest';

import {
  AGENT_RUNTIME_AUTOMATION_CANCEL_TOOL,
  AGENT_RUNTIME_AUTOMATION_LIST_TOOL,
  AGENT_RUNTIME_AUTOMATION_SCHEDULE_TOOL,
  AGENT_RUNTIME_DOMAIN_COMMAND_TOOL,
  AGENT_RUNTIME_REQUEST_OPERATOR_INPUT_TOOL,
} from 'agent-runtime';

import { createPiExampleAgentConfig } from './piExampleFoundation.js';

describe('createPiExampleAgentConfig', () => {
  it('builds OpenRouter-backed agent-runtime config for the Pi example', () => {
    const config = createPiExampleAgentConfig({
      OPENROUTER_API_KEY: 'test-openrouter-key',
      PI_AGENT_MODEL: 'openai/gpt-5.4-mini',
      DATABASE_URL: 'postgresql://pi:secret@db.internal:5432/pi_runtime',
    });

    expect(config.model).toMatchObject({
      id: 'openai/gpt-5.4-mini',
      name: 'openai/gpt-5.4-mini',
      api: 'openai-responses',
      provider: 'openrouter',
      baseUrl: 'https://openrouter.ai/api/v1',
      reasoning: true,
    });
    expect(config.systemPrompt).toContain('golden agent-runtime integration example');
    expect(config.databaseUrl).toBe('postgresql://pi:secret@db.internal:5432/pi_runtime');
    expect(config.tools).toEqual([]);
    expect(config.domain?.lifecycle).toMatchObject({
      initialPhase: 'prehire',
      phases: ['prehire', 'onboarding', 'hired', 'fired'],
      terminalPhases: ['fired'],
    });
    expect(config.agentOptions?.initialState).toMatchObject({
      thinkingLevel: 'low',
    });
    expect(config.agentOptions?.getApiKey?.()).toBe('test-openrouter-key');
    expect(
      config.domain?.systemContext?.({
        threadId: 'thread-1',
        session: {
          thread: { id: 'thread-1' },
          execution: {
            id: 'exec:thread-1',
            status: 'working',
            statusMessage: 'ready',
          },
          messages: [],
          activityEvents: [],
        },
      }),
    ).toEqual(['Lifecycle phase: prehire.']);
  });

  it('requires OPENROUTER_API_KEY for real local startup', () => {
    expect(() => createPiExampleAgentConfig({})).toThrow('OPENROUTER_API_KEY');
  });

  it('uses a mocked external LLM boundary for mocked startup profiles', () => {
    const config = createPiExampleAgentConfig({
      E2E_PROFILE: 'mocked',
    });

    expect(typeof config.agentOptions?.streamFn).toBe('function');
    expect(config.agentOptions?.getApiKey).toBeUndefined();
  });

  it('declares the onboarding lifecycle and exposes one normalized operation handler', () => {
    const config = createPiExampleAgentConfig({
      OPENROUTER_API_KEY: 'test-openrouter-key',
    });

    const session = {
      thread: { id: 'thread-1' },
      execution: {
        id: 'exec:thread-1',
        status: 'working' as const,
        statusMessage: 'ready',
      },
      messages: [],
      activityEvents: [],
    };
    const hireResult = config.domain?.handleOperation?.({
      operation: {
        source: 'command',
        name: 'hire',
      },
      threadId: 'thread-1',
      session,
    });

    expect(config.domain?.lifecycle.commands.map((command) => command.name)).toEqual([
      'hire',
      'continue_onboarding',
      'complete_onboarding',
      'fire',
    ]);
    expect(hireResult).toMatchObject({
      state: {
        phase: 'onboarding',
        onboardingStep: 'operator-profile',
      },
      outputs: {
        interrupt: {
          type: 'operator-config',
          surfacedInThread: true,
        },
      },
    });

    const onboardingResult = config.domain?.handleOperation?.({
      operation: {
        source: 'interrupt',
        name: 'operator-config',
        input: {
          operatorNote: 'ready for delegation',
        },
      },
      threadId: 'thread-1',
      session,
    });

    expect(onboardingResult).toMatchObject({
      state: {
        phase: 'onboarding',
        onboardingStep: 'delegation-note',
        operatorNote: 'ready for delegation',
      },
    });
    expect(
      config.domain?.systemContext?.({
        threadId: 'thread-1',
        session,
      }),
    ).toEqual([
      'Lifecycle phase: onboarding.',
      'Onboarding step: delegation-note.',
      'Operator note captured: ready for delegation.',
    ]);

    const hiredResult = config.domain?.handleOperation?.({
      operation: {
        source: 'tool',
        name: 'complete_onboarding',
      },
      threadId: 'thread-1',
      session,
    });

    expect(hiredResult).toMatchObject({
      state: {
        phase: 'hired',
        operatorNote: 'ready for delegation',
      },
    });
  });

  it('drives runtime-owned automation and interrupt tools through the mocked stream', async () => {
    const config = createPiExampleAgentConfig({
      E2E_PROFILE: 'mocked',
    });

    const streamFn = config.agentOptions?.streamFn;
    expect(streamFn).toBeDefined();

    const scheduleStream = streamFn!(
      config.model!,
      {
        systemPrompt: config.systemPrompt,
        messages: [{ role: 'user', content: 'schedule a sync' }],
      } as never,
      {} as never,
    );
    const interruptStream = streamFn!(
      config.model!,
      {
        systemPrompt: config.systemPrompt,
        messages: [{ role: 'user', content: 'request operator input' }],
      } as never,
      {} as never,
    );
    const hireStream = streamFn!(
      config.model!,
      {
        systemPrompt: config.systemPrompt,
        messages: [{ role: 'user', content: 'hire the agent' }],
      } as never,
      {} as never,
    );

    const collectToolName = async (stream: AsyncIterable<{ partial?: { content?: Array<{ name?: string }> } }>) => {
      for await (const event of stream) {
        const toolName = event.partial?.content?.find((part) => part.name)?.name;
        if (toolName) {
          return toolName;
        }
      }
      return null;
    };

    await expect(collectToolName(scheduleStream)).resolves.toBe(AGENT_RUNTIME_AUTOMATION_SCHEDULE_TOOL);
    await expect(collectToolName(interruptStream)).resolves.toBe(AGENT_RUNTIME_REQUEST_OPERATOR_INPUT_TOOL);
    await expect(collectToolName(hireStream)).resolves.toBe(AGENT_RUNTIME_DOMAIN_COMMAND_TOOL);
    expect([
      AGENT_RUNTIME_AUTOMATION_CANCEL_TOOL,
      AGENT_RUNTIME_AUTOMATION_LIST_TOOL,
      AGENT_RUNTIME_AUTOMATION_SCHEDULE_TOOL,
      AGENT_RUNTIME_REQUEST_OPERATOR_INPUT_TOOL,
    ]).toHaveLength(4);
  });
});
