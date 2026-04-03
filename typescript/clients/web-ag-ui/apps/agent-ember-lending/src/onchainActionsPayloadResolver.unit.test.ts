import { describe, expect, it, vi } from 'vitest';

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
    const resolver = createEmberLendingOnchainActionsAnchoredPayloadResolver({
      baseUrl: 'https://api.emberai.xyz',
      fetch: fetchImpl,
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
      'https://api.emberai.xyz/tokens?chainIds=42161',
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
    });
    expect(anchoredPayload?.unsignedTransactionHex).toMatch(/^0x[0-9a-f]+$/u);

    await expect(
      resolver.resolvePreparedUnsignedTransaction({
        agentId: 'ember-lending',
        executionPreparationId: 'execprep-ember-lending-001',
        transactionPlanId: 'txplan-ember-lending-001',
        requestId: 'req-ember-lending-execution-001',
        canonicalUnsignedPayloadRef: 'unsigned-txpayload-ember-lending-001',
        plannedTransactionPayloadRef: 'txpayload-ember-lending-001',
        network: 'arbitrum',
        requiredControlPath: 'lending.supply',
      }),
    ).resolves.toBe(anchoredPayload?.unsignedTransactionHex);

    await expect(
      resolver.resolvePreparedUnsignedTransaction({
        agentId: 'ember-lending',
        executionPreparationId: 'execprep-ember-lending-001',
        transactionPlanId: 'txplan-ember-lending-001',
        requestId: 'req-ember-lending-execution-001',
        canonicalUnsignedPayloadRef: 'unsigned-txpayload-ember-lending-001',
        plannedTransactionPayloadRef: null,
        network: 'arbitrum',
        requiredControlPath: 'lending.supply',
      }),
    ).resolves.toBe(anchoredPayload?.unsignedTransactionHex);
  });
});
