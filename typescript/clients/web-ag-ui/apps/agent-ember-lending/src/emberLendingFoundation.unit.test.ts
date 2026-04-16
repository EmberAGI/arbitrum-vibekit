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
      'Reason from mandate_context, wallet_contents, active_position_scopes, market_state, and current_candidate_plan',
    );
    expect(config.systemPrompt).toContain(
      'mandate_context is the exact current managed mandate policy envelope',
    );
    expect(config.systemPrompt).toContain(
      'Use wallet_contents, active_position_scopes, and current_candidate_plan for live quantities and values',
    );
    expect(config.systemPrompt).toContain(
      'wallet_contents and active_position_scopes describe the rooted user wallet context',
    );
    expect(config.systemPrompt).toContain(
      'not balances held in subagent_wallet_address',
    );
    expect(config.systemPrompt).toContain('lending.borrow');
    expect(config.systemPrompt).toContain('lending.supply adds collateral');
    expect(config.systemPrompt).toContain('lending.withdraw removes collateral');
    expect(config.systemPrompt).toContain('lending.repay pays back debt');
    expect(config.systemPrompt).toContain('Never satisfy a repay request by creating another supply plan');
    expect(config.systemPrompt).toContain(
      'never satisfy a withdraw request by creating another repay or supply plan',
    );
    expect(config.systemPrompt).toContain('call create_transaction in that turn');
    expect(config.systemPrompt).toContain('call request_execution instead of only describing');
    expect(config.systemPrompt).toContain(
      'Do not self-censor because execution authority may be insufficient',
    );
    expect(config.systemPrompt).toContain(
      'Do not reason from owned units, reservations, or other internal execution machinery',
    );
    expect(config.systemPrompt).toContain('control_path, asset, protocol_system, network, and quantity');
    expect(config.systemPrompt).toContain('{ "kind": "exact", "value": "1.25" }');
    expect(config.systemPrompt).toContain('{ "kind": "percent", "value": 50 }');
    expect(config.systemPrompt).toContain('supply uses idle wallet amount');
    expect(config.systemPrompt).toContain('repay uses total debt');
    expect(config.systemPrompt).toContain(
      'instead of routing back through the portfolio manager for delegation refresh',
    );
  });
});
