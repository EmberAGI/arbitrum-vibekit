import { describe, expect, it, vi } from 'vitest';

import { createPortfolioManagerWalletAccountingTool } from './walletAccountingTool.js';

describe('createPortfolioManagerWalletAccountingTool', () => {
  it('reads onboarding state and returns an agent-usable wallet and reservation summary', async () => {
    const protocolHost = {
      handleJsonRpc: vi.fn(async () => ({
        jsonrpc: '2.0',
        id: 'rpc-wallet-accounting-success',
        result: {
          protocol_version: 'v1',
          revision: 4,
          onboarding_state: {
            agent_id: 'ember-lending',
            wallet_address: '0x00000000000000000000000000000000000000a1',
            network: 'arbitrum',
            phase: 'active',
            proofs: {
              rooted_wallet_context_registered: true,
              root_delegation_registered: true,
              root_authority_active: true,
              wallet_baseline_observed: true,
              accounting_units_seeded: true,
              mandate_inputs_configured: true,
              reserve_policy_configured: true,
              capital_reserved_for_agent: true,
              policy_snapshot_recorded: true,
              agent_active: true,
            },
            rooted_wallet_context: {
              rooted_wallet_context_id: 'rwc-portfolio-manager-a1',
            },
            root_delegation: {
              root_delegation_id: 'root-delegation-portfolio-manager-a1',
              status: 'active',
            },
            owned_units: [
              {
                unit_id: 'unit-usdc-a1',
                root_asset: 'USDC',
                quantity: '10',
                status: 'reserved',
                control_path: 'lending.supply',
                reservation_id: 'reservation-usdc-a1',
              },
            ],
            reservations: [
              {
                reservation_id: 'reservation-usdc-a1',
                agent_id: 'ember-lending',
                purpose: 'position.enter',
                status: 'active',
                control_path: 'lending.supply',
                unit_allocations: [
                  {
                    unit_id: 'unit-usdc-a1',
                    quantity: '10',
                  },
                ],
              },
            ],
            policy_snapshots: [
              {
                policy_snapshot_ref: 'policy-usdc-a1',
                control_paths: ['lending.supply'],
              },
            ],
          },
        },
      })),
      readCommittedEventOutbox: vi.fn(),
      acknowledgeCommittedEventOutbox: vi.fn(),
    };

    const tool = createPortfolioManagerWalletAccountingTool({
      protocolHost,
      agentId: 'ember-lending',
    });

    const result = await tool.execute?.('tool-wallet-accounting-1', {
      walletAddress: '0x00000000000000000000000000000000000000a1',
    });

    expect(protocolHost.handleJsonRpc).toHaveBeenCalledWith({
      jsonrpc: '2.0',
      id: 'shared-ember-wallet-accounting-ember-lending-0x00000000000000000000000000000000000000a1',
      method: 'orchestrator.readOnboardingState.v1',
      params: {
        agent_id: 'ember-lending',
        wallet_address: '0x00000000000000000000000000000000000000a1',
        network: 'arbitrum',
      },
    });
    expect(result).toMatchObject({
      content: [
        {
          type: 'text',
          text: expect.stringContaining('10 USDC'),
        },
      ],
      details: {
        wallet: {
          address: '0x00000000000000000000000000000000000000a1',
          network: 'arbitrum',
        },
        onboarding: {
          phase: 'active',
          revision: 4,
          active: true,
        },
        assets: [
          {
            asset: 'USDC',
            quantity: '10',
            status: 'reserved',
            controlPath: 'lending.supply',
          },
        ],
        reservations: [
          {
            reservationId: 'reservation-usdc-a1',
            agentId: 'ember-lending',
            controlPath: 'lending.supply',
            allocations: [
              {
                unitId: 'unit-usdc-a1',
                asset: 'USDC',
                quantity: '10',
              },
            ],
          },
        ],
      },
    });
  });

  it('returns an explicit empty-state summary when the wallet has not been onboarded', async () => {
    const protocolHost = {
      handleJsonRpc: vi.fn(async () => ({
        jsonrpc: '2.0',
        id: 'rpc-wallet-accounting-empty',
        result: {
          protocol_version: 'v1',
          revision: 0,
          onboarding_state: {
            agent_id: 'portfolio-manager',
            wallet_address: '0x00000000000000000000000000000000000000a1',
            network: 'arbitrum',
            phase: 'not_started',
            proofs: {
              rooted_wallet_context_registered: false,
              root_delegation_registered: false,
              root_authority_active: false,
              wallet_baseline_observed: false,
              accounting_units_seeded: false,
              mandate_inputs_configured: false,
              reserve_policy_configured: false,
              capital_reserved_for_agent: false,
              policy_snapshot_recorded: false,
              agent_active: false,
            },
            rooted_wallet_context: null,
            root_delegation: null,
            capital_observation: null,
            mandates: [],
            user_reserve_policies: [],
            owned_units: [],
            reservations: [],
            policy_snapshots: [],
          },
        },
      })),
      readCommittedEventOutbox: vi.fn(),
      acknowledgeCommittedEventOutbox: vi.fn(),
    };

    const tool = createPortfolioManagerWalletAccountingTool({
      protocolHost,
      agentId: 'ember-lending',
    });

    const result = await tool.execute?.('tool-wallet-accounting-2', {
      walletAddress: '0x00000000000000000000000000000000000000a1',
    });

    expect(result).toMatchObject({
      content: [
        {
          type: 'text',
          text: expect.stringContaining('no durable onboarding/accounting state yet'),
        },
      ],
      details: {
        onboarding: {
          phase: 'not_started',
          active: false,
        },
        assets: [],
        reservations: [],
      },
    });
  });
});
