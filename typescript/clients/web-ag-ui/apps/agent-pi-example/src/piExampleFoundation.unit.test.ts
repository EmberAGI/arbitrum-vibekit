import { describe, expect, it } from 'vitest';

import { createPiExampleAgentConfig } from './piExampleFoundation.js';
import { createPiExampleRuntimeStateStore } from './runtimeState.js';

function requireTool(config: ReturnType<typeof createPiExampleAgentConfig>, toolName: string) {
  const tool = config.tools?.find((candidate) => candidate.name === toolName);
  if (!tool) {
    throw new Error(`Missing expected tool: ${toolName}`);
  }
  return tool;
}

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
    expect(config.systemPrompt).toContain('Pi-native');
    expect(config.systemPrompt).toContain('supports every-minute schedules');
    expect(config.databaseUrl).toBe('postgresql://pi:secret@db.internal:5432/pi_runtime');
    expect(config.tools?.map((tool) => tool.name)).toEqual([
      'automation_schedule',
      'automation_list',
      'automation_cancel',
      'request_operator_input',
    ]);
    expect(config.domain?.lifecycle).toMatchObject({
      initialPhase: 'prehire',
      phases: ['prehire', 'onboarding', 'hired', 'fired'],
      terminalPhases: ['fired'],
    });
    expect(config.agentOptions?.initialState).toMatchObject({
      thinkingLevel: 'low',
    });
    expect(config.agentOptions?.getApiKey?.()).toBe('test-openrouter-key');
    expect(config.getSessionContext?.()).toMatchObject({
      thread: { id: 'thread-1' },
      execution: {
        status: 'working',
      },
    });
    expect(config.domain?.systemContext?.({
      threadId: 'thread-1',
      session: config.getSessionContext!(),
    })).toEqual(['Lifecycle phase: prehire.']);
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

  it('mutates runtime state when mocked tool calls execute', async () => {
    const runtimeState = createPiExampleRuntimeStateStore();
    const config = createPiExampleAgentConfig(
      {
        E2E_PROFILE: 'mocked',
      },
      {
        runtimeState,
        resolveThreadKey: () => 'thread-1',
      },
    );

    const scheduleTool = requireTool(config, 'automation_schedule');
    await scheduleTool.execute('tool-1', {
      title: 'sync every 5 minutes',
      instruction: 'sync',
      schedule: {
        kind: 'every',
        intervalMinutes: 5,
      },
    });

    expect(runtimeState.getSession('thread-1')).toMatchObject({
      execution: {
        status: 'queued',
        statusMessage: 'Scheduled sync every 5 minutes.',
      },
      automation: {
        id: expect.any(String),
        runId: expect.any(String),
      },
      artifacts: {
        current: {
          data: {
            type: 'automation-status',
            status: 'scheduled',
            command: 'sync',
          },
        },
      },
      a2ui: {
        kind: 'automation-status',
      },
    });
  });

  it('lists existing automations without mutating the current automation artifact', async () => {
    const runtimeState = createPiExampleRuntimeStateStore();
    const config = createPiExampleAgentConfig(
      {
        E2E_PROFILE: 'mocked',
      },
      {
        runtimeState,
        resolveThreadKey: () => 'thread-1',
      },
    );

    const scheduleTool = requireTool(config, 'automation_schedule');
    const listTool = requireTool(config, 'automation_list');

    await scheduleTool.execute('tool-1', {
      title: 'sync every 5 minutes',
      instruction: 'sync',
      schedule: {
        kind: 'every',
        intervalMinutes: 5,
      },
    });
    const beforeList = runtimeState.getSession('thread-1');
    const listResult = await listTool.execute('tool-2', {
      state: 'active',
    });
    const afterList = runtimeState.getSession('thread-1');

    expect(listResult.content).toEqual([
      {
        type: 'text',
        text: expect.stringContaining('Found 1 automation'),
      },
    ]);
    expect(afterList).toEqual(beforeList);
  });

  it('routes cancellation requests to the canonical automation cancel tool', async () => {
    const runtimeState = createPiExampleRuntimeStateStore();
    const config = createPiExampleAgentConfig(
      {
        E2E_PROFILE: 'mocked',
      },
      {
        runtimeState,
        resolveThreadKey: () => 'thread-1',
      },
    );

    const scheduleTool = requireTool(config, 'automation_schedule');
    const cancelTool = requireTool(config, 'automation_cancel');

    const scheduleResult = await scheduleTool.execute('tool-1', {
      title: 'sync every 5 minutes',
      instruction: 'sync',
      schedule: {
        kind: 'every',
        intervalMinutes: 5,
      },
    });

    await cancelTool.execute('tool-2', {
      automationId: String(scheduleResult.details?.automation?.id ?? ''),
    });

    expect(runtimeState.getSession('thread-1')).toMatchObject({
      execution: {
        status: 'completed',
        statusMessage: 'Canceled automation sync every 5 minutes.',
      },
      artifacts: {
        current: {
          data: {
            type: 'automation-status',
            status: 'canceled',
            command: 'sync',
          },
        },
      },
      a2ui: {
        kind: 'automation-status',
        payload: expect.objectContaining({
          status: 'canceled',
        }),
      },
    });
  });

  it('derives automation titles from the actual schedule when persistence does not supply one', async () => {
    const runtimeState = createPiExampleRuntimeStateStore();
    const config = createPiExampleAgentConfig(
      {
        OPENROUTER_API_KEY: 'test-openrouter-key',
        PI_AGENT_MODEL: 'openai/gpt-5.4-mini',
        DATABASE_URL: 'postgresql://pi:secret@db.internal:5432/pi_runtime',
      },
      {
        runtimeState,
        resolveThreadKey: () => 'thread-1',
        persistence: {
          scheduleAutomation: async () => ({
            automationId: 'automation-1',
            runId: 'run-1',
            executionId: 'exec-1',
            artifactId: 'artifact-1',
            title: '',
            schedule: { kind: 'every', intervalMinutes: 1 },
            nextRunAt: null,
          }),
          cancelAutomation: async () => ({
            automationId: 'automation-1',
            artifactId: 'artifact-1',
            title: '',
            instruction: 'sync',
            schedule: { kind: 'every', intervalMinutes: 1 },
          }),
        },
      },
    );

    const scheduleTool = requireTool(config, 'automation_schedule');
    const cancelTool = requireTool(config, 'automation_cancel');

    const scheduleResult = await scheduleTool.execute('tool-1', {
      title: 'placeholder',
      instruction: 'sync',
      schedule: {
        kind: 'every',
        intervalMinutes: 1,
      },
    });

    expect(scheduleResult.details?.automation).toMatchObject({
      title: 'sync every 1 minutes',
      schedule: { kind: 'every', intervalMinutes: 1 },
    });

    const cancelResult = await cancelTool.execute('tool-2', {
      automationId: 'automation-1',
    });

    expect(cancelResult.details?.automation).toMatchObject({
      title: 'sync every 1 minutes',
      status: 'canceled',
    });
    expect(runtimeState.getSession('thread-1')).toMatchObject({
      execution: {
        statusMessage: 'Canceled automation sync every 1 minutes.',
      },
    });
  });

  it('declares the onboarding lifecycle and exposes one normalized operation handler', () => {
    const config = createPiExampleAgentConfig({
      OPENROUTER_API_KEY: 'test-openrouter-key',
    });

    const session = config.getSessionContext!();
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
        name: 'continue_onboarding',
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
    expect(config.domain?.systemContext?.({
      threadId: 'thread-1',
      session,
    })).toEqual([
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
});
