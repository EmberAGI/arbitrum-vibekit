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
    to: delegationManager as `0x${string}`,
    value: 0n,
    data,
  });
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
      gas: 55_000n,
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
          amount: parseUnits('10', 6).toString(),
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
          amount: parseUnits('0.005', 18).toString(),
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
        gas: 55_000n,
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
          amount: parseUnits('10', 6).toString(),
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
    const expectedApprovalUnsignedTransactionHex = buildExpectedDelegatedUnsignedTransactionHex({
      transaction: {
        to: '0x00000000000000000000000000000000000000d1',
        value: '0',
        data: '0x095ea7b3',
        chainId: '42161',
      },
      nonce: 9,
      gas: 55_000n,
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
      gas: 55_000n,
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
    ).resolves.toBe(expectedApprovalUnsignedTransactionHex);

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
        gas: 65_000n,
        maxFeePerGas: 300n,
        maxPriorityFeePerGas: 5n,
      }),
    );
  });
});
