import { describe, expect, it, vi } from 'vitest';
import type { AgentRuntimeSigningService } from 'agent-runtime/internal';

import { createHiddenOcaSpotSwapExecutor } from './hiddenOcaSwapExecutor.js';

const TEST_UNSIGNED_TRANSACTION_HEX =
  '0x02e982a4b1018405f5e100843b9aca008252089400000000000000000000000000000000000000c18080c0' as const;
const TEST_TRANSACTION_SIGNATURE =
  '0x464a27f0b9166323a2d686a053ac34e74c318b59854dcc7de4221837437214870c365e2d8e5060f092656d3bd06f78c324ed296792df9c60f76c68bca5551eb601';

function createRuntimeSigningStub(signPayload: AgentRuntimeSigningService['signPayload']) {
  return {
    readAddress: vi.fn<AgentRuntimeSigningService['readAddress']>(),
    signPayload,
  };
}

function createTokens() {
  return [
    {
      tokenUid: {
        chainId: '42161',
        address: '0xaf88d065e77c8cc2239327c5edb3a432268e5831',
      },
      name: 'USD Coin',
      symbol: 'USDC',
      isNative: false,
      decimals: 6,
      isVetted: true,
    },
    {
      tokenUid: {
        chainId: '42161',
        address: '0x82af49447d8a07e3bd95bd0d56f35241523fbab1',
      },
      name: 'Wrapped Ether',
      symbol: 'WETH',
      isNative: false,
      decimals: 18,
      isVetted: true,
    },
  ];
}

function createSwapResponse() {
  return {
    fromToken: createTokens()[0]!,
    toToken: createTokens()[1]!,
    exactFromAmount: '1000000',
    displayFromAmount: '1',
    exactToAmount: '300000000000000',
    displayToAmount: '0.0003',
    transactions: [
      {
        type: 'EVM_TX',
        to: '0x00000000000000000000000000000000000000d1',
        value: '0',
        data: '0xabcdef',
        chainId: '42161',
      },
    ],
  };
}

function createCandidatePlanResponse() {
  return {
    jsonrpc: '2.0',
    id: 'shared-ember-thread-1-create-hidden-oca-swap-transaction',
    result: {
      protocol_version: 'v1',
      revision: 4,
      committed_event_ids: ['evt-hidden-swap-plan-1'],
      candidate_plan: {
        planning_kind: 'subagent_handoff',
        candidate_plan_id: 'candidate-hidden-swap-001',
        transaction_plan_id: 'txplan-hidden-swap-001',
        semantic_request: {
          control_path: 'spot.swap',
          asset: 'USDC',
          protocol_system: 'onchain-actions',
          network: 'arbitrum',
          quantity: {
            kind: 'exact',
            value: '1000000',
          },
        },
        payload_builder_output: {
          transaction_payload_ref: 'txpayload-hidden-swap-001',
          required_control_path: 'spot.swap',
          network: 'arbitrum',
        },
        compact_plan_summary: {
          control_path: 'spot.swap',
          asset: 'USDC',
          amount: '1000000',
          summary: 'swap USDC to WETH through Onchain Actions',
        },
      },
    },
  };
}

describe('createHiddenOcaSpotSwapExecutor', () => {
  it('prepares a structured OCA swap and hands the spot.swap plan to Shared Ember', async () => {
    const onchainActionsClient = {
      listTokens: vi.fn(async () => createTokens()),
      createSwap: vi.fn(async () => createSwapResponse()),
    };
    const protocolHost = {
      handleJsonRpc: vi.fn(async (request: unknown) => {
        const jsonRpcRequest =
          typeof request === 'object' && request !== null
            ? (request as { method?: string; params?: Record<string, unknown> })
            : {};

        if (jsonRpcRequest.method === 'subagent.createTransaction.v1') {
          return createCandidatePlanResponse();
        }

        if (jsonRpcRequest.method === 'subagent.requestExecution.v1') {
          return {
            jsonrpc: '2.0',
            id: 'shared-ember-thread-1-request-hidden-oca-swap-execution',
            result: {
              protocol_version: 'v1',
              revision: 5,
              committed_event_ids: ['evt-hidden-swap-execution-1'],
              execution_result: {
                phase: 'completed',
                transaction_plan_id: 'txplan-hidden-swap-001',
                request_id: 'req-hidden-swap-001',
                execution: {
                  execution_id: 'exec-hidden-swap-001',
                  status: 'confirmed',
                  transaction_hash: '0xswapconfirmed',
                  successor_unit_ids: [],
                },
                compact_artifact: {
                  control_path: 'spot.swap',
                  asset: 'USDC',
                  amount: '1000000',
                  summary: 'swap USDC to WETH through Onchain Actions',
                },
              },
            },
          };
        }

        throw new Error(`unexpected method: ${String(jsonRpcRequest.method)}`);
      }),
      readCommittedEventOutbox: vi.fn(),
      acknowledgeCommittedEventOutbox: vi.fn(),
    };
    const executor = createHiddenOcaSpotSwapExecutor({
      protocolHost,
      onchainActionsClient,
      executorWalletAddress: '0x00000000000000000000000000000000000000e1',
    });

    await expect(
      executor.executeSpotSwap({
        threadId: 'thread-1',
        currentRevision: 3,
        input: {
          idempotencyKey: 'idem-hidden-swap-001',
          rootedWalletContextId: 'rwc-user-spot-001',
          walletAddress: '0x00000000000000000000000000000000000000a1',
          amount: '1000000',
          amountType: 'exactIn',
          fromChain: 'arbitrum',
          toChain: 'arbitrum',
          fromToken: 'USDC',
          toToken: 'WETH',
          slippageTolerance: '0.5',
        },
      }),
    ).resolves.toMatchObject({
      status: 'completed',
      swapSummary: {
        fromToken: 'USDC',
        toToken: 'WETH',
        displayFromAmount: '1',
        displayToAmount: '0.0003',
      },
      transactionPlanId: 'txplan-hidden-swap-001',
      requestId: 'req-hidden-swap-001',
      transactionHash: '0xswapconfirmed',
    });

    expect(onchainActionsClient.createSwap).toHaveBeenCalledWith({
      walletAddress: '0x00000000000000000000000000000000000000a1',
      amount: '1000000',
      amountType: 'exactIn',
      fromTokenUid: {
        chainId: '42161',
        address: '0xaf88d065e77c8cc2239327c5edb3a432268e5831',
      },
      toTokenUid: {
        chainId: '42161',
        address: '0x82af49447d8a07e3bd95bd0d56f35241523fbab1',
      },
      slippageTolerance: '0.5',
    });
    expect(protocolHost.handleJsonRpc).toHaveBeenNthCalledWith(1, {
      jsonrpc: '2.0',
      id: 'shared-ember-thread-1-create-hidden-oca-swap-transaction',
      method: 'subagent.createTransaction.v1',
      params: {
        idempotency_key: 'idem-hidden-swap-001:create-transaction',
        expected_revision: 3,
        agent_id: 'agent-oca-executor',
        rooted_wallet_context_id: 'rwc-user-spot-001',
        request: {
          control_path: 'spot.swap',
          asset: 'USDC',
          protocol_system: 'onchain-actions',
          network: 'arbitrum',
          quantity: {
            kind: 'exact',
            value: '1000000',
          },
        },
      },
    });
    expect(protocolHost.handleJsonRpc).toHaveBeenNthCalledWith(2, {
      jsonrpc: '2.0',
      id: 'shared-ember-thread-1-request-hidden-oca-swap-execution',
      method: 'subagent.requestExecution.v1',
      params: {
        idempotency_key: 'idem-hidden-swap-001:request-execution:1',
        expected_revision: 4,
        transaction_plan_id: 'txplan-hidden-swap-001',
      },
    });
  });

  it('returns structured reserved-capital conflict details without retrying automatically', async () => {
    const onchainActionsClient = {
      listTokens: vi.fn(async () => createTokens()),
      createSwap: vi.fn(async () => createSwapResponse()),
    };
    const protocolHost = {
      handleJsonRpc: vi.fn(async (request: unknown) => {
        const method =
          typeof request === 'object' && request !== null
            ? (request as { method?: string }).method
            : null;

        if (method === 'subagent.createTransaction.v1') {
          return createCandidatePlanResponse();
        }

        if (method === 'subagent.requestExecution.v1') {
          return {
            jsonrpc: '2.0',
            id: 'shared-ember-thread-1-request-hidden-oca-swap-execution',
            result: {
              protocol_version: 'v1',
              revision: 5,
              committed_event_ids: ['evt-hidden-swap-conflict-1'],
              execution_result: {
                phase: 'blocked',
                transaction_plan_id: 'txplan-hidden-swap-001',
                request_id: 'req-hidden-swap-001',
                request_result: {
                  result: 'needs_release_or_transfer',
                  request_id: 'req-hidden-swap-001',
                  message: 'USDC is reserved for another agent.',
                  active_delegation_id: null,
                  reservation_id: 'res-ember-lending-001',
                  blocking_reason_code: 'reserved_for_other_agent',
                  next_action: 'confirm_or_retry',
                },
                portfolio_state: {},
              },
            },
          };
        }

        throw new Error(`unexpected method: ${String(method)}`);
      }),
      readCommittedEventOutbox: vi.fn(),
      acknowledgeCommittedEventOutbox: vi.fn(),
    };
    const executor = createHiddenOcaSpotSwapExecutor({
      protocolHost,
      onchainActionsClient,
      executorWalletAddress: '0x00000000000000000000000000000000000000e1',
    });

    await expect(
      executor.executeSpotSwap({
        threadId: 'thread-1',
        currentRevision: 3,
        input: {
          idempotencyKey: 'idem-hidden-swap-001',
          rootedWalletContextId: 'rwc-user-spot-001',
          walletAddress: '0x00000000000000000000000000000000000000a1',
          amount: '1000000',
          amountType: 'exactIn',
          fromChain: 'arbitrum',
          toChain: 'arbitrum',
          fromToken: 'USDC',
          toToken: 'WETH',
        },
      }),
    ).resolves.toMatchObject({
      status: 'conflict',
      conflict: {
        kind: 'reserved_for_other_agent',
        blockingReasonCode: 'reserved_for_other_agent',
        reservationId: 'res-ember-lending-001',
        retryOptions: ['allow_reserved_for_other_agent', 'unassigned_only'],
      },
    });
  });

  it('passes exact conflict retry handling through to Shared Ember execution readiness', async () => {
    const onchainActionsClient = {
      listTokens: vi.fn(async () => createTokens()),
      createSwap: vi.fn(async () => createSwapResponse()),
    };
    const protocolHost = {
      handleJsonRpc: vi
        .fn()
        .mockResolvedValueOnce(createCandidatePlanResponse())
        .mockResolvedValueOnce({
          jsonrpc: '2.0',
          id: 'shared-ember-thread-1-request-hidden-oca-swap-execution',
          result: {
            protocol_version: 'v1',
            revision: 5,
            committed_event_ids: ['evt-hidden-swap-execution-1'],
            execution_result: {
              phase: 'completed',
              transaction_plan_id: 'txplan-hidden-swap-001',
              request_id: 'req-hidden-swap-001',
              execution: {
                execution_id: 'exec-hidden-swap-001',
                status: 'confirmed',
                transaction_hash: '0xswapconfirmed',
                successor_unit_ids: [],
              },
              compact_artifact: {
                control_path: 'spot.swap',
                asset: 'USDC',
                amount: '1000000',
                summary: 'swap USDC to WETH through Onchain Actions',
              },
            },
          },
        }),
      readCommittedEventOutbox: vi.fn(),
      acknowledgeCommittedEventOutbox: vi.fn(),
    };
    const executor = createHiddenOcaSpotSwapExecutor({
      protocolHost,
      onchainActionsClient,
      executorWalletAddress: '0x00000000000000000000000000000000000000e1',
    });

    await executor.executeSpotSwap({
      threadId: 'thread-1',
      currentRevision: 3,
      input: {
        idempotencyKey: 'idem-hidden-swap-001',
        rootedWalletContextId: 'rwc-user-spot-001',
        walletAddress: '0x00000000000000000000000000000000000000a1',
        amount: '1000000',
        amountType: 'exactIn',
        fromChain: 'arbitrum',
        toChain: 'arbitrum',
        fromToken: 'USDC',
        toToken: 'WETH',
        reservationConflictHandling: {
          kind: 'unassigned_only',
        },
      },
    });

    expect(protocolHost.handleJsonRpc).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        method: 'subagent.requestExecution.v1',
        params: expect.objectContaining({
          reservation_conflict_handling: {
            kind: 'unassigned_only',
          },
        }),
      }),
    );
  });

  it('signs and submits an execution-signing package with the hidden executor wallet', async () => {
    const runtimeSigning = createRuntimeSigningStub(
      vi.fn(async () => ({
        confirmedAddress: '0x00000000000000000000000000000000000000e1' as const,
        signedPayload: {
          signature: TEST_TRANSACTION_SIGNATURE,
          recoveryId: 1,
        },
      })),
    );
    const protocolHost = {
      handleJsonRpc: vi
        .fn()
        .mockResolvedValueOnce(createCandidatePlanResponse())
        .mockResolvedValueOnce({
          jsonrpc: '2.0',
          id: 'shared-ember-thread-1-request-hidden-oca-swap-execution',
          result: {
            protocol_version: 'v1',
            revision: 5,
            committed_event_ids: ['evt-hidden-swap-execution-1'],
            execution_result: {
              phase: 'ready_for_execution_signing',
              transaction_plan_id: 'txplan-hidden-swap-001',
              request_id: 'req-hidden-swap-001',
              execution_preparation: {
                execution_preparation_id: 'execprep-hidden-swap-001',
                transaction_plan_id: 'txplan-hidden-swap-001',
                request_id: 'req-hidden-swap-001',
                agent_id: 'agent-oca-executor',
                agent_wallet: '0x00000000000000000000000000000000000000e1',
                root_user_wallet: '0x00000000000000000000000000000000000000a1',
                network: 'arbitrum',
                reservation_id: 'res-hidden-swap-001',
                required_control_path: 'spot.swap',
                active_delegation_id: 'del-hidden-swap-001',
                root_delegation_id: 'root-delegation-001',
                prepared_at: '2026-04-10T12:00:00.000Z',
                metadata: {
                  planned_transaction_payload_ref: 'txpayload-hidden-swap-001',
                },
              },
              execution_signing_package: {
                execution_preparation_id: 'execprep-hidden-swap-001',
                transaction_plan_id: 'txplan-hidden-swap-001',
                request_id: 'req-hidden-swap-001',
                active_delegation_id: 'del-hidden-swap-001',
                delegation_artifact_ref: 'metamask-delegation:active',
                root_delegation_artifact_ref: 'metamask-delegation:root',
                canonical_unsigned_payload_ref: 'unsigned-hidden-swap-001',
              },
              compact_artifact: {
                control_path: 'spot.swap',
                asset: 'USDC',
                amount: '1000000',
                summary: 'swap USDC to WETH through Onchain Actions',
              },
            },
          },
        })
        .mockResolvedValueOnce({
          jsonrpc: '2.0',
          id: 'shared-ember-thread-1-submit-hidden-oca-swap-transaction',
          result: {
            protocol_version: 'v1',
            revision: 6,
            committed_event_ids: ['evt-hidden-swap-submitted-1'],
            execution_result: {
              phase: 'completed',
              transaction_plan_id: 'txplan-hidden-swap-001',
              request_id: 'req-hidden-swap-001',
              execution: {
                execution_id: 'exec-hidden-swap-001',
                status: 'submitted',
                transaction_hash: '0xsubmittedswap',
                successor_unit_ids: [],
              },
              compact_artifact: {
                control_path: 'spot.swap',
                asset: 'USDC',
                amount: '1000000',
                summary: 'swap USDC to WETH through Onchain Actions',
              },
            },
          },
        }),
      readCommittedEventOutbox: vi.fn(),
      acknowledgeCommittedEventOutbox: vi.fn(),
    };
    const executor = createHiddenOcaSpotSwapExecutor({
      protocolHost,
      onchainActionsClient: {
        listTokens: vi.fn(async () => createTokens()),
        createSwap: vi.fn(async () => createSwapResponse()),
      },
      runtimeSigning,
      runtimeSignerRef: 'oca-executor-wallet',
      executorWalletAddress: '0x00000000000000000000000000000000000000e1',
      resolvePreparedUnsignedTransactionHex: vi.fn(async () => TEST_UNSIGNED_TRANSACTION_HEX),
    });

    await expect(
      executor.executeSpotSwap({
        threadId: 'thread-1',
        currentRevision: 3,
        input: {
          idempotencyKey: 'idem-hidden-swap-001',
          rootedWalletContextId: 'rwc-user-spot-001',
          walletAddress: '0x00000000000000000000000000000000000000a1',
          amount: '1000000',
          amountType: 'exactIn',
          fromChain: 'arbitrum',
          toChain: 'arbitrum',
          fromToken: 'USDC',
          toToken: 'WETH',
        },
      }),
    ).resolves.toMatchObject({
      status: 'submitted',
      transactionHash: '0xsubmittedswap',
    });

    expect(runtimeSigning.signPayload).toHaveBeenCalledWith({
      signerRef: 'oca-executor-wallet',
      expectedAddress: '0x00000000000000000000000000000000000000e1',
      payloadKind: 'transaction',
      payload: {
        chain: 'evm',
        unsignedTransactionHex: TEST_UNSIGNED_TRANSACTION_HEX,
      },
    });
    expect(protocolHost.handleJsonRpc).toHaveBeenNthCalledWith(3, {
      jsonrpc: '2.0',
      id: 'shared-ember-thread-1-submit-hidden-oca-swap-transaction',
      method: 'subagent.submitSignedTransaction.v1',
      params: {
        idempotency_key:
          'idem-hidden-swap-001:submit-signed-transaction:req-hidden-swap-001:execprep-hidden-swap-001',
        expected_revision: 5,
        transaction_plan_id: 'txplan-hidden-swap-001',
        signed_transaction: {
          execution_preparation_id: 'execprep-hidden-swap-001',
          transaction_plan_id: 'txplan-hidden-swap-001',
          request_id: 'req-hidden-swap-001',
          active_delegation_id: 'del-hidden-swap-001',
          canonical_unsigned_payload_ref: 'unsigned-hidden-swap-001',
          signer_address: '0x00000000000000000000000000000000000000e1',
          raw_transaction: expect.stringMatching(/^0x[0-9a-f]+$/),
        },
      },
    });
  });
});
