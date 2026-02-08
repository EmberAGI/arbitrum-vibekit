import { describe, expect, it, vi } from 'vitest';

import type { OnchainActionsClient, Token, TokenizedYieldMarket } from '../../clients/onchainActions.js';
import type { ClmmState } from '../context.js';

import { collectDelegationsNode } from './collectDelegations.js';

const {
  interruptMock,
  copilotkitEmitStateMock,
  getAgentWalletAddressMock,
  getOnchainActionsClientMock,
} = vi.hoisted(() => ({
  interruptMock: vi.fn(),
  copilotkitEmitStateMock: vi.fn(),
  getAgentWalletAddressMock: vi.fn(),
  getOnchainActionsClientMock: vi.fn(),
}));

vi.mock('@copilotkit/sdk-js/langgraph', () => ({
  copilotkitEmitState: copilotkitEmitStateMock,
}));

vi.mock('../clientFactory.js', () => ({
  getAgentWalletAddress: getAgentWalletAddressMock,
  getOnchainActionsClient: getOnchainActionsClientMock,
}));

vi.mock('@langchain/langgraph', async (importOriginal) => {
  // Keep the real module exports (e.g. MemorySaver) but override `interrupt`
  // so we can simulate the "request delegation signature" UX flow.
  const actual: unknown = await importOriginal();
  if (typeof actual !== 'object' || actual === null) {
    throw new Error('Unexpected @langchain/langgraph mock import shape');
  }
  return {
    ...(actual as Record<string, unknown>),
    interrupt: interruptMock,
  };
});

describe('collectDelegationsNode', () => {
  it('requests a single delegation signature and stores a delegation bundle with stablecoin approval intents', async () => {
    const usdaiToken: Token = {
      tokenUid: { chainId: '42161', address: '0x0a1a1a107e45b7ced86833863f482bc5f4ed82ef' },
      name: 'USDai',
      symbol: 'USDai',
      isNative: false,
      decimals: 18,
      iconUri: undefined,
      isVetted: true,
    };

    const targetMarket: TokenizedYieldMarket = {
      marketIdentifier: { chainId: '42161', address: '0x2092fa5d02276b3136a50f3c2c3a6ed45413183e' },
      expiry: '2026-02-19',
      details: { impliedApy: 0.18 },
      ptToken: {
        tokenUid: { chainId: '42161', address: '0x1111111111111111111111111111111111111111' },
        name: 'PT-sUSDai',
        symbol: 'PT-sUSDai',
        isNative: false,
        decimals: 18,
        iconUri: undefined,
        isVetted: true,
      },
      ytToken: {
        tokenUid: { chainId: '42161', address: '0x2222222222222222222222222222222222222222' },
        name: 'YT-sUSDai',
        symbol: 'YT-sUSDai',
        isNative: false,
        decimals: 18,
        iconUri: undefined,
        isVetted: true,
      },
      underlyingToken: {
        tokenUid: usdaiToken.tokenUid,
        name: usdaiToken.name,
        symbol: usdaiToken.symbol,
        isNative: false,
        decimals: 18,
        iconUri: undefined,
        isVetted: true,
      },
    };

    const onchainActionsClient: Pick<
      OnchainActionsClient,
      | 'listTokenizedYieldMarkets'
      | 'listTokens'
      | 'createTokenizedYieldBuyPt'
      | 'createTokenizedYieldSellPt'
      | 'createTokenizedYieldRedeemPt'
      | 'createTokenizedYieldClaimRewards'
    > = {
      listTokenizedYieldMarkets: vi.fn().mockResolvedValue([targetMarket]),
      listTokens: vi.fn().mockResolvedValue([usdaiToken]),
      createTokenizedYieldBuyPt: vi.fn().mockResolvedValue({
        transactions: [{ type: 'EVM_TX', to: '0x888888888889758f76e7103c6cbf23abbf58f946', data: '0xc81f847a', value: '0', chainId: '42161' }],
      }),
      createTokenizedYieldSellPt: vi.fn().mockResolvedValue({
        exactAmountOut: '1',
        tokenOut: usdaiToken,
        transactions: [{ type: 'EVM_TX', to: '0x888888888889758f76e7103c6cbf23abbf58f946', data: '0x58181a80', value: '0', chainId: '42161' }],
      }),
      createTokenizedYieldRedeemPt: vi.fn().mockResolvedValue({
        exactUnderlyingAmount: '1',
        underlyingTokenIdentifier: usdaiToken.tokenUid,
        transactions: [{ type: 'EVM_TX', to: '0x888888888889758f76e7103c6cbf23abbf58f946', data: '0x58181a80', value: '0', chainId: '42161' }],
      }),
      createTokenizedYieldClaimRewards: vi.fn().mockResolvedValue({
        transactions: [{ type: 'EVM_TX', to: '0x888888888889758f76e7103c6cbf23abbf58f946', data: '0x58181a80', value: '0', chainId: '42161' }],
      }),
    };

    copilotkitEmitStateMock.mockResolvedValue(undefined);
    getAgentWalletAddressMock.mockReturnValue('0x0000000000000000000000000000000000000002');
    getOnchainActionsClientMock.mockReturnValue(onchainActionsClient);

    // Return a signed delegation matching whatever was requested.
    interruptMock.mockImplementation((request: unknown) => {
      if (!request || typeof request !== 'object' || !('delegationsToSign' in request)) {
        throw new Error('Unexpected interrupt payload');
      }
      const delegationsToSign = (request as { delegationsToSign: Array<Record<string, unknown>> }).delegationsToSign;
      const first = delegationsToSign[0];
      if (!first || typeof first !== 'object') {
        throw new Error('No delegation requested');
      }
      return Promise.resolve(JSON.stringify({
        outcome: 'signed',
        signedDelegations: [{ ...first, signature: '0x01' }],
      }));
    });

    const state = {
      view: {
        delegationsBypassActive: false,
        delegationBundle: undefined,
        operatorInput: {
          walletAddress: '0x0000000000000000000000000000000000000001',
          amountUsd: 10,
          maxGasSpendEth: 0.01,
        },
        fundingTokenInput: {
          fundingTokenAddress: usdaiToken.tokenUid.address,
        },
        task: { id: 'task-1', taskStatus: { state: 'submitted' } },
        activity: { telemetry: [], events: [] },
        profile: { pools: [], allowedPools: [] },
        metrics: { cyclesSinceRebalance: 0, staleCycles: 0, iteration: 0 },
        transactionHistory: [],
      },
    } as unknown as ClmmState;

    const result = await collectDelegationsNode(state, {});

    expect(interruptMock).toHaveBeenCalledTimes(1);
    const interruptArg = interruptMock.mock.calls[0]?.[0] as { delegationsToSign: unknown[]; delegationManager: string };
    expect(interruptArg.delegationsToSign).toHaveLength(1);
    expect(interruptArg.delegationManager).not.toBe('0x0000000000000000000000000000000000000000');

    expect('view' in result).toBe(true);
    const view = (result as { view: { delegationBundle?: unknown } }).view;
    expect(view.delegationBundle).toBeTruthy();
    const bundle = view.delegationBundle as {
      delegations: unknown[];
      intents: Array<{ selector: string; target: string }>;
    };
    expect(bundle.delegations).toHaveLength(1);
    expect(
      bundle.intents.some(
        (intent) =>
          intent.selector.toLowerCase() === '0x095ea7b3' &&
          intent.target.toLowerCase() === usdaiToken.tokenUid.address.toLowerCase(),
      ),
    ).toBe(true);
  });
});
