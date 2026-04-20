import { describe, expect, it, vi } from 'vitest';
import {
  createExecution,
  type Delegation,
  ExecutionMode,
  getDeleGatorEnvironment,
} from '@metamask/delegation-toolkit';
import { DelegationManager } from '@metamask/delegation-toolkit/contracts';
import { parseUnits, serializeTransaction } from 'viem';

import {
  createEmberLendingOnchainActionsAnchoredPayloadResolver,
  resolveEmberLendingOnchainActionsApiUrl,
} from './onchainActionsPayloadResolver.js';

function createSignedDelegation(input: {
  delegate: `0x${string}`;
  delegator: `0x${string}`;
  authority?: `0x${string}`;
}): Delegation {
  return {
    delegate: input.delegate,
    delegator: input.delegator,
    authority:
      input.authority ??
      '0x0000000000000000000000000000000000000000000000000000000000000000',
    caveats: [],
    salt: '0x0000000000000000000000000000000000000000000000000000000000000000',
    signature: '0x1234',
  };
}

function encodeDelegationArtifactRef(delegation: Delegation): string {
  return `metamask-delegation:${Buffer.from(
    JSON.stringify(delegation),
    'utf8',
  ).toString('base64url')}`;
}

function buildExpectedDelegatedUnsignedTransactionHex(input: {
  transaction?: {
    to: `0x${string}`;
    value: string;
    data: `0x${string}`;
    chainId: string;
  };
  transactions?: {
    to: `0x${string}`;
    value: string;
    data: `0x${string}`;
    chainId: string;
  }[];
  nonce: number;
  gas: bigint;
  maxFeePerGas: bigint;
  maxPriorityFeePerGas: bigint;
}): `0x${string}` {
  const transactions = input.transactions ?? (input.transaction ? [input.transaction] : []);
  if (transactions.length === 0) {
    throw new Error('Expected at least one transaction for delegated execution.');
  }

  const chainId = Number(transactions[0]!.chainId);
  const { DelegationManager: delegationManager } = getDeleGatorEnvironment(chainId);
  const data = DelegationManager.encode.redeemDelegations({
    delegations: [[TEST_ACTIVE_DELEGATION, TEST_ROOT_DELEGATION]],
    modes: [transactions.length === 1 ? ExecutionMode.SingleDefault : ExecutionMode.BatchDefault],
    executions: [
      transactions.map((transaction) =>
        createExecution({
          target: transaction.to,
          value: BigInt(transaction.value),
          callData: transaction.data,
        }),
      ),
    ],
  });

  return serializeTransaction({
    chainId,
    type: 'eip1559',
    nonce: input.nonce,
    gas: input.gas,
    maxFeePerGas: input.maxFeePerGas,
    maxPriorityFeePerGas: input.maxPriorityFeePerGas,
    to: delegationManager as `0x${string}`,
    value: 0n,
    data,
  });
}

function bufferDelegatedExecutionGas(gasEstimate: bigint): bigint {
  return (gasEstimate * 3n) / 2n;
}

const TEST_ROOT_DELEGATION = createSignedDelegation({
  delegate: '0x00000000000000000000000000000000000000c1',
  delegator: '0x00000000000000000000000000000000000000a1',
});
const TEST_ACTIVE_DELEGATION = createSignedDelegation({
  delegate: '0x00000000000000000000000000000000000000b1',
  delegator: '0x00000000000000000000000000000000000000c1',
});
const TEST_ROOT_DELEGATION_ARTIFACT_REF = encodeDelegationArtifactRef(TEST_ROOT_DELEGATION);
const TEST_ACTIVE_DELEGATION_ARTIFACT_REF = encodeDelegationArtifactRef(TEST_ACTIVE_DELEGATION);
const TEST_ROOT_DELEGATION_ARTIFACT_REF_NO_PREFIX_SIG = encodeDelegationArtifactRef({
  ...TEST_ROOT_DELEGATION,
  signature: TEST_ROOT_DELEGATION.signature.slice(2) as `0x${string}`,
});
const TEST_ACTIVE_DELEGATION_ARTIFACT_REF_NO_PREFIX_SIG = encodeDelegationArtifactRef({
  ...TEST_ACTIVE_DELEGATION,
  signature: TEST_ACTIVE_DELEGATION.signature.slice(2) as `0x${string}`,
});
const MAX_UINT256 = ((1n << 256n) - 1n).toString();

describe('resolveEmberLendingOnchainActionsApiUrl', () => {
  it('normalizes an explicit OpenAPI document URL down to the API origin', () => {
    expect(
      resolveEmberLendingOnchainActionsApiUrl({
        ONCHAIN_ACTIONS_API_URL: 'https://api.emberai.xyz/openapi.json/',
      }),
    ).toBe('https://api.emberai.xyz');
  });
});

describe('createEmberLendingOnchainActionsAnchoredPayloadResolver', () => {
  it('accepts live borrow planner metadata fields when anchoring a candidate plan payload', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            tokens: [
              {
                tokenUid: {
                  chainId: '42161',
                  address: '0x00000000000000000000000000000000000000c1',
                },
                name: 'USD Coin',
                symbol: 'USDC',
                isNative: false,
                decimals: 6,
                iconUri: null,
                isVetted: true,
              },
            ],
            cursor: null,
            currentPage: 1,
            totalPages: 1,
            totalItems: 1,
          }),
          {
            status: 200,
            headers: {
              'content-type': 'application/json',
            },
          },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            liquidationThreshold: '8400',
            currentBorrowApy: '22344120386296899578933987',
            transactions: [
              {
                type: 'EVM_TX',
                to: '0x00000000000000000000000000000000000000d2',
                value: '0',
                data: '0xa415bcad',
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
        ),
      );
    const resolver = createEmberLendingOnchainActionsAnchoredPayloadResolver({
      baseUrl: 'https://api.emberai.xyz',
      fetch: fetchImpl,
    });

    await expect(
      resolver.anchorCandidatePlanPayload({
        agentId: 'ember-lending',
        threadId: 'thread-1',
        transactionPlanId: 'txplan-ember-lending-borrow-001',
        walletAddress: '0x00000000000000000000000000000000000000b1',
        rootUserWalletAddress: '0x00000000000000000000000000000000000000b1',
        payloadBuilderOutput: {
          transaction_payload_ref: 'txpayload-ember-lending-borrow-001',
          required_control_path: 'lending.borrow',
          network: 'arbitrum',
        },
        compactPlanSummary: {
          control_path: 'lending.borrow',
          asset: 'USDC',
          amount: '1',
          summary: 'borrow reserved USDC on Aave',
        },
      }),
    ).resolves.toMatchObject({
      transactionRequests: [
        {
          type: 'EVM_TX',
          to: '0x00000000000000000000000000000000000000d2',
          value: '0',
          data: '0xa415bcad',
          chainId: '42161',
        },
      ],
    });
  });

  it('ignores malformed token rows when anchoring a live candidate plan payload', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            tokens: [
              {
                tokenUid: {
                  chainId: '42161',
                  address: '0x00000000000000000000000000000000000000aa',
                },
                name: '',
                symbol: '',
                isNative: false,
                decimals: 18,
                iconUri: null,
                isVetted: false,
              },
              {
                tokenUid: {
                  chainId: '42161',
                  address: '0x00000000000000000000000000000000000000c1',
                },
                name: 'Wrapped Ether',
                symbol: 'WETH',
                isNative: false,
                decimals: 18,
                iconUri: null,
                isVetted: true,
              },
            ],
            cursor: null,
            currentPage: 1,
            totalPages: 1,
            totalItems: 2,
          }),
          {
            status: 200,
            headers: {
              'content-type': 'application/json',
            },
          },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            transactions: [
              {
                type: 'EVM_TX',
                to: '0x00000000000000000000000000000000000000d2',
                value: '0',
                data: '0x617ba037',
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
        ),
      );
    const resolver = createEmberLendingOnchainActionsAnchoredPayloadResolver({
      baseUrl: 'https://api.emberai.xyz',
      fetch: fetchImpl,
    });

    await expect(
      resolver.anchorCandidatePlanPayload({
        agentId: 'ember-lending',
        threadId: 'thread-1',
        transactionPlanId: 'txplan-ember-lending-malformed-tokens-001',
        walletAddress: '0x00000000000000000000000000000000000000b1',
        rootUserWalletAddress: '0x00000000000000000000000000000000000000b1',
        payloadBuilderOutput: {
          transaction_payload_ref: 'txpayload-ember-lending-malformed-tokens-001',
          required_control_path: 'lending.supply',
          network: 'arbitrum',
        },
        compactPlanSummary: {
          control_path: 'lending.supply',
          asset: 'WETH',
          amount: '1',
          summary: 'supply reserved WETH on Aave',
        },
      }),
    ).resolves.toMatchObject({
      transactionRequests: [
        {
          type: 'EVM_TX',
          to: '0x00000000000000000000000000000000000000d2',
          value: '0',
          data: '0x617ba037',
          chainId: '42161',
        },
      ],
    });
  });

  it('maps Arbitrum wrapper symbols back to the underlying token when anchoring payloads', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            tokens: [
              {
                tokenUid: {
                  chainId: '42161',
                  address: '0x00000000000000000000000000000000000000c1',
                },
                name: 'Wrapped Ether',
                symbol: 'WETH',
                isNative: false,
                decimals: 18,
                iconUri: null,
                isVetted: true,
              },
            ],
            cursor: null,
            currentPage: 1,
            totalPages: 1,
            totalItems: 1,
          }),
          {
            status: 200,
            headers: {
              'content-type': 'application/json',
            },
          },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            transactions: [
              {
                type: 'EVM_TX',
                to: '0x00000000000000000000000000000000000000d2',
                value: '0',
                data: '0xa415bcad',
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
        ),
      );
    const resolver = createEmberLendingOnchainActionsAnchoredPayloadResolver({
      baseUrl: 'https://api.emberai.xyz',
      fetch: fetchImpl,
    });

    await expect(
      resolver.anchorCandidatePlanPayload({
        agentId: 'ember-lending',
        threadId: 'thread-1',
        transactionPlanId: 'txplan-ember-lending-wrapper-alias-001',
        walletAddress: '0x00000000000000000000000000000000000000b1',
        rootUserWalletAddress: '0x00000000000000000000000000000000000000b1',
        payloadBuilderOutput: {
          transaction_payload_ref: 'txpayload-ember-lending-wrapper-alias-001',
          required_control_path: 'lending.withdraw',
          network: 'arbitrum',
        },
        compactPlanSummary: {
          control_path: 'lending.withdraw',
          asset: 'aArbWETH',
          amount: '0.0000015',
          summary: 'withdraw WETH collateral from Aave back to idle WETH',
        },
      }),
    ).resolves.toMatchObject({
      transactionRequests: [
        {
          type: 'EVM_TX',
          to: '0x00000000000000000000000000000000000000d2',
          value: '0',
          data: '0xa415bcad',
          chainId: '42161',
        },
      ],
    });

    expect(fetchImpl).toHaveBeenNthCalledWith(
      2,
      'https://api.emberai.xyz/lending/withdraw',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          walletAddress: '0x00000000000000000000000000000000000000b1',
          tokenUidToWidthraw: {
            chainId: '42161',
            address: '0x00000000000000000000000000000000000000c1',
          },
          amount: '1500000000000',
        }),
      }),
    );
  });

  it('maps Arbitrum native-USDC wrapper symbols back to canonical USDC when anchoring payloads', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            tokens: [
              {
                tokenUid: {
                  chainId: '42161',
                  address: '0x00000000000000000000000000000000000000c9',
                },
                name: 'USD Coin',
                symbol: 'USDC',
                isNative: false,
                decimals: 6,
                iconUri: null,
                isVetted: true,
              },
            ],
            cursor: null,
            currentPage: 1,
            totalPages: 1,
            totalItems: 1,
          }),
          {
            status: 200,
            headers: {
              'content-type': 'application/json',
            },
          },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            transactions: [
              {
                type: 'EVM_TX',
                to: '0x00000000000000000000000000000000000000d9',
                value: '0',
                data: '0xa415bcad',
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
        ),
      );
    const resolver = createEmberLendingOnchainActionsAnchoredPayloadResolver({
      baseUrl: 'https://api.emberai.xyz',
      fetch: fetchImpl,
    });

    await expect(
      resolver.anchorCandidatePlanPayload({
        agentId: 'ember-lending',
        threadId: 'thread-1',
        transactionPlanId: 'txplan-ember-lending-wrapper-alias-usdcn-001',
        walletAddress: '0x00000000000000000000000000000000000000b9',
        rootUserWalletAddress: '0x00000000000000000000000000000000000000b9',
        payloadBuilderOutput: {
          transaction_payload_ref: 'txpayload-ember-lending-wrapper-alias-usdcn-001',
          required_control_path: 'lending.withdraw',
          network: 'arbitrum',
        },
        compactPlanSummary: {
          control_path: 'lending.withdraw',
          asset: 'aArbUSDCn',
          amount: '1.5',
          summary: 'withdraw USDC collateral from Aave back to idle USDC',
        },
      }),
    ).resolves.toMatchObject({
      transactionRequests: [
        {
          type: 'EVM_TX',
          to: '0x00000000000000000000000000000000000000d9',
          value: '0',
          data: '0xa415bcad',
          chainId: '42161',
        },
      ],
    });

    expect(fetchImpl).toHaveBeenNthCalledWith(
      2,
      'https://api.emberai.xyz/lending/withdraw',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          walletAddress: '0x00000000000000000000000000000000000000b9',
          tokenUidToWidthraw: {
            chainId: '42161',
            address: '0x00000000000000000000000000000000000000c9',
          },
          amount: '1500000',
        }),
      }),
    );
  });

  it('converts exact integer human quantities into token base units using OCA token decimals', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            tokens: [
              {
                tokenUid: {
                  chainId: '42161',
                  address: '0x00000000000000000000000000000000000000c9',
                },
                name: 'USD Coin',
                symbol: 'USDC',
                isNative: false,
                decimals: 6,
                iconUri: null,
                isVetted: true,
              },
            ],
            cursor: null,
            currentPage: 1,
            totalPages: 1,
            totalItems: 1,
          }),
          {
            status: 200,
            headers: {
              'content-type': 'application/json',
            },
          },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            transactions: [
              {
                type: 'EVM_TX',
                to: '0x00000000000000000000000000000000000000da',
                value: '0',
                data: '0xa415bcad',
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
        ),
      );
    const resolver = createEmberLendingOnchainActionsAnchoredPayloadResolver({
      baseUrl: 'https://api.emberai.xyz',
      fetch: fetchImpl,
    });

    await expect(
      resolver.anchorCandidatePlanPayload({
        agentId: 'ember-lending',
        threadId: 'thread-1',
        transactionPlanId: 'txplan-ember-lending-wrapper-alias-usdcn-integer-001',
        walletAddress: '0x00000000000000000000000000000000000000ba',
        rootUserWalletAddress: '0x00000000000000000000000000000000000000ba',
        payloadBuilderOutput: {
          transaction_payload_ref: 'txpayload-ember-lending-wrapper-alias-usdcn-integer-001',
          required_control_path: 'lending.withdraw',
          network: 'arbitrum',
        },
        compactPlanSummary: {
          control_path: 'lending.withdraw',
          asset: 'aArbUSDCn',
          amount: '1',
          summary: 'withdraw 1 USDC collateral from Aave back to idle USDC',
        },
      }),
    ).resolves.toMatchObject({
      transactionRequests: [
        {
          type: 'EVM_TX',
          to: '0x00000000000000000000000000000000000000da',
          value: '0',
          data: '0xa415bcad',
          chainId: '42161',
        },
      ],
    });

    expect(fetchImpl).toHaveBeenNthCalledWith(
      2,
      'https://api.emberai.xyz/lending/withdraw',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          walletAddress: '0x00000000000000000000000000000000000000ba',
          tokenUidToWidthraw: {
            chainId: '42161',
            address: '0x00000000000000000000000000000000000000c9',
          },
          amount: '1000000',
        }),
      }),
    );
  });

  it('wraps the anchored request in a delegated redeemDelegations transaction using the canonical signing package', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            tokens: [
              {
                tokenUid: {
                  chainId: '42161',
                  address: '0x00000000000000000000000000000000000000c1',
                },
                name: 'USD Coin',
                symbol: 'USDC',
                isNative: false,
                decimals: 6,
                iconUri: null,
                isVetted: true,
              },
            ],
            cursor: null,
            currentPage: 1,
            totalPages: 1,
            totalItems: 1,
          }),
          {
            status: 200,
            headers: {
              'content-type': 'application/json',
            },
          },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            transactions: [
              {
                type: 'EVM_TX',
                to: '0x00000000000000000000000000000000000000d2',
                value: '0',
                data: '0x617ba037',
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
        ),
      );
    const rpcClient = {
      getTransactionCount: vi.fn(async () => 7),
      estimateFeesPerGas: vi.fn(async () => ({
        maxFeePerGas: 200n,
        maxPriorityFeePerGas: 3n,
      })),
      estimateGas: vi.fn(async () => 55_000n),
    };
    const resolvePublicClient = vi.fn(() => rpcClient);
    const resolver = createEmberLendingOnchainActionsAnchoredPayloadResolver({
      baseUrl: 'https://api.emberai.xyz',
      fetch: fetchImpl,
      resolvePublicClient,
    });

    await resolver.anchorCandidatePlanPayload({
      agentId: 'ember-lending',
      threadId: 'thread-1',
      transactionPlanId: 'txplan-ember-lending-003',
      walletAddress: '0x00000000000000000000000000000000000000b1',
      rootUserWalletAddress: '0x00000000000000000000000000000000000000b1',
      payloadBuilderOutput: {
        transaction_payload_ref: 'txpayload-ember-lending-003',
        required_control_path: 'lending.supply',
        network: 'arbitrum',
      },
      compactPlanSummary: {
        control_path: 'lending.supply',
        asset: 'USDC',
        amount: '10',
        summary: 'supply reserved USDC on Aave',
      },
    });

    const expectedUnsignedTransactionHex = buildExpectedDelegatedUnsignedTransactionHex({
      transaction: {
        to: '0x00000000000000000000000000000000000000d2',
        value: '0',
        data: '0x617ba037',
        chainId: '42161',
      },
      nonce: 7,
      gas: bufferDelegatedExecutionGas(55_000n),
      maxFeePerGas: 200n,
      maxPriorityFeePerGas: 3n,
    });

    await expect(
      resolver.resolvePreparedUnsignedTransaction({
        agentId: 'ember-lending',
        executionPreparationId: 'execprep-ember-lending-003',
        transactionPlanId: 'txplan-ember-lending-003',
        requestId: 'req-ember-lending-execution-003',
        canonicalUnsignedPayloadRef: 'unsigned-txpayload-ember-lending-003',
        delegationArtifactRef: TEST_ACTIVE_DELEGATION_ARTIFACT_REF,
        rootDelegationArtifactRef: TEST_ROOT_DELEGATION_ARTIFACT_REF,
        plannedTransactionPayloadRef: 'txpayload-ember-lending-003',
        walletAddress: '0x00000000000000000000000000000000000000b1',
        network: 'arbitrum',
        requiredControlPath: 'lending.supply',
      }),
    ).resolves.toBe(expectedUnsignedTransactionHex);

    expect(resolvePublicClient).toHaveBeenCalledWith('arbitrum');
    expect(rpcClient.getTransactionCount).toHaveBeenCalledWith({
      address: '0x00000000000000000000000000000000000000b1',
      blockTag: 'pending',
    });
    expect(rpcClient.estimateFeesPerGas).toHaveBeenCalledWith();
    expect(rpcClient.estimateGas).toHaveBeenCalledWith({
      account: '0x00000000000000000000000000000000000000b1',
      to: getDeleGatorEnvironment(42161).DelegationManager.toLowerCase(),
      value: 0n,
      data: expect.any(String),
    });
  });

  it('retries delegated gas estimation when a follow-up step briefly sees stale allowance state', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            tokens: [
              {
                tokenUid: {
                  chainId: '42161',
                  address: '0x00000000000000000000000000000000000000c1',
                },
                name: 'Wrapped Ether',
                symbol: 'WETH',
                isNative: false,
                decimals: 18,
                iconUri: null,
                isVetted: true,
              },
            ],
            cursor: null,
            currentPage: 1,
            totalPages: 1,
            totalItems: 1,
          }),
          {
            status: 200,
            headers: {
              'content-type': 'application/json',
            },
          },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            transactions: [
              {
                type: 'EVM_TX',
                to: '0x00000000000000000000000000000000000000d2',
                value: '0',
                data: '0x095ea7b3',
                chainId: '42161',
              },
              {
                type: 'EVM_TX',
                to: '0x00000000000000000000000000000000000000d3',
                value: '0',
                data: '0x617ba037',
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
        ),
      );
    const rpcClient = {
      getTransactionCount: vi.fn(async () => 9),
      estimateFeesPerGas: vi.fn(async () => ({
        maxFeePerGas: 200n,
        maxPriorityFeePerGas: 3n,
      })),
      estimateGas: vi
        .fn()
        .mockRejectedValueOnce(new Error('execution reverted: ERC20: transfer amount exceeds allowance'))
        .mockResolvedValueOnce(65_000n),
    };
    const resolvePublicClient = vi.fn(() => rpcClient);
    const resolver = createEmberLendingOnchainActionsAnchoredPayloadResolver({
      baseUrl: 'https://api.emberai.xyz',
      fetch: fetchImpl,
      resolvePublicClient,
    });

    await resolver.anchorCandidatePlanPayload({
      agentId: 'ember-lending',
      threadId: 'thread-1',
      transactionPlanId: 'txplan-ember-lending-step-retry-001',
      walletAddress: '0x00000000000000000000000000000000000000b1',
      rootUserWalletAddress: '0x00000000000000000000000000000000000000a1',
      payloadBuilderOutput: {
        transaction_payload_ref: 'txpayload-ember-lending-step-retry-001',
        required_control_path: 'lending.supply',
        network: 'arbitrum',
      },
      compactPlanSummary: {
        control_path: 'lending.supply',
        asset: 'WETH',
        amount: '0.000003',
        summary: 'supply reserved WETH on Aave',
      },
    });

    const expectedUnsignedTransactionHex = buildExpectedDelegatedUnsignedTransactionHex({
      transaction: {
        to: '0x00000000000000000000000000000000000000d3',
        value: '0',
        data: '0x617ba037',
        chainId: '42161',
      },
      nonce: 9,
      gas: bufferDelegatedExecutionGas(65_000n),
      maxFeePerGas: 200n,
      maxPriorityFeePerGas: 3n,
    });

    await expect(
      resolver.resolvePreparedUnsignedTransaction({
        agentId: 'ember-lending',
        executionPreparationId: 'execprep-ember-lending-step-retry-001',
        transactionPlanId: 'txplan-ember-lending-step-retry-001',
        requestId: 'req-ember-lending-step-retry-001',
        canonicalUnsignedPayloadRef: 'unsigned-txpayload-ember-lending-step-retry-001:1',
        delegationArtifactRef: TEST_ACTIVE_DELEGATION_ARTIFACT_REF,
        rootDelegationArtifactRef: TEST_ROOT_DELEGATION_ARTIFACT_REF,
        plannedTransactionPayloadRef: 'txpayload-ember-lending-step-retry-001:1',
        walletAddress: '0x00000000000000000000000000000000000000b1',
        network: 'arbitrum',
        requiredControlPath: 'lending.supply',
      }),
    ).resolves.toBe(expectedUnsignedTransactionHex);

    expect(rpcClient.estimateGas).toHaveBeenCalledTimes(2);
    expect(rpcClient.getTransactionCount).toHaveBeenCalledTimes(2);
    expect(rpcClient.estimateFeesPerGas).toHaveBeenCalledTimes(2);
  });

  it('walks paginated token responses until it finds the requested asset', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            tokens: [
              {
                tokenUid: {
                  chainId: '42161',
                  address: '0x00000000000000000000000000000000000000a1',
                },
                name: 'Wrapped Ether',
                symbol: 'WETH',
                isNative: false,
                decimals: 18,
                iconUri: null,
                isVetted: true,
              },
            ],
            cursor: 'page-2',
            currentPage: 1,
            totalPages: 2,
            totalItems: 2,
          }),
          {
            status: 200,
            headers: {
              'content-type': 'application/json',
            },
          },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            tokens: [
              {
                tokenUid: {
                  chainId: '42161',
                  address: '0x00000000000000000000000000000000000000c1',
                },
                name: 'USD Coin',
                symbol: 'USDC',
                isNative: false,
                decimals: 6,
                iconUri: null,
                isVetted: true,
              },
            ],
            cursor: null,
            currentPage: 2,
            totalPages: 2,
            totalItems: 2,
          }),
          {
            status: 200,
            headers: {
              'content-type': 'application/json',
            },
          },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            transactions: [
              {
                type: 'EVM_TX',
                to: '0x00000000000000000000000000000000000000d2',
                value: '0',
                data: '0x617ba037',
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
        ),
      );
    const resolver = createEmberLendingOnchainActionsAnchoredPayloadResolver({
      baseUrl: 'https://api.emberai.xyz',
      fetch: fetchImpl,
    });

    await expect(
      resolver.anchorCandidatePlanPayload({
        agentId: 'ember-lending',
        threadId: 'thread-1',
        transactionPlanId: 'txplan-ember-lending-002',
        walletAddress: '0x00000000000000000000000000000000000000b1',
        rootUserWalletAddress: '0x00000000000000000000000000000000000000a1',
        payloadBuilderOutput: {
          transaction_payload_ref: 'txpayload-ember-lending-002',
          required_control_path: 'lending.supply',
          network: 'arbitrum',
        },
        compactPlanSummary: {
          control_path: 'lending.supply',
          asset: 'USDC',
          amount: '10',
          summary: 'supply reserved USDC on Aave',
        },
      }),
    ).resolves.toMatchObject({
      anchoredPayloadRef: 'txpayload-ember-lending-002',
      transactionPlanId: 'txplan-ember-lending-002',
    });

    expect(fetchImpl).toHaveBeenNthCalledWith(
      1,
      'https://api.emberai.xyz/tokens?chainIds=42161&page=1',
      undefined,
    );
    expect(fetchImpl).toHaveBeenNthCalledWith(
      2,
      'https://api.emberai.xyz/tokens?chainIds=42161&page=2',
      undefined,
    );
    expect(fetchImpl).toHaveBeenNthCalledWith(
      3,
      'https://api.emberai.xyz/lending/supply',
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          walletAddress: '0x00000000000000000000000000000000000000a1',
          supplyTokenUid: {
            chainId: '42161',
            address: '0x00000000000000000000000000000000000000c1',
          },
          amount: '10000000',
        }),
      },
    );
  });

  it('converts decimal token quantities into base units before calling Onchain Actions', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            tokens: [
              {
                tokenUid: {
                  chainId: '42161',
                  address: '0x00000000000000000000000000000000000000a1',
                },
                name: 'Wrapped Ether',
                symbol: 'WETH',
                isNative: false,
                decimals: 18,
                iconUri: null,
                isVetted: true,
              },
            ],
            cursor: null,
            currentPage: 1,
            totalPages: 1,
            totalItems: 1,
          }),
          {
            status: 200,
            headers: {
              'content-type': 'application/json',
            },
          },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            transactions: [
              {
                type: 'EVM_TX',
                to: '0x00000000000000000000000000000000000000d2',
                value: '0',
                data: '0x617ba037',
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
        ),
      );
    const resolver = createEmberLendingOnchainActionsAnchoredPayloadResolver({
      baseUrl: 'https://api.emberai.xyz',
      fetch: fetchImpl,
    });

    await resolver.anchorCandidatePlanPayload({
      agentId: 'ember-lending',
      threadId: 'thread-1',
      transactionPlanId: 'txplan-ember-lending-decimal-001',
      walletAddress: '0x00000000000000000000000000000000000000b1',
      rootUserWalletAddress: '0x00000000000000000000000000000000000000a1',
      payloadBuilderOutput: {
        transaction_payload_ref: 'txpayload-ember-lending-decimal-001',
        required_control_path: 'lending.supply',
        network: 'arbitrum',
      },
        compactPlanSummary: {
          control_path: 'lending.supply',
          asset: 'WETH',
          amount: '0.005',
        summary: 'supply reserved WETH on Aave',
      },
    });

    expect(fetchImpl).toHaveBeenNthCalledWith(
      2,
      'https://api.emberai.xyz/lending/supply',
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          walletAddress: '0x00000000000000000000000000000000000000a1',
          supplyTokenUid: {
            chainId: '42161',
            address: '0x00000000000000000000000000000000000000a1',
          },
          amount: parseUnits('0.005', 18).toString(),
        }),
      },
    );
  });

  it('uses the full-debt sentinel when anchoring a repay payload for the rooted user wallet', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            tokens: [
              {
                tokenUid: {
                  chainId: '42161',
                  address: '0x00000000000000000000000000000000000000a1',
                },
                name: 'Wrapped Ether',
                symbol: 'WETH',
                isNative: false,
                decimals: 18,
                iconUri: null,
                isVetted: true,
              },
            ],
            cursor: null,
            currentPage: 1,
            totalPages: 1,
            totalItems: 1,
          }),
          {
            status: 200,
            headers: {
              'content-type': 'application/json',
            },
          },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            transactions: [
              {
                type: 'EVM_TX',
                to: '0x00000000000000000000000000000000000000d2',
                value: '0',
                data: '0x573ade81',
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
        ),
      );
    const resolver = createEmberLendingOnchainActionsAnchoredPayloadResolver({
      baseUrl: 'https://api.emberai.xyz',
      fetch: fetchImpl,
    });

    await resolver.anchorCandidatePlanPayload({
      agentId: 'ember-lending',
      threadId: 'thread-rooted-repay-all-1',
      transactionPlanId: 'txplan-ember-lending-rooted-repay-all-001',
      walletAddress: '0x00000000000000000000000000000000000000b1',
      rootUserWalletAddress: '0x00000000000000000000000000000000000000a1',
      useMaxRepayAmount: true,
      payloadBuilderOutput: {
        transaction_payload_ref: 'txpayload-ember-lending-rooted-repay-all-001',
        required_control_path: 'lending.repay',
        network: 'arbitrum',
      },
      compactPlanSummary: {
        control_path: 'lending.repay',
        asset: 'WETH',
        amount: '20000000000000000',
        summary:
          'repay the full outstanding WETH loan so the managed lending position returns to a debt-free supplied state',
      },
    });

    expect(fetchImpl).toHaveBeenNthCalledWith(
      2,
      'https://api.emberai.xyz/lending/repay',
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          walletAddress: '0x00000000000000000000000000000000000000a1',
          repayTokenUid: {
            chainId: '42161',
            address: '0x00000000000000000000000000000000000000a1',
          },
          amount: MAX_UINT256,
        }),
      },
    );
  });

  it('maps Arbitrum native-USDC debt wrapper symbols back to canonical USDC when anchoring repay payloads', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            tokens: [
              {
                tokenUid: {
                  chainId: '42161',
                  address: '0x00000000000000000000000000000000000000c9',
                },
                name: 'USD Coin',
                symbol: 'USDC',
                isNative: false,
                decimals: 6,
                iconUri: null,
                isVetted: true,
              },
            ],
            cursor: null,
            currentPage: 1,
            totalPages: 1,
            totalItems: 1,
          }),
          {
            status: 200,
            headers: {
              'content-type': 'application/json',
            },
          },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            transactions: [
              {
                type: 'EVM_TX',
                to: '0x00000000000000000000000000000000000000d2',
                value: '0',
                data: '0x573ade81',
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
        ),
      );
    const resolver = createEmberLendingOnchainActionsAnchoredPayloadResolver({
      baseUrl: 'https://api.emberai.xyz',
      fetch: fetchImpl,
    });

    await resolver.anchorCandidatePlanPayload({
      agentId: 'ember-lending',
      threadId: 'thread-rooted-repay-usdcn-1',
      transactionPlanId: 'txplan-ember-lending-rooted-repay-usdcn-001',
      walletAddress: '0x00000000000000000000000000000000000000b9',
      rootUserWalletAddress: '0x00000000000000000000000000000000000000b9',
      useMaxRepayAmount: false,
      payloadBuilderOutput: {
        transaction_payload_ref: 'txpayload-ember-lending-rooted-repay-usdcn-001',
        required_control_path: 'lending.repay',
        network: 'arbitrum',
      },
      compactPlanSummary: {
        control_path: 'lending.repay',
        asset: 'variableDebtArbUSDCn',
        amount: '2.5',
        summary: 'repay an exact partial USDC debt amount on Aave',
      },
    });

    expect(fetchImpl).toHaveBeenNthCalledWith(
      2,
      'https://api.emberai.xyz/lending/repay',
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          walletAddress: '0x00000000000000000000000000000000000000b9',
          repayTokenUid: {
            chainId: '42161',
            address: '0x00000000000000000000000000000000000000c9',
          },
          amount: '2500000',
        }),
      },
    );
  });

  it('keeps the exact requested amount for repay payloads when the plan was built from explicit requested quantities', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            tokens: [
              {
                tokenUid: {
                  chainId: '42161',
                  address: '0x00000000000000000000000000000000000000a1',
                },
                name: 'Wrapped Ether',
                symbol: 'WETH',
                isNative: false,
                decimals: 18,
                iconUri: null,
                isVetted: true,
              },
            ],
            cursor: null,
            currentPage: 1,
            totalPages: 1,
            totalItems: 1,
          }),
          {
            status: 200,
            headers: {
              'content-type': 'application/json',
            },
          },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            transactions: [
              {
                type: 'EVM_TX',
                to: '0x00000000000000000000000000000000000000d2',
                value: '0',
                data: '0x573ade81',
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
        ),
      );
    const resolver = createEmberLendingOnchainActionsAnchoredPayloadResolver({
      baseUrl: 'https://api.emberai.xyz',
      fetch: fetchImpl,
    });

    await resolver.anchorCandidatePlanPayload({
      agentId: 'ember-lending',
      threadId: 'thread-rooted-repay-partial-1',
      transactionPlanId: 'txplan-ember-lending-rooted-repay-partial-001',
      walletAddress: '0x00000000000000000000000000000000000000b1',
      rootUserWalletAddress: '0x00000000000000000000000000000000000000a1',
      useMaxRepayAmount: false,
      payloadBuilderOutput: {
        transaction_payload_ref: 'txpayload-ember-lending-rooted-repay-partial-001',
        required_control_path: 'lending.repay',
        network: 'arbitrum',
      },
      compactPlanSummary: {
        control_path: 'lending.repay',
        asset: 'WETH',
        amount: '0.02',
        summary: 'repay an exact partial WETH debt amount on Aave',
      },
    });

    expect(fetchImpl).toHaveBeenNthCalledWith(
      2,
      'https://api.emberai.xyz/lending/repay',
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          walletAddress: '0x00000000000000000000000000000000000000a1',
          repayTokenUid: {
            chainId: '42161',
            address: '0x00000000000000000000000000000000000000a1',
          },
          amount: '20000000000000000',
        }),
      },
    );
  });

  it('uses the rooted user wallet as the capital-owning planning wallet when anchoring a managed lending payload', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            tokens: [
              {
                tokenUid: {
                  chainId: '42161',
                  address: '0x00000000000000000000000000000000000000a1',
                },
                name: 'Wrapped Ether',
                symbol: 'WETH',
                isNative: false,
                decimals: 18,
                iconUri: null,
                isVetted: true,
              },
            ],
            cursor: null,
            currentPage: 1,
            totalPages: 1,
            totalItems: 1,
          }),
          {
            status: 200,
            headers: {
              'content-type': 'application/json',
            },
          },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            transactions: [
              {
                type: 'EVM_TX',
                to: '0x00000000000000000000000000000000000000d2',
                value: '0',
                data: '0x617ba037',
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
        ),
      );
    const resolver = createEmberLendingOnchainActionsAnchoredPayloadResolver({
      baseUrl: 'https://api.emberai.xyz',
      fetch: fetchImpl,
    });

    await resolver.anchorCandidatePlanPayload({
      agentId: 'ember-lending',
      threadId: 'thread-rooted-capital-1',
      transactionPlanId: 'txplan-ember-lending-rooted-capital-001',
      walletAddress: '0x00000000000000000000000000000000000000b1',
      rootUserWalletAddress: '0x00000000000000000000000000000000000000a1',
      payloadBuilderOutput: {
        transaction_payload_ref: 'txpayload-ember-lending-rooted-capital-001',
        required_control_path: 'lending.supply',
        network: 'arbitrum',
      },
      compactPlanSummary: {
        control_path: 'lending.supply',
        asset: 'WETH',
        amount: '0.005',
        summary: 'supply reserved WETH on Aave',
      },
    });

    expect(fetchImpl).toHaveBeenNthCalledWith(
      2,
      'https://api.emberai.xyz/lending/supply',
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          walletAddress: '0x00000000000000000000000000000000000000a1',
          supplyTokenUid: {
            chainId: '42161',
            address: '0x00000000000000000000000000000000000000a1',
          },
          amount: '5000000000000000',
        }),
      },
    );
  });

  it('resolves prepared unsigned transactions for managed rooted-capital execution using the signer wallet chain state', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            tokens: [
              {
                tokenUid: {
                  chainId: '42161',
                  address: '0x00000000000000000000000000000000000000a1',
                },
                name: 'Wrapped Ether',
                symbol: 'WETH',
                isNative: false,
                decimals: 18,
                iconUri: null,
                isVetted: true,
              },
            ],
            cursor: null,
            currentPage: 1,
            totalPages: 1,
            totalItems: 1,
          }),
          {
            status: 200,
            headers: {
              'content-type': 'application/json',
            },
          },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            transactions: [
              {
                type: 'EVM_TX',
                to: '0x00000000000000000000000000000000000000d2',
                value: '0',
                data: '0x617ba037',
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
        ),
      );
    const rpcClient = {
      getTransactionCount: vi.fn(async () => 7),
      estimateFeesPerGas: vi.fn(async () => ({
        maxFeePerGas: 200n,
        maxPriorityFeePerGas: 3n,
      })),
      estimateGas: vi.fn(async () => 55_000n),
    };
    const resolver = createEmberLendingOnchainActionsAnchoredPayloadResolver({
      baseUrl: 'https://api.emberai.xyz',
      fetch: fetchImpl,
      resolvePublicClient: vi.fn(() => rpcClient),
    });

    await resolver.anchorCandidatePlanPayload({
      agentId: 'ember-lending',
      threadId: 'thread-rooted-capital-fail-1',
      transactionPlanId: 'txplan-ember-lending-rooted-capital-fail-001',
      walletAddress: '0x00000000000000000000000000000000000000b1',
      rootUserWalletAddress: '0x00000000000000000000000000000000000000a1',
      payloadBuilderOutput: {
        transaction_payload_ref: 'txpayload-ember-lending-rooted-capital-fail-001',
        required_control_path: 'lending.supply',
        network: 'arbitrum',
      },
      compactPlanSummary: {
        control_path: 'lending.supply',
        asset: 'WETH',
        amount: '0.005',
        summary: 'supply reserved WETH on Aave',
      },
    });

    const unsignedTransactionHex = await resolver.resolvePreparedUnsignedTransaction({
      agentId: 'ember-lending',
      executionPreparationId: 'execprep-ember-lending-rooted-capital-fail-001',
      transactionPlanId: 'txplan-ember-lending-rooted-capital-fail-001',
      requestId: 'req-ember-lending-rooted-capital-fail-001',
      canonicalUnsignedPayloadRef: 'unsigned-txpayload-ember-lending-rooted-capital-fail-001',
      delegationArtifactRef: TEST_ACTIVE_DELEGATION_ARTIFACT_REF,
      rootDelegationArtifactRef: TEST_ROOT_DELEGATION_ARTIFACT_REF,
      plannedTransactionPayloadRef: 'txpayload-ember-lending-rooted-capital-fail-001',
      walletAddress: '0x00000000000000000000000000000000000000b1',
      network: 'arbitrum',
      requiredControlPath: 'lending.supply',
    });

    expect(unsignedTransactionHex).toBe(
      buildExpectedDelegatedUnsignedTransactionHex({
        transaction: {
          to: '0x00000000000000000000000000000000000000d2',
          value: '0',
          data: '0x617ba037',
          chainId: '42161',
        },
        nonce: 7,
        gas: bufferDelegatedExecutionGas(55_000n),
        maxFeePerGas: 200n,
        maxPriorityFeePerGas: 3n,
      }),
    );
    expect(rpcClient.getTransactionCount).toHaveBeenCalledWith({
      address: '0x00000000000000000000000000000000000000b1',
      blockTag: 'pending',
    });
    expect(rpcClient.estimateGas).toHaveBeenCalledWith({
      account: '0x00000000000000000000000000000000000000b1',
      to: getDeleGatorEnvironment(42161).DelegationManager.toLowerCase(),
      value: 0n,
      data: expect.any(String),
    });
  });

  it('anchors a planned lending payload and resolves the prepared unsigned transaction by either payload ref', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            tokens: [
              {
                tokenUid: {
                  chainId: '42161',
                  address: '0x00000000000000000000000000000000000000c1',
                },
                name: 'USD Coin',
                symbol: 'USDC',
                isNative: false,
                decimals: 6,
                iconUri: null,
                isVetted: true,
              },
            ],
          }),
          {
            status: 200,
            headers: {
              'content-type': 'application/json',
            },
          },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            transactions: [
              {
                type: 'EVM_TX',
                to: '0x00000000000000000000000000000000000000d1',
                value: '0',
                data: '0x095ea7b3',
                chainId: '42161',
              },
              {
                type: 'EVM_TX',
                to: '0x00000000000000000000000000000000000000d2',
                value: '0',
                data: '0x617ba037',
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
        ),
      );
    const rpcClient = {
      getTransactionCount: vi.fn(async () => 9),
      estimateFeesPerGas: vi.fn(async () => ({
        maxFeePerGas: 200n,
        maxPriorityFeePerGas: 3n,
      })),
      estimateGas: vi.fn(async () => 55_000n),
    };
    const resolver = createEmberLendingOnchainActionsAnchoredPayloadResolver({
      baseUrl: 'https://api.emberai.xyz',
      fetch: fetchImpl,
      resolvePublicClient: vi.fn(() => rpcClient),
    });

    const anchoredPayload = await resolver.anchorCandidatePlanPayload({
      agentId: 'ember-lending',
      threadId: 'thread-1',
      transactionPlanId: 'txplan-ember-lending-001',
      walletAddress: '0x00000000000000000000000000000000000000b1',
      rootUserWalletAddress: '0x00000000000000000000000000000000000000b1',
      payloadBuilderOutput: {
        transaction_payload_ref: 'txpayload-ember-lending-001',
        required_control_path: 'lending.supply',
        network: 'arbitrum',
      },
      compactPlanSummary: {
        control_path: 'lending.supply',
        asset: 'USDC',
        amount: '10',
        summary: 'supply reserved USDC on Aave',
      },
    });

    expect(fetchImpl).toHaveBeenNthCalledWith(
      1,
      'https://api.emberai.xyz/tokens?chainIds=42161&page=1',
      undefined,
    );
    expect(fetchImpl).toHaveBeenNthCalledWith(
      2,
      'https://api.emberai.xyz/lending/supply',
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          walletAddress: '0x00000000000000000000000000000000000000b1',
          supplyTokenUid: {
            chainId: '42161',
            address: '0x00000000000000000000000000000000000000c1',
          },
          amount: '10000000',
        }),
      },
    );
    expect(anchoredPayload).toMatchObject({
      anchoredPayloadRef: 'txpayload-ember-lending-001',
      capitalOwnerWalletAddress: '0x00000000000000000000000000000000000000b1',
      controlPath: 'lending.supply',
      network: 'arbitrum',
      transactionPlanId: 'txplan-ember-lending-001',
      transactionRequests: [
        {
          type: 'EVM_TX',
          to: '0x00000000000000000000000000000000000000d1',
          value: '0',
          data: '0x095ea7b3',
          chainId: '42161',
        },
        {
          type: 'EVM_TX',
          to: '0x00000000000000000000000000000000000000d2',
          value: '0',
          data: '0x617ba037',
          chainId: '42161',
        },
      ],
    });
    const expectedBatchUnsignedTransactionHex = buildExpectedDelegatedUnsignedTransactionHex({
      transactions: [
        {
          to: '0x00000000000000000000000000000000000000d1',
          value: '0',
          data: '0x095ea7b3',
          chainId: '42161',
        },
        {
          to: '0x00000000000000000000000000000000000000d2',
          value: '0',
          data: '0x617ba037',
          chainId: '42161',
        },
      ],
      nonce: 9,
      gas: bufferDelegatedExecutionGas(55_000n),
      maxFeePerGas: 200n,
      maxPriorityFeePerGas: 3n,
    });
    const expectedTerminalUnsignedTransactionHex = buildExpectedDelegatedUnsignedTransactionHex({
      transaction: {
        to: '0x00000000000000000000000000000000000000d2',
        value: '0',
        data: '0x617ba037',
        chainId: '42161',
      },
      nonce: 9,
      gas: bufferDelegatedExecutionGas(55_000n),
      maxFeePerGas: 200n,
      maxPriorityFeePerGas: 3n,
    });

    await expect(
      resolver.resolvePreparedUnsignedTransaction({
        agentId: 'ember-lending',
        executionPreparationId: 'execprep-ember-lending-001',
        transactionPlanId: 'txplan-ember-lending-001',
        requestId: 'req-ember-lending-execution-001',
        canonicalUnsignedPayloadRef: 'unsigned-txpayload-ember-lending-001',
        delegationArtifactRef: TEST_ACTIVE_DELEGATION_ARTIFACT_REF,
        rootDelegationArtifactRef: TEST_ROOT_DELEGATION_ARTIFACT_REF,
        plannedTransactionPayloadRef: 'txpayload-ember-lending-001',
        walletAddress: '0x00000000000000000000000000000000000000b1',
        network: 'arbitrum',
        requiredControlPath: 'lending.supply',
      }),
    ).resolves.toBe(expectedBatchUnsignedTransactionHex);

    await expect(
      resolver.resolvePreparedUnsignedTransaction({
        agentId: 'ember-lending',
        executionPreparationId: 'execprep-ember-lending-001',
        transactionPlanId: 'txplan-ember-lending-001',
        requestId: 'req-ember-lending-execution-001',
        canonicalUnsignedPayloadRef: 'unsigned-txpayload-ember-lending-001:1',
        delegationArtifactRef: TEST_ACTIVE_DELEGATION_ARTIFACT_REF,
        rootDelegationArtifactRef: TEST_ROOT_DELEGATION_ARTIFACT_REF,
        plannedTransactionPayloadRef: null,
        walletAddress: '0x00000000000000000000000000000000000000b1',
        network: 'arbitrum',
        requiredControlPath: 'lending.supply',
      }),
    ).resolves.toBe(expectedTerminalUnsignedTransactionHex);
  });

  it('resolves anchored payloads from persisted records after a fresh resolver instance starts', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            tokens: [
              {
                tokenUid: {
                  chainId: '42161',
                  address: '0x00000000000000000000000000000000000000c1',
                },
                name: 'USD Coin',
                symbol: 'USDC',
                isNative: false,
                decimals: 6,
                iconUri: null,
                isVetted: true,
              },
            ],
            cursor: null,
            currentPage: 1,
            totalPages: 1,
            totalItems: 1,
          }),
          {
            status: 200,
            headers: {
              'content-type': 'application/json',
            },
          },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            transactions: [
              {
                type: 'EVM_TX',
                to: '0x00000000000000000000000000000000000000d1',
                value: '0',
                data: '0x095ea7b3',
                chainId: '42161',
              },
              {
                type: 'EVM_TX',
                to: '0x00000000000000000000000000000000000000d2',
                value: '0',
                data: '0x617ba037',
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
        ),
      );
    const rpcClient = {
      getTransactionCount: vi.fn(async () => 11),
      estimateFeesPerGas: vi.fn(async () => ({
        maxFeePerGas: 300n,
        maxPriorityFeePerGas: 5n,
      })),
      estimateGas: vi.fn(async () => 65_000n),
    };
    const resolvePublicClient = vi.fn(() => rpcClient);
    const firstResolver = createEmberLendingOnchainActionsAnchoredPayloadResolver({
      baseUrl: 'https://api.emberai.xyz',
      fetch: fetchImpl,
      resolvePublicClient,
    });

    const anchoredPayload = await firstResolver.anchorCandidatePlanPayload({
      agentId: 'ember-lending',
      threadId: 'thread-1',
      transactionPlanId: 'txplan-ember-lending-004',
      walletAddress: '0x00000000000000000000000000000000000000b1',
      rootUserWalletAddress: '0x00000000000000000000000000000000000000b1',
      payloadBuilderOutput: {
        transaction_payload_ref: 'txpayload-ember-lending-004',
        required_control_path: 'lending.supply',
        network: 'arbitrum',
      },
      compactPlanSummary: {
        control_path: 'lending.supply',
        asset: 'USDC',
        amount: '10',
        summary: 'supply reserved USDC on Aave',
      },
    });
    const freshResolver = createEmberLendingOnchainActionsAnchoredPayloadResolver({
      baseUrl: 'https://api.emberai.xyz',
      fetch: vi.fn<typeof fetch>(),
      resolvePublicClient,
    });

    await expect(
      freshResolver.resolvePreparedUnsignedTransaction({
        agentId: 'ember-lending',
        executionPreparationId: 'execprep-ember-lending-004',
        transactionPlanId: 'txplan-ember-lending-004',
        requestId: 'req-ember-lending-execution-004',
        canonicalUnsignedPayloadRef: 'unsigned-txpayload-ember-lending-004:1',
        delegationArtifactRef: TEST_ACTIVE_DELEGATION_ARTIFACT_REF,
        rootDelegationArtifactRef: TEST_ROOT_DELEGATION_ARTIFACT_REF,
        plannedTransactionPayloadRef: null,
        walletAddress: '0x00000000000000000000000000000000000000b1',
        network: 'arbitrum',
        requiredControlPath: 'lending.supply',
        anchoredPayloadRecords: [anchoredPayload!],
      }),
    ).resolves.toBe(
      buildExpectedDelegatedUnsignedTransactionHex({
        transaction: {
          to: '0x00000000000000000000000000000000000000d2',
          value: '0',
          data: '0x617ba037',
          chainId: '42161',
        },
        nonce: 11,
        gas: bufferDelegatedExecutionGas(65_000n),
        maxFeePerGas: 300n,
        maxPriorityFeePerGas: 5n,
      }),
    );
  });

  it('normalizes non-prefixed delegation signatures before building the delegated wrapper transaction', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            tokens: [
              {
                tokenUid: {
                  chainId: '42161',
                  address: '0x00000000000000000000000000000000000000c1',
                },
                name: 'USD Coin',
                symbol: 'USDC',
                isNative: false,
                decimals: 6,
                iconUri: null,
                isVetted: true,
              },
            ],
            currentPage: 1,
            totalPages: 1,
          }),
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            transactions: [
              {
                type: 'EVM_TX',
                to: '0x00000000000000000000000000000000000000d1',
                value: '0',
                data: '0xabcdef12',
                chainId: '42161',
              },
            ],
          }),
        ),
      );

    const publicClient = {
      getTransactionCount: vi.fn(async () => 9),
      estimateFeesPerGas: vi.fn(async () => ({
        maxFeePerGas: 15n,
        maxPriorityFeePerGas: 2n,
      })),
      estimateGas: vi.fn(async () => 210000n),
    };

    const resolver = createEmberLendingOnchainActionsAnchoredPayloadResolver({
      apiUrl: 'http://127.0.0.1:50052',
      fetch: fetchImpl,
      resolvePublicClient: vi.fn(() => publicClient as never),
    });

    const anchoredPayload = await resolver.anchorCandidatePlanPayload({
      agentId: 'ember-lending',
      threadId: 'thread-1',
      transactionPlanId: 'txplan-001',
      walletAddress: '0x00000000000000000000000000000000000000b1',
      rootUserWalletAddress: '0x00000000000000000000000000000000000000a1',
      payloadBuilderOutput: {
        transaction_payload_ref: 'tx-lending-supply-01',
        required_control_path: 'lending.supply',
        network: 'arbitrum',
      },
      compactPlanSummary: {
        control_path: 'lending.supply',
        asset: 'USDC',
        amount: '0.22',
        summary: 'supply reserved USDC on Aave',
      },
    });

    const unsignedTransactionHex = await resolver.resolvePreparedUnsignedTransaction({
      agentId: 'ember-lending',
      executionPreparationId: 'prep-001',
      transactionPlanId: 'txplan-001',
      requestId: 'req-001',
      canonicalUnsignedPayloadRef: 'unsigned-tx-lending-supply-01',
      delegationArtifactRef: TEST_ACTIVE_DELEGATION_ARTIFACT_REF_NO_PREFIX_SIG,
      rootDelegationArtifactRef: TEST_ROOT_DELEGATION_ARTIFACT_REF_NO_PREFIX_SIG,
      plannedTransactionPayloadRef: 'tx-lending-supply-01',
      walletAddress: '0x00000000000000000000000000000000000000b1',
      network: 'arbitrum',
      requiredControlPath: 'lending.supply',
      anchoredPayloadRecords: [anchoredPayload!],
    });

    expect(unsignedTransactionHex).toBe(
      buildExpectedDelegatedUnsignedTransactionHex({
        transaction: {
          chainId: '42161',
          to: '0x00000000000000000000000000000000000000d1',
          value: '0',
          data: '0xabcdef12',
        },
        nonce: 9,
        gas: bufferDelegatedExecutionGas(210000n),
        maxFeePerGas: 15n,
        maxPriorityFeePerGas: 2n,
      }),
    );
  });
});
