import { describe, expect, it } from 'vitest';

import { createPiExampleGatewayFoundation } from './piExampleFoundation.js';
import { createPiExampleRuntimeStateStore } from './runtimeState.js';

describe('createPiExampleGatewayFoundation', () => {
  it('builds a real Pi-native foundation configured for OpenRouter', () => {
    const foundation = createPiExampleGatewayFoundation({
      OPENROUTER_API_KEY: 'test-openrouter-key',
      PI_AGENT_MODEL: 'openai/gpt-5-mini',
      DATABASE_URL: 'postgresql://pi:secret@db.internal:5432/pi_runtime',
    });

    expect(typeof foundation.agent.prompt).toBe('function');
    expect(typeof foundation.agent.continue).toBe('function');
    expect(typeof foundation.agent.abort).toBe('function');
    expect(foundation.agent.state.model).toMatchObject({
      id: 'openai/gpt-5-mini',
      name: 'openai/gpt-5-mini',
      api: 'openai-responses',
      provider: 'openrouter',
      baseUrl: 'https://openrouter.ai/api/v1',
      reasoning: true,
    });
    expect(foundation.agent.state.thinkingLevel).toBe('low');
    expect(foundation.agent.state.tools.map((tool) => tool.name)).toEqual([
      'schedule_sync_automation',
      'run_sync_automation',
      'request_operator_input',
    ]);
    expect(foundation.agent.state.systemPrompt).toContain('Pi-native');
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
          text: expect.stringContaining('Tool schedule_sync_automation completed.'),
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

    expect(runtimeState.getSession('thread-1')).toMatchObject({
      execution: {
        status: 'working',
        statusMessage: 'Scheduled sync every 5 minutes.',
      },
      automation: {
        id: 'automation:thread-1',
        runId: 'run:thread-1',
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

  it('routes run requests to the automation-run tool instead of rescheduling', async () => {
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
    await foundation.agent.prompt('Please run scheduled automation now.');

    expect(runtimeState.getSession('thread-1')).toMatchObject({
      execution: {
        status: 'completed',
        statusMessage: 'Automation sync executed successfully.',
      },
      artifacts: {
        current: {
          data: {
            type: 'automation-status',
            status: 'completed',
            command: 'sync',
          },
        },
      },
      a2ui: {
        kind: 'automation-status',
        payload: expect.objectContaining({
          status: 'completed',
        }),
      },
    });
  });
});
