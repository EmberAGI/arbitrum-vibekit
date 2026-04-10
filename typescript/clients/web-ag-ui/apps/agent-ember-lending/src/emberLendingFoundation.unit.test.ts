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
    expect(config.systemPrompt).toContain('lending.supply adds collateral');
    expect(config.systemPrompt).toContain('lending.withdraw removes collateral');
    expect(config.systemPrompt).toContain('lending.repay pays back debt');
    expect(config.systemPrompt).toContain('Never satisfy a repay request by creating another supply plan');
    expect(config.systemPrompt).toContain(
      'never satisfy a withdraw request by creating another repay or supply plan',
    );
    expect(config.systemPrompt).toContain('call the planning tool in that turn');
    expect(config.systemPrompt).toContain('call the execution tool instead of only describing');
    expect(config.systemPrompt).toContain(
      'treat that as sufficient evidence to attempt execution through Shared Ember now',
    );
    expect(config.systemPrompt).toContain(
      'Do not claim the reservation is inactive unless the current thread state explicitly shows that no matching active reservation exists',
    );
    expect(config.systemPrompt).toContain(
      'When the user asks for an exact amount or any partial amount such as half',
    );
    expect(config.systemPrompt).toContain(
      'omitting requested_quantities is invalid for that request',
    );
    expect(config.systemPrompt).toContain(
      'instead of routing back through the portfolio manager for delegation refresh',
    );
  });
});
