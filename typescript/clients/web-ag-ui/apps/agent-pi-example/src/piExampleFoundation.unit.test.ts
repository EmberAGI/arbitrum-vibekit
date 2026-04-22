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
      terminalPhases: [],
    });
    expect(config.agentOptions?.initialState).toMatchObject({
      thinkingLevel: 'low',
    });
    expect(config.agentOptions?.getApiKey?.()).toBe('test-openrouter-key');
    expect(
      config.domain?.systemContext?.({
        threadId: 'thread-1',
        state: {
          phase: 'prehire',
          onboardingStep: null,
          operatorNote: null,
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

    const hireResult = config.domain?.handleOperation?.({
      operation: {
        source: 'command',
        name: 'hire',
      },
      threadId: 'thread-1',
      state: {
        phase: 'prehire',
        onboardingStep: null,
        operatorNote: null,
      },
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
          mirroredToActivity: true,
        },
        artifacts: [
          {
            data: {
              type: 'lifecycle-status',
              phase: 'onboarding',
              onboardingStep: 'operator-profile',
            },
          },
        ],
      },
    });
    expect(hireResult?.outputs).not.toHaveProperty('threadPatch');
    expect(hireResult?.outputs?.interrupt).not.toHaveProperty('inputLabel');
    expect(hireResult?.outputs?.interrupt).not.toHaveProperty('submitLabel');
    expect(
      config.domain?.lifecycle.transitions.find((transition) => transition.command === 'hire')?.from,
    ).toEqual(['prehire', 'fired']);

    const onboardingResult = config.domain?.handleOperation?.({
      operation: {
        source: 'interrupt',
        name: 'operator-config',
        input: {
          operatorNote: 'ready for delegation',
        },
      },
      threadId: 'thread-1',
      state: hireResult?.state,
    });

    expect(onboardingResult).toMatchObject({
      state: {
        phase: 'onboarding',
        onboardingStep: 'delegation-note',
        operatorNote: 'ready for delegation',
      },
    });
    expect(onboardingResult?.outputs).not.toHaveProperty('threadPatch');
    expect(
      config.domain?.systemContext?.({
        threadId: 'thread-1',
        state: onboardingResult?.state,
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
      state: onboardingResult?.state,
    });

    expect(hiredResult).toMatchObject({
      state: {
        phase: 'hired',
        operatorNote: 'ready for delegation',
      },
    });

    const firedResult = config.domain?.handleOperation?.({
      operation: {
        source: 'tool',
        name: 'fire',
      },
      threadId: 'thread-1',
      state: hiredResult?.state,
    });

    expect(firedResult).toMatchObject({
      state: {
        phase: 'fired',
        operatorNote: 'ready for delegation',
      },
      outputs: {
        status: {
          statusMessage: 'Agent moved to fired. Rehire is still available in this thread.',
        },
      },
    });

    expect(
      config.domain?.handleOperation?.({
        operation: {
          source: 'tool',
          name: 'hire',
        },
        threadId: 'thread-1',
        state: {
          phase: 'fired',
          onboardingStep: null,
          operatorNote: 'ready for delegation',
        },
      }),
    ).toMatchObject({
      state: {
        phase: 'onboarding',
        onboardingStep: 'operator-profile',
        operatorNote: null,
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
        messages: [{ role: 'user', content: 'schedule a refresh' }],
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

  it('does not treat legacy sync JSON chat text as a schedule command', async () => {
    const config = createPiExampleAgentConfig({
      E2E_PROFILE: 'mocked',
    });

    const streamFn = config.agentOptions?.streamFn;
    expect(streamFn).toBeDefined();

    const legacySyncStream = streamFn!(
      config.model!,
      {
        systemPrompt: config.systemPrompt,
        messages: [{ role: 'user', content: '{"command":"sync"}' }],
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

    await expect(collectToolName(legacySyncStream)).resolves.toBeNull();
  });
});
