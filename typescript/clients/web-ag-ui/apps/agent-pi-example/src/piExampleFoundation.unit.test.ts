import { describe, expect, it } from 'vitest';

import { createPiExampleGatewayFoundation } from './piExampleFoundation.js';
import { createPiExampleRuntimeStateStore } from './runtimeState.js';

describe('createPiExampleGatewayFoundation', () => {
  it('builds a real Pi-native foundation configured for OpenRouter', () => {
    const foundation = createPiExampleGatewayFoundation({
      OPENROUTER_API_KEY: 'test-openrouter-key',
      PI_AGENT_MODEL: 'openai/gpt-5.4-mini',
      DATABASE_URL: 'postgresql://pi:secret@db.internal:5432/pi_runtime',
    });

    expect(typeof foundation.agent.prompt).toBe('function');
    expect(typeof foundation.agent.continue).toBe('function');
    expect(typeof foundation.agent.abort).toBe('function');
    expect(foundation.agent.state.model).toMatchObject({
      id: 'openai/gpt-5.4-mini',
      name: 'openai/gpt-5.4-mini',
      api: 'openai-responses',
      provider: 'openrouter',
      baseUrl: 'https://openrouter.ai/api/v1',
      reasoning: true,
    });
    expect(foundation.agent.state.thinkingLevel).toBe('low');
    expect(foundation.agent.state.tools.map((tool) => tool.name)).toEqual([
      'automation_schedule',
      'automation_list',
      'automation_cancel',
      'request_operator_input',
    ]);
    expect(foundation.agent.state.systemPrompt).toContain('Pi-native');
    expect(foundation.agent.state.systemPrompt).toContain('supports every-minute schedules');
    expect(foundation.agent.getApiKey?.()).toBe('test-openrouter-key');
    expect(foundation.bootstrapPlan).toEqual({
      mode: 'external',
      databaseUrl: 'postgresql://pi:secret@db.internal:5432/pi_runtime',
      startCommand: null,
    });
  });

  it('requires OPENROUTER_API_KEY for real local startup', () => {
    expect(() => createPiExampleGatewayFoundation({})).toThrow('OPENROUTER_API_KEY');
  });

  it('uses a mocked external LLM boundary for mocked startup profiles', async () => {
    const foundation = createPiExampleGatewayFoundation({
      E2E_PROFILE: 'mocked',
    });

    await foundation.agent.prompt('Schedule sync automation');

    expect(foundation.agent.state.messages.at(-1)).toMatchObject({
      role: 'assistant',
      content: [
        {
          type: 'text',
          text: expect.stringContaining('Tool automation_schedule completed.'),
        },
      ],
    });
  });

  it('mutates runtime state when mocked tool calls execute', async () => {
    const runtimeState = createPiExampleRuntimeStateStore();
    const foundation = createPiExampleGatewayFoundation(
      {
        E2E_PROFILE: 'mocked',
      },
      {
        runtimeState,
        resolveThreadKey: () => 'thread-1',
      },
    );

    await foundation.agent.prompt('Please schedule sync automation.');

    expect(runtimeState.getProjection('thread-1')).toMatchObject({
      execution: {
        status: 'queued',
        statusMessage: 'Scheduled sync every 5 minutes.',
      },
      automation: {
        id: expect.any(String),
        runId: expect.any(String),
      },
      currentArtifact: {
        data: {
          type: 'automation-status',
          status: 'scheduled',
          command: 'sync',
        },
      },
      a2ui: {
        kind: 'automation-status',
      },
    });
  });

  it('lists existing automations without mutating the current automation artifact', async () => {
    const runtimeState = createPiExampleRuntimeStateStore();
    const foundation = createPiExampleGatewayFoundation(
      {
        E2E_PROFILE: 'mocked',
      },
      {
        runtimeState,
        resolveThreadKey: () => 'thread-1',
      },
    );

    await foundation.agent.prompt('Please schedule sync automation.');
    const beforeList = runtimeState.getProjection('thread-1');
    await foundation.agent.prompt('Please list my automations.');
    const afterList = runtimeState.getProjection('thread-1');

    expect(foundation.agent.state.messages.at(-1)).toMatchObject({
      role: 'assistant',
      content: [
        {
          type: 'text',
          text: expect.stringContaining('Tool automation_list completed.'),
        },
      ],
    });
    expect(afterList).toEqual(beforeList);
  });

  it('routes cancellation requests to the canonical automation cancel tool', async () => {
    const runtimeState = createPiExampleRuntimeStateStore();
    const foundation = createPiExampleGatewayFoundation(
      {
        E2E_PROFILE: 'mocked',
      },
      {
        runtimeState,
        resolveThreadKey: () => 'thread-1',
      },
    );

    await foundation.agent.prompt('Please schedule sync automation.');
    await foundation.agent.prompt('Please cancel the scheduled sync.');

    expect(runtimeState.getProjection('thread-1')).toMatchObject({
      execution: {
        status: 'completed',
        statusMessage: 'Canceled automation sync every 5 minutes.',
      },
      currentArtifact: {
        data: {
          type: 'automation-status',
          status: 'canceled',
          command: 'sync',
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
    const foundation = createPiExampleGatewayFoundation(
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

    const toolsByName = new Map(foundation.agent.state.tools.map((tool) => [tool.name, tool]));
    const scheduleTool = toolsByName.get('automation_schedule');
    const cancelTool = toolsByName.get('automation_cancel');

    expect(scheduleTool).toBeDefined();
    expect(cancelTool).toBeDefined();

    const scheduleResult = await scheduleTool!.execute('tool-1', {
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

    const cancelResult = await cancelTool!.execute('tool-2', {
      automationId: 'automation-1',
    });

    expect(cancelResult.details?.automation).toMatchObject({
      title: 'sync every 1 minutes',
      status: 'canceled',
    });
    expect(runtimeState.getProjection('thread-1')).toMatchObject({
      execution: {
        statusMessage: 'Canceled automation sync every 1 minutes.',
      },
    });
  });
});
