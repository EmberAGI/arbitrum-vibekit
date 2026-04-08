import { describe, expect, it } from 'vitest';

import { createEmberLendingAgentConfig } from './emberLendingFoundation.js';

describe('createEmberLendingAgentConfig', () => {
  it('treats follow-up control paths in the live execution context as in-scope', () => {
    const config = createEmberLendingAgentConfig(
      {
        OPENROUTER_API_KEY: 'test-openrouter-key',
      },
      {
        dependencies: {
          protocolHost: undefined,
          anchoredPayloadResolver: {
            anchorCandidatePlanPayload: async () => {
              throw new Error('not used');
            },
            resolvePreparedUnsignedTransaction: async () => {
              throw new Error('not used');
            },
          },
        },
      },
    );

    expect(config.systemPrompt).toContain(
      'Treat the live Shared Ember execution context as authoritative for what is currently admitted',
    );
    expect(config.systemPrompt).toContain('lending.borrow');
    expect(config.systemPrompt).toContain(
      'instead of routing back through the portfolio manager for delegation refresh',
    );
  });
});
