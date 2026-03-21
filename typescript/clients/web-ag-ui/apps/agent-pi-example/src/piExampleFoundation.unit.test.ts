import { describe, expect, it } from 'vitest';

import { createPiExampleGatewayFoundation } from './piExampleFoundation.js';

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
    });
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

    await foundation.agent.prompt('Hello Pi');

    expect(foundation.agent.state.messages.at(-1)).toMatchObject({
      role: 'assistant',
      content: [{ type: 'text', text: 'Pi example mocked response.' }],
    });
  });
});
