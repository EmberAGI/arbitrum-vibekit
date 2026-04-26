import {
  createExecution,
  type Delegation,
  ExecutionMode,
  getDeleGatorEnvironment,
} from '@metamask/delegation-toolkit';
import { DelegationManager } from '@metamask/delegation-toolkit/contracts';
import type { AgentRuntimeSigningService } from 'agent-runtime/internal';
import { serializeTransaction } from 'viem';
import { describe, expect, it, vi } from 'vitest';

import {
  createHiddenOcaOnchainActionsClient,
  createHiddenOcaSpotSwapExecutor,
} from './hiddenOcaSwapExecutor.js';

const TEST_UNSIGNED_TRANSACTION_HEX =
  '0x02e982a4b1018405f5e100843b9aca008252089400000000000000000000000000000000000000c18080c0' as const;
const TEST_PREPARED_TRANSACTION_PAYLOAD_REF = 'txpayload-hidden-oca-swap-1f18f9b7adf1df1d';
const TEST_CANONICAL_UNSIGNED_PAYLOAD_REF = `unsigned-${TEST_PREPARED_TRANSACTION_PAYLOAD_REF}`;
const TEST_TRANSACTION_SIGNATURE =
  '0x464a27f0b9166323a2d686a053ac34e74c318b59854dcc7de4221837437214870c365e2d8e5060f092656d3bd06f78c324ed296792df9c60f76c68bca5551eb601';
const TEST_ROOT_DELEGATION = createSignedDelegation({
  delegate: '0x00000000000000000000000000000000000000c1',
  delegator: '0x00000000000000000000000000000000000000a1',
});
const TEST_ACTIVE_DELEGATION = createSignedDelegation({
  delegate: '0x00000000000000000000000000000000000000e1',
  delegator: '0x00000000000000000000000000000000000000c1',
});
const TEST_ROOT_DELEGATION_ARTIFACT_REF = encodeDelegationArtifactRef(TEST_ROOT_DELEGATION);
const TEST_ACTIVE_DELEGATION_ARTIFACT_REF = encodeDelegationArtifactRef(TEST_ACTIVE_DELEGATION);

function createRuntimeSigningStub(signPayload: AgentRuntimeSigningService['signPayload']) {
  return {
    readAddress: vi.fn<AgentRuntimeSigningService['readAddress']>(),
    signPayload,
  };
}

function createSignedDelegation(input: {
  delegate: `0x${string}`;
  delegator: `0x${string}`;
  authority?: `0x${string}`;
}): Delegation {
  return {
    delegate: input.delegate,
    delegator: input.delegator,
    authority:
      input.authority ?? '0x0000000000000000000000000000000000000000000000000000000000000000',
    caveats: [],
    salt: '0x0000000000000000000000000000000000000000000000000000000000000000',
    signature: '0x1234',
  };
}

function encodeDelegationArtifactRef(delegation: Delegation): string {
  return `metamask-delegation:${Buffer.from(JSON.stringify(delegation), 'utf8').toString(
    'base64url',
  )}`;
}

function buildExpectedDelegatedUnsignedTransactionHex(input: {
  transaction: {
    to: `0x${string}`;
    value: string;
    data: `0x${string}`;
    chainId: string;
  };
  nonce: number;
  gas: bigint;
  maxFeePerGas: bigint;
  maxPriorityFeePerGas: bigint;
}): `0x${string}` {
  const chainId = Number(input.transaction.chainId);
  const { DelegationManager: delegationManager } = getDeleGatorEnvironment(chainId);
  const data = DelegationManager.encode.redeemDelegations({
    delegations: [[TEST_ACTIVE_DELEGATION, TEST_ROOT_DELEGATION]],
    modes: [ExecutionMode.SingleDefault],
    executions: [
      [
        createExecution({
          target: input.transaction.to,
          value: BigInt(input.transaction.value),
          callData: input.transaction.data,
        }),
      ],
    ],
  });

  return serializeTransaction({
    chainId,
    type: 'eip1559',
    nonce: input.nonce,
    gas: input.gas,
    maxFeePerGas: input.maxFeePerGas,
    maxPriorityFeePerGas: input.maxPriorityFeePerGas,
    to: delegationManager,
    value: 0n,
    data,
  });
}

function bufferDelegatedExecutionGas(gasEstimate: bigint): bigint {
  return (gasEstimate * 3n) / 2n;
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

function createWethToUsdcSwapResponse() {
  return {
    fromToken: createTokens()[1]!,
    toToken: createTokens()[0]!,
    exactFromAmount: '894102247158860',
    displayFromAmount: '0.00089410224715886',
    exactToAmount: '3100000',
    displayToAmount: '3.10',
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
          transaction_payload_ref: TEST_PREPARED_TRANSACTION_PAYLOAD_REF,
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
  it('prepares a structured OCA swap and hands the prepared payload ref to Shared Ember', async () => {
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
        payload_builder_output: {
          transaction_payload_ref: TEST_PREPARED_TRANSACTION_PAYLOAD_REF,
          required_control_path: 'spot.swap',
          network: 'arbitrum',
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
        reservation_conflict_handling: {
          kind: 'unassigned_only',
        },
      },
    });
  });

  it('normalizes decimal exact-in token amounts to OCA base-unit amounts', async () => {
    const onchainActionsClient = {
      listTokens: vi.fn(async () => createTokens()),
      createSwap: vi.fn(async () => createWethToUsdcSwapResponse()),
    };
    const protocolHost = {
      handleJsonRpc: vi.fn(async (request: unknown) => {
        const jsonRpcRequest =
          typeof request === 'object' && request !== null
            ? (request as { method?: string })
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
          amount: '0.00089410224715886',
          amountType: 'exactIn',
          fromChain: 'arbitrum',
          toChain: 'arbitrum',
          fromToken: 'WETH',
          toToken: 'USDC',
        },
      }),
    ).resolves.toMatchObject({
      status: 'completed',
      swapSummary: {
        amount: '894102247158860',
        fromToken: 'WETH',
        toToken: 'USDC',
      },
    });

    expect(onchainActionsClient.createSwap).toHaveBeenCalledWith({
      walletAddress: '0x00000000000000000000000000000000000000a1',
      amount: '894102247158860',
      amountType: 'exactIn',
      fromTokenUid: {
        chainId: '42161',
        address: '0x82af49447d8a07e3bd95bd0d56f35241523fbab1',
      },
      toTokenUid: {
        chainId: '42161',
        address: '0xaf88d065e77c8cc2239327c5edb3a432268e5831',
      },
    });
    expect(protocolHost.handleJsonRpc).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        method: 'subagent.createTransaction.v1',
        params: expect.objectContaining({
          request: expect.objectContaining({
            asset: 'WETH',
            quantity: {
              kind: 'exact',
              value: '894102247158860',
            },
          }),
        }),
      }),
    );
  });

  it('retries a stale Shared Ember expected revision once with the current hidden executor revision', async () => {
    const onchainActionsClient = {
      listTokens: vi.fn(async () => createTokens()),
      createSwap: vi.fn(async () => createSwapResponse()),
    };
    const protocolHost = {
      handleJsonRpc: vi
        .fn()
        .mockRejectedValueOnce(
          new Error(
            'Shared Ember Domain Service JSON-RPC error: protocol_conflict: expected_revision must match the current service revision',
          ),
        )
        .mockResolvedValueOnce({
          jsonrpc: '2.0',
          id: 'shared-ember-thread-1-read-hidden-oca-executor-revision',
          result: {
            revision: 9,
          },
        })
        .mockResolvedValueOnce(createCandidatePlanResponse())
        .mockResolvedValueOnce({
          jsonrpc: '2.0',
          id: 'shared-ember-thread-1-request-hidden-oca-swap-execution',
          result: {
            protocol_version: 'v1',
            revision: 10,
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
      status: 'completed',
      transactionHash: '0xswapconfirmed',
    });

    expect(protocolHost.handleJsonRpc).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        method: 'subagent.createTransaction.v1',
        params: expect.objectContaining({
          expected_revision: 3,
        }),
      }),
    );
    expect(protocolHost.handleJsonRpc).toHaveBeenNthCalledWith(2, {
      jsonrpc: '2.0',
      id: 'shared-ember-thread-1-read-hidden-oca-executor-revision',
      method: 'subagent.readPortfolioState.v1',
      params: {
        agent_id: 'agent-oca-executor',
      },
    });
    expect(protocolHost.handleJsonRpc).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        method: 'subagent.createTransaction.v1',
        params: expect.objectContaining({
          expected_revision: 9,
        }),
      }),
    );
  });

  it('fails closed before OCA planning for unsupported cross-chain swap inputs', async () => {
    const onchainActionsClient = {
      listTokens: vi.fn(async () => createTokens()),
      createSwap: vi.fn(async () => createSwapResponse()),
    };
    const executor = createHiddenOcaSpotSwapExecutor({
      protocolHost: {
        handleJsonRpc: vi.fn(),
        readCommittedEventOutbox: vi.fn(),
        acknowledgeCommittedEventOutbox: vi.fn(),
      },
      onchainActionsClient,
      executorWalletAddress: '0x00000000000000000000000000000000000000e1',
    });

    await expect(
      executor.executeSpotSwap({
        threadId: 'thread-1',
        currentRevision: 3,
        input: {
          rootedWalletContextId: 'rwc-user-spot-001',
          walletAddress: '0x00000000000000000000000000000000000000a1',
          amount: '1000000',
          amountType: 'exactIn',
          fromChain: 'arbitrum',
          toChain: 'mainnet',
          fromToken: 'USDC',
          toToken: 'WETH',
        },
      }),
    ).resolves.toMatchObject({
      status: 'failed',
      failureReason: 'Hidden OCA spot swaps currently require fromChain and toChain to match.',
      transactionPlanId: null,
      requestId: null,
    });

    expect(onchainActionsClient.listTokens).not.toHaveBeenCalled();
    expect(onchainActionsClient.createSwap).not.toHaveBeenCalled();
  });

  it('returns a compact failed result when OCA token lookup fails', async () => {
    const onchainActionsClient = {
      listTokens: vi.fn(async () => {
        throw new Error('Onchain Actions token catalog is unavailable.');
      }),
      createSwap: vi.fn(async () => createSwapResponse()),
    };
    const protocolHost = {
      handleJsonRpc: vi.fn(),
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
      status: 'failed',
      failureReason: 'Onchain Actions token catalog is unavailable.',
      transactionPlanId: null,
      requestId: null,
    });

    expect(onchainActionsClient.createSwap).not.toHaveBeenCalled();
    expect(protocolHost.handleJsonRpc).not.toHaveBeenCalled();
  });

  it('returns a compact failed result for ambiguous token symbols', async () => {
    const ambiguousUsdc = {
      ...createTokens()[0]!,
      tokenUid: {
        chainId: '42161',
        address: '0x1111111111111111111111111111111111111111',
      },
      isVetted: true,
    };
    const onchainActionsClient = {
      listTokens: vi.fn(async () => [createTokens()[0]!, ambiguousUsdc, createTokens()[1]!]),
      createSwap: vi.fn(async () => createSwapResponse()),
    };
    const protocolHost = {
      handleJsonRpc: vi.fn(),
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
      status: 'failed',
      failureReason:
        'Ambiguous Onchain Actions token resolution for USDC on chain 42161; use an exact token address.',
    });

    expect(onchainActionsClient.createSwap).not.toHaveBeenCalled();
    expect(protocolHost.handleJsonRpc).not.toHaveBeenCalled();
  });

  it('prefers the single vetted token when a symbol matches unvetted catalog entries', async () => {
    const unvettedUsdc = {
      ...createTokens()[0]!,
      tokenUid: {
        chainId: '42161',
        address: '0x2222222222222222222222222222222222222222',
      },
      isVetted: false,
    };
    const onchainActionsClient = {
      listTokens: vi.fn(async () => [unvettedUsdc, ...createTokens()]),
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
        rootedWalletContextId: 'rwc-user-spot-001',
        walletAddress: '0x00000000000000000000000000000000000000a1',
        amount: '1000000',
        amountType: 'exactIn',
        fromChain: 'arbitrum',
        toChain: 'arbitrum',
        fromToken: 'USDC',
        toToken: 'WETH',
      },
    });

    expect(onchainActionsClient.createSwap).toHaveBeenCalledWith(
      expect.objectContaining({
        fromTokenUid: {
          chainId: '42161',
          address: '0xaf88d065e77c8cc2239327c5edb3a432268e5831',
        },
      }),
    );
  });

  it('returns a compact failed result when OCA prepares a transaction for the wrong chain', async () => {
    const onchainActionsClient = {
      listTokens: vi.fn(async () => createTokens()),
      createSwap: vi.fn(async () => ({
        ...createSwapResponse(),
        transactions: [
          {
            ...createSwapResponse().transactions[0]!,
            chainId: '1',
          },
        ],
      })),
    };
    const protocolHost = {
      handleJsonRpc: vi.fn(),
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
      status: 'failed',
      failureReason:
        'Onchain Actions swap response chain id "1" did not match requested chain id "42161".',
    });

    expect(protocolHost.handleJsonRpc).not.toHaveBeenCalled();
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

  it('surfaces non-conflict blocked execution reasons from Shared Ember', async () => {
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
              committed_event_ids: ['evt-hidden-swap-blocked-1'],
              execution_result: {
                phase: 'blocked',
                transaction_plan_id: 'txplan-hidden-swap-001',
                request_id: 'req-hidden-swap-001',
                request_result: {
                  result: 'denied',
                  request_id: 'req-hidden-swap-001',
                  message: 'no active reservation admits the requested execution',
                  active_delegation_id: null,
                  reservation_id: null,
                  blocking_reason_code: 'no_active_reservation',
                  next_action: 'stop',
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
      status: 'blocked',
      failureReason:
        'Shared Ember blocked hidden swap execution (no_active_reservation): no active reservation admits the requested execution.',
      transactionPlanId: 'txplan-hidden-swap-001',
      requestId: 'req-hidden-swap-001',
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

  it('continues through redelegation refresh before signing and submitting the hidden swap', async () => {
    const runtimeSigning = createRuntimeSigningStub(
      vi.fn(async () => ({
        confirmedAddress: '0x00000000000000000000000000000000000000e1' as const,
        signedPayload: {
          signature: TEST_TRANSACTION_SIGNATURE,
          recoveryId: 1,
        },
      })),
    );
    const requestRedelegationRefresh = vi.fn(async () => undefined);
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
            committed_event_ids: ['evt-hidden-swap-redelegation-1'],
            execution_result: {
              phase: 'ready_for_redelegation',
              transaction_plan_id: 'txplan-hidden-swap-001',
              request_id: 'req-hidden-swap-001',
            },
          },
        })
        .mockResolvedValueOnce({
          jsonrpc: '2.0',
          id: 'shared-ember-thread-1-read-hidden-oca-executor-revision',
          result: {
            revision: 6,
          },
        })
        .mockResolvedValueOnce({
          jsonrpc: '2.0',
          id: 'shared-ember-thread-1-request-hidden-oca-swap-execution',
          result: {
            protocol_version: 'v1',
            revision: 7,
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
                network: 'arbitrum',
              },
              execution_signing_package: {
                execution_preparation_id: 'execprep-hidden-swap-001',
                transaction_plan_id: 'txplan-hidden-swap-001',
                request_id: 'req-hidden-swap-001',
                active_delegation_id: 'del-hidden-swap-001',
                canonical_unsigned_payload_ref: TEST_CANONICAL_UNSIGNED_PAYLOAD_REF,
              },
            },
          },
        })
        .mockResolvedValueOnce({
          jsonrpc: '2.0',
          id: 'shared-ember-thread-1-submit-hidden-oca-swap-transaction',
          result: {
            protocol_version: 'v1',
            revision: 8,
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
      executorWalletAddress: '0x00000000000000000000000000000000000000e1',
      requestRedelegationRefresh,
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

    expect(requestRedelegationRefresh).toHaveBeenCalledWith({
      threadId: 'thread-1',
      transactionPlanId: 'txplan-hidden-swap-001',
      requestId: 'req-hidden-swap-001',
    });
    expect(protocolHost.handleJsonRpc).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        method: 'subagent.readPortfolioState.v1',
      }),
    );
    expect(protocolHost.handleJsonRpc).toHaveBeenNthCalledWith(
      4,
      expect.objectContaining({
        method: 'subagent.requestExecution.v1',
        params: expect.objectContaining({
          expected_revision: 6,
        }),
      }),
    );
  });

  it('fails closed instead of waiting indefinitely when redelegation refresh is not configured', async () => {
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
            committed_event_ids: ['evt-hidden-swap-redelegation-1'],
            execution_result: {
              phase: 'ready_for_redelegation',
              transaction_plan_id: 'txplan-hidden-swap-001',
              request_id: 'req-hidden-swap-001',
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
      status: 'failed',
      failureReason:
        'Hidden swap execution reached redelegation readiness, but no redelegation refresh handler is configured.',
    });
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
                agent_wallet: '0x00000000000000000000000000000000000000E1',
                root_user_wallet: '0x00000000000000000000000000000000000000a1',
                network: 'arbitrum',
                reservation_id: 'res-hidden-swap-001',
                required_control_path: 'spot.swap',
                active_delegation_id: 'del-hidden-swap-001',
                root_delegation_id: 'root-delegation-001',
                prepared_at: '2026-04-10T12:00:00.000Z',
                metadata: {
                  planned_transaction_payload_ref: TEST_PREPARED_TRANSACTION_PAYLOAD_REF,
                },
              },
              execution_signing_package: {
                execution_preparation_id: 'execprep-hidden-swap-001',
                transaction_plan_id: 'txplan-hidden-swap-001',
                request_id: 'req-hidden-swap-001',
                active_delegation_id: 'del-hidden-swap-001',
                delegation_artifact_ref: 'metamask-delegation:active',
                root_delegation_artifact_ref: 'metamask-delegation:root',
                canonical_unsigned_payload_ref: TEST_CANONICAL_UNSIGNED_PAYLOAD_REF,
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
          canonical_unsigned_payload_ref: TEST_CANONICAL_UNSIGNED_PAYLOAD_REF,
          signer_address: '0x00000000000000000000000000000000000000e1',
          raw_transaction: expect.stringMatching(/^0x[0-9a-f]+$/),
        },
      },
    });
  });

  it('fails signing when Shared Ember prepares the OCA payload for a different network', async () => {
    const runtimeSigning = createRuntimeSigningStub(
      vi.fn(async () => ({
        confirmedAddress: '0x00000000000000000000000000000000000000e1' as const,
        signedPayload: {
          signature: TEST_TRANSACTION_SIGNATURE,
          recoveryId: 1,
        },
      })),
    );
    const resolvePreparedUnsignedTransactionHex = vi.fn(async () => TEST_UNSIGNED_TRANSACTION_HEX);
    const signPreparedTransaction = vi.fn(async () => ({
      confirmedAddress: '0x00000000000000000000000000000000000000e1' as const,
      rawTransaction: '0xfeed' as const,
    }));
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
                network: 'mainnet',
                reservation_id: 'res-hidden-swap-001',
                required_control_path: 'spot.swap',
                active_delegation_id: 'del-hidden-swap-001',
                root_delegation_id: 'root-delegation-001',
                prepared_at: '2026-04-10T12:00:00.000Z',
              },
              execution_signing_package: {
                execution_preparation_id: 'execprep-hidden-swap-001',
                transaction_plan_id: 'txplan-hidden-swap-001',
                request_id: 'req-hidden-swap-001',
                active_delegation_id: 'del-hidden-swap-001',
                canonical_unsigned_payload_ref: TEST_CANONICAL_UNSIGNED_PAYLOAD_REF,
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
      executorWalletAddress: '0x00000000000000000000000000000000000000e1',
      resolvePreparedUnsignedTransactionHex,
      signPreparedTransaction,
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
      status: 'failed',
      failureReason:
        'Shared Ember prepared hidden swap execution for network "mainnet", but the OCA payload was prepared for network "arbitrum".',
    });

    expect(resolvePreparedUnsignedTransactionHex).not.toHaveBeenCalled();
    expect(signPreparedTransaction).not.toHaveBeenCalled();
  });

  it('derives the delegated unsigned transaction from OCA swap transactions by default', async () => {
    const runtimeSigning = createRuntimeSigningStub(
      vi.fn(async () => ({
        confirmedAddress: '0x00000000000000000000000000000000000000e1' as const,
        signedPayload: {
          signature: TEST_TRANSACTION_SIGNATURE,
          recoveryId: 1,
        },
      })),
    );
    const swapResponse = createSwapResponse();
    const executionPublicClient = {
      getTransactionCount: vi.fn(async () => 7),
      estimateFeesPerGas: vi.fn(async () => ({
        maxFeePerGas: 200n,
        maxPriorityFeePerGas: 3n,
      })),
      estimateGas: vi.fn(async () => 55_000n),
    };
    const expectedUnsignedTransactionHex = buildExpectedDelegatedUnsignedTransactionHex({
      transaction: swapResponse.transactions[0]!,
      nonce: 7,
      gas: bufferDelegatedExecutionGas(55_000n),
      maxFeePerGas: 200n,
      maxPriorityFeePerGas: 3n,
    });
    const signPreparedTransaction = vi.fn(async () => ({
      confirmedAddress: '0x00000000000000000000000000000000000000e1' as const,
      rawTransaction: '0xfeed' as const,
    }));
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
              },
              execution_signing_package: {
                execution_preparation_id: 'execprep-hidden-swap-001',
                transaction_plan_id: 'txplan-hidden-swap-001',
                request_id: 'req-hidden-swap-001',
                active_delegation_id: 'del-hidden-swap-001',
                delegation_artifact_ref: TEST_ACTIVE_DELEGATION_ARTIFACT_REF,
                root_delegation_artifact_ref: TEST_ROOT_DELEGATION_ARTIFACT_REF,
                canonical_unsigned_payload_ref: TEST_CANONICAL_UNSIGNED_PAYLOAD_REF,
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
        createSwap: vi.fn(async () => swapResponse),
      },
      runtimeSigning,
      runtimeSignerRef: 'oca-executor-wallet',
      executorWalletAddress: '0x00000000000000000000000000000000000000e1',
      resolveExecutionPublicClient: vi.fn(() => executionPublicClient),
      signPreparedTransaction,
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

    expect(signPreparedTransaction).toHaveBeenCalledWith({
      signing: runtimeSigning,
      signerRef: 'oca-executor-wallet',
      expectedAddress: '0x00000000000000000000000000000000000000e1',
      chain: 'evm',
      unsignedTransactionHex: expectedUnsignedTransactionHex,
    });
    expect(executionPublicClient.estimateGas).toHaveBeenCalledWith({
      account: '0x00000000000000000000000000000000000000e1',
      to: getDeleGatorEnvironment(42161).DelegationManager.toLowerCase(),
      value: 0n,
      data: expect.stringMatching(/^0x[0-9a-f]+$/),
    });
    expect(protocolHost.handleJsonRpc).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        method: 'subagent.submitSignedTransaction.v1',
        params: expect.objectContaining({
          signed_transaction: expect.objectContaining({
            raw_transaction: '0xfeed',
          }),
        }),
      }),
    );
  });

  it('rejects an OCA swap response with any malformed transaction entry', async () => {
    const fetchImpl = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          ...createSwapResponse(),
          transactions: [
            createSwapResponse().transactions[0],
            {
              type: 'EVM_TX',
              to: '0xnot-an-address',
              value: '0',
              data: '0xabcdef',
              chainId: '42161',
            },
          ],
        }),
        {
          status: 200,
          headers: {
            'content-type': 'application/json',
          },
        },
      );
    });
    const client = createHiddenOcaOnchainActionsClient({
      baseUrl: 'https://onchain-actions.test',
      fetch: fetchImpl as typeof fetch,
    });

    await expect(
      client.createSwap({
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
      }),
    ).rejects.toThrow('Onchain Actions swap response included malformed transaction entries.');
  });

  it('paginates the OCA token catalog before resolving PM-facing token names', async () => {
    const fetchImpl = vi.fn(async (url: string | URL | Request) => {
      const page = new URL(String(url)).searchParams.get('page');
      const tokenPage = page === '2' ? [createTokens()[1]] : [createTokens()[0]];

      return new Response(
        JSON.stringify({
          tokens: tokenPage,
          currentPage: page === '2' ? 2 : 1,
          totalPages: 2,
        }),
        {
          status: 200,
          headers: {
            'content-type': 'application/json',
          },
        },
      );
    });
    const client = createHiddenOcaOnchainActionsClient({
      baseUrl: 'https://onchain-actions.test',
      fetch: fetchImpl as typeof fetch,
    });

    await expect(client.listTokens({ chainIds: ['42161'] })).resolves.toHaveLength(2);

    expect(fetchImpl).toHaveBeenNthCalledWith(
      1,
      'https://onchain-actions.test/tokens?chainIds=42161&page=1',
    );
    expect(fetchImpl).toHaveBeenNthCalledWith(
      2,
      'https://onchain-actions.test/tokens?chainIds=42161&page=2',
    );
  });
});
