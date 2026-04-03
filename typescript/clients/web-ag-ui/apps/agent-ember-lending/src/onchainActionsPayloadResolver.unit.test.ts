import { describe, expect, it, vi } from 'vitest';
import { serializeTransaction } from 'viem';

import {
  createEmberLendingOnchainActionsAnchoredPayloadResolver,
  resolveEmberLendingOnchainActionsApiUrl,
} from './onchainActionsPayloadResolver.js';

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
  it('resolves exact unsigned transaction bytes from the anchored request using wallet-aware chain state', async () => {
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
      rootUserWalletAddress: '0x00000000000000000000000000000000000000a1',
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

    await expect(
      resolver.resolvePreparedUnsignedTransaction({
        agentId: 'ember-lending',
        executionPreparationId: 'execprep-ember-lending-003',
        transactionPlanId: 'txplan-ember-lending-003',
        requestId: 'req-ember-lending-execution-003',
        canonicalUnsignedPayloadRef: 'unsigned-txpayload-ember-lending-003',
        plannedTransactionPayloadRef: 'txpayload-ember-lending-003',
        walletAddress: '0x00000000000000000000000000000000000000b1',
        network: 'arbitrum',
        requiredControlPath: 'lending.supply',
      }),
    ).resolves.toBe(
      serializeTransaction({
        chainId: 42161,
        type: 'eip1559',
        nonce: 7,
        gas: 55_000n,
        maxFeePerGas: 200n,
        maxPriorityFeePerGas: 3n,
        to: '0x00000000000000000000000000000000000000d2',
        value: 0n,
        data: '0x617ba037',
      }),
    );

    expect(resolvePublicClient).toHaveBeenCalledWith('arbitrum');
    expect(rpcClient.getTransactionCount).toHaveBeenCalledWith({
      address: '0x00000000000000000000000000000000000000b1',
      blockTag: 'pending',
    });
    expect(rpcClient.estimateFeesPerGas).toHaveBeenCalledWith();
    expect(rpcClient.estimateGas).toHaveBeenCalledWith({
      account: '0x00000000000000000000000000000000000000b1',
      to: '0x00000000000000000000000000000000000000d2',
      value: 0n,
      data: '0x617ba037',
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
          walletAddress: '0x00000000000000000000000000000000000000b1',
          supplyTokenUid: {
            chainId: '42161',
            address: '0x00000000000000000000000000000000000000c1',
          },
          amount: '10',
        }),
      },
    );
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
      rootUserWalletAddress: '0x00000000000000000000000000000000000000a1',
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
          amount: '10',
        }),
      },
    );
    expect(anchoredPayload).toMatchObject({
      anchoredPayloadRef: 'txpayload-ember-lending-001',
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
    const expectedApprovalUnsignedTransactionHex = serializeTransaction({
      chainId: 42161,
      type: 'eip1559',
      nonce: 9,
      gas: 55_000n,
      maxFeePerGas: 200n,
      maxPriorityFeePerGas: 3n,
      to: '0x00000000000000000000000000000000000000d1',
      value: 0n,
      data: '0x095ea7b3',
    });
    const expectedTerminalUnsignedTransactionHex = serializeTransaction({
      chainId: 42161,
      type: 'eip1559',
      nonce: 9,
      gas: 55_000n,
      maxFeePerGas: 200n,
      maxPriorityFeePerGas: 3n,
      to: '0x00000000000000000000000000000000000000d2',
      value: 0n,
      data: '0x617ba037',
    });

    await expect(
      resolver.resolvePreparedUnsignedTransaction({
        agentId: 'ember-lending',
        executionPreparationId: 'execprep-ember-lending-001',
        transactionPlanId: 'txplan-ember-lending-001',
        requestId: 'req-ember-lending-execution-001',
        canonicalUnsignedPayloadRef: 'unsigned-txpayload-ember-lending-001',
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
      rootUserWalletAddress: '0x00000000000000000000000000000000000000a1',
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
        plannedTransactionPayloadRef: null,
        walletAddress: '0x00000000000000000000000000000000000000b1',
        network: 'arbitrum',
        requiredControlPath: 'lending.supply',
        anchoredPayloadRecords: [anchoredPayload!],
      }),
    ).resolves.toBe(
      serializeTransaction({
        chainId: 42161,
        type: 'eip1559',
        nonce: 11,
        gas: 65_000n,
        maxFeePerGas: 300n,
        maxPriorityFeePerGas: 5n,
        to: '0x00000000000000000000000000000000000000d2',
        value: 0n,
        data: '0x617ba037',
      }),
    );
  });
});
