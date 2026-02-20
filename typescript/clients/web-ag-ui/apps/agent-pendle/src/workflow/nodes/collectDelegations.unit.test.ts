import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { OnchainActionsClient, Token, TokenizedYieldMarket } from '../../clients/onchainActions.js';
import type { ClmmState } from '../context.js';

import { collectDelegationsNode } from './collectDelegations.js';

const PENDLE_ROUTER_TARGET = '0x888888888889758f76e7103c6cbf23abbf58f946';
const PENDLE_BUY_PT_SELECTOR = '0xc81f847a';
const PENDLE_SELL_PT_SELECTOR = '0x594a88cc';
const PENDLE_REDEEM_PT_SELECTOR = '0x47f1de22';
const PENDLE_EXIT_POST_EXP_TO_TOKEN_SELECTOR = '0xf06a07a0';
const PENDLE_CLAIM_REWARDS_SELECTOR = '0x0741a803';

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
  beforeEach(() => {
    interruptMock.mockReset();
    copilotkitEmitStateMock.mockReset();
    getAgentWalletAddressMock.mockReset();
    getOnchainActionsClientMock.mockReset();
  });

  it('persists input-required state before requesting delegation signatures', async () => {
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
        transactions: [{ type: 'EVM_TX', to: PENDLE_ROUTER_TARGET, data: PENDLE_BUY_PT_SELECTOR, value: '0', chainId: '42161' }],
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

    const result = await collectDelegationsNode(state, { configurable: { thread_id: 'thread-1' } });

    expect(interruptMock).not.toHaveBeenCalled();
    expect(copilotkitEmitStateMock).toHaveBeenCalledTimes(1);
    const commandResult = result as unknown as { goto?: string[]; update?: { view?: { task?: { taskStatus?: { state?: string } } } } };
    expect(commandResult.goto).toContain('collectDelegations');
    expect(commandResult.update?.view?.task?.taskStatus?.state).toBe('input-required');
    expect(
      commandResult.update?.view?.operatorInput as { walletAddress?: string } | undefined,
    ).toEqual(
      expect.objectContaining({
        walletAddress: '0x0000000000000000000000000000000000000001',
      }),
    );
    expect(
      commandResult.update?.view?.fundingTokenInput as { fundingTokenAddress?: string } | undefined,
    ).toEqual(
      expect.objectContaining({
        fundingTokenAddress: '0x0a1a1a107e45b7ced86833863f482bc5f4ed82ef',
      }),
    );
  });

  it('preserves reduced onboarding totals when delegation becomes the final step', async () => {
    const state = {
      view: {
        delegationsBypassActive: true,
        delegationBundle: undefined,
        onboarding: { step: 2, key: 'funding-token' },
      },
    } as unknown as ClmmState;

    const result = await collectDelegationsNode(state, {});

    expect('view' in result).toBe(true);
    const onboarding = (result as { view: { onboarding?: { step: number; key?: string } } }).view
      .onboarding;
    expect(onboarding).toEqual({ step: 2, key: 'funding-token' });
  });

  it('advances task state after delegation bundle is present', async () => {
    const state = {
      view: {
        delegationsBypassActive: false,
        delegationBundle: {
          signedDelegations: [],
        },
        task: {
          id: 'task-1',
          taskStatus: {
            state: 'input-required',
            message: {
              content: 'Waiting for delegation approval to continue onboarding.',
            },
          },
        },
        activity: { telemetry: [], events: [] },
      },
    } as unknown as ClmmState;

    const result = await collectDelegationsNode(state, {});

    expect('view' in result).toBe(true);
    const view = (result as { view: { task?: { taskStatus?: { state?: string; message?: { content?: string } } } } })
      .view;
    expect(view.task?.taskStatus?.state).toBe('working');
    expect(view.task?.taskStatus?.message?.content).toBe('Delegation approvals received. Continuing onboarding.');
  });

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
        transactions: [{ type: 'EVM_TX', to: PENDLE_ROUTER_TARGET, data: PENDLE_BUY_PT_SELECTOR, value: '0', chainId: '42161' }],
      }),
      createTokenizedYieldSellPt: vi.fn().mockResolvedValue({
        exactAmountOut: '1',
        tokenOut: usdaiToken,
        transactions: [{ type: 'EVM_TX', to: PENDLE_ROUTER_TARGET, data: '0x58181a80', value: '0', chainId: '42161' }],
      }),
      createTokenizedYieldRedeemPt: vi.fn().mockResolvedValue({
        exactUnderlyingAmount: '1',
        underlyingTokenIdentifier: usdaiToken.tokenUid,
        transactions: [{ type: 'EVM_TX', to: PENDLE_ROUTER_TARGET, data: '0x58181a80', value: '0', chainId: '42161' }],
      }),
      createTokenizedYieldClaimRewards: vi.fn().mockResolvedValue({
        transactions: [{ type: 'EVM_TX', to: PENDLE_ROUTER_TARGET, data: '0x58181a80', value: '0', chainId: '42161' }],
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

  it('includes PT approval intents for discovered markets so delegated execution can submit unwind txs', async () => {
    const usdaiToken: Token = {
      tokenUid: { chainId: '42161', address: '0x0a1a1a107e45b7ced86833863f482bc5f4ed82ef' },
      name: 'USDai',
      symbol: 'USDai',
      isNative: false,
      decimals: 18,
      iconUri: undefined,
      isVetted: true,
    };

    const ptTokenAddress = '0x1111111111111111111111111111111111111111';

    const targetMarket: TokenizedYieldMarket = {
      marketIdentifier: { chainId: '42161', address: '0x2092fa5d02276b3136a50f3c2c3a6ed45413183e' },
      expiry: '2026-02-19',
      details: { impliedApy: 0.18 },
      ptToken: {
        tokenUid: { chainId: '42161', address: ptTokenAddress },
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
        transactions: [
          {
            type: 'EVM_TX',
            to: PENDLE_ROUTER_TARGET,
            data: '0xc81f847a',
            value: '0',
            chainId: '42161',
          },
        ],
      }),
      // Include an approval tx to the PT token contract to simulate the real world sequence
      // unwinds/rebalances will need at runtime.
      createTokenizedYieldSellPt: vi.fn().mockResolvedValue({
        exactAmountOut: '1',
        tokenOut: usdaiToken,
        transactions: [
          {
            type: 'EVM_TX',
            to: ptTokenAddress,
            data: '0x095ea7b3',
            value: '0',
            chainId: '42161',
          },
          {
            type: 'EVM_TX',
            to: PENDLE_ROUTER_TARGET,
            data: '0x58181a80',
            value: '0',
            chainId: '42161',
          },
        ],
      }),
      createTokenizedYieldRedeemPt: vi.fn().mockResolvedValue({
        exactUnderlyingAmount: '1',
        underlyingTokenIdentifier: usdaiToken.tokenUid,
        transactions: [
          {
            type: 'EVM_TX',
            to: PENDLE_ROUTER_TARGET,
            data: '0x58181a80',
            value: '0',
            chainId: '42161',
          },
        ],
      }),
      createTokenizedYieldClaimRewards: vi.fn().mockResolvedValue({
        transactions: [
          {
            type: 'EVM_TX',
            to: PENDLE_ROUTER_TARGET,
            data: '0x58181a80',
            value: '0',
            chainId: '42161',
          },
        ],
      }),
    };

    copilotkitEmitStateMock.mockResolvedValue(undefined);
    getAgentWalletAddressMock.mockReturnValue('0x0000000000000000000000000000000000000002');
    getOnchainActionsClientMock.mockReturnValue(onchainActionsClient);

    interruptMock.mockImplementation((request: unknown) => {
      if (!request || typeof request !== 'object' || !('delegationsToSign' in request)) {
        throw new Error('Unexpected interrupt payload');
      }
      const delegationsToSign = (request as { delegationsToSign: Array<Record<string, unknown>> }).delegationsToSign;
      const first = delegationsToSign[0];
      if (!first || typeof first !== 'object') {
        throw new Error('No delegation requested');
      }
      return Promise.resolve(
        JSON.stringify({
          outcome: 'signed',
          signedDelegations: [{ ...first, signature: '0x01' }],
        }),
      );
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

    expect('view' in result).toBe(true);
    const view = (result as { view: { delegationBundle?: unknown } }).view;
    const bundle = view.delegationBundle as {
      intents: Array<{ selector: string; target: string }>;
    };

    expect(
      bundle.intents.some(
        (intent) =>
          intent.selector.toLowerCase() === '0x095ea7b3' &&
          intent.target.toLowerCase() === ptTokenAddress.toLowerCase(),
      ),
    ).toBe(true);
  });

  it('builds full lifecycle delegation intents from a static template without representative planner calls', async () => {
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
      createTokenizedYieldBuyPt: vi.fn().mockRejectedValue(new Error('planner should not be called')),
      createTokenizedYieldSellPt: vi.fn().mockResolvedValue({
        exactAmountOut: '1',
        tokenOut: usdaiToken,
        transactions: [
          {
            type: 'EVM_TX',
            to: PENDLE_ROUTER_TARGET,
            data: '0x58181a80',
            value: '0',
            chainId: '42161',
          },
        ],
      }),
      createTokenizedYieldRedeemPt: vi.fn().mockResolvedValue({
        exactUnderlyingAmount: '1',
        underlyingTokenIdentifier: usdaiToken.tokenUid,
        transactions: [
          {
            type: 'EVM_TX',
            to: PENDLE_ROUTER_TARGET,
            data: '0x58181a80',
            value: '0',
            chainId: '42161',
          },
        ],
      }),
      createTokenizedYieldClaimRewards: vi.fn().mockResolvedValue({
        transactions: [
          {
            type: 'EVM_TX',
            to: PENDLE_ROUTER_TARGET,
            data: '0x58181a80',
            value: '0',
            chainId: '42161',
          },
        ],
      }),
    };

    copilotkitEmitStateMock.mockResolvedValue(undefined);
    getAgentWalletAddressMock.mockReturnValue('0x0000000000000000000000000000000000000002');
    getOnchainActionsClientMock.mockReturnValue(onchainActionsClient);

    interruptMock.mockImplementation((request: unknown) => {
      if (!request || typeof request !== 'object' || !('delegationsToSign' in request)) {
        throw new Error('Unexpected interrupt payload');
      }
      const delegationsToSign = (request as { delegationsToSign: Array<Record<string, unknown>> }).delegationsToSign;
      const first = delegationsToSign[0];
      if (!first || typeof first !== 'object') {
        throw new Error('No delegation requested');
      }
      return Promise.resolve(
        JSON.stringify({
          outcome: 'signed',
          signedDelegations: [{ ...first, signature: '0x01' }],
        }),
      );
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
    expect('view' in result).toBe(true);
    const view = (result as { view: { delegationBundle?: unknown } }).view;
    const bundle = view.delegationBundle as {
      intents: Array<{ selector: string; target: string }>;
    };

    const requiredSelectors = [
      PENDLE_BUY_PT_SELECTOR,
      PENDLE_SELL_PT_SELECTOR,
      PENDLE_REDEEM_PT_SELECTOR,
      PENDLE_EXIT_POST_EXP_TO_TOKEN_SELECTOR,
      PENDLE_CLAIM_REWARDS_SELECTOR,
    ];
    for (const selector of requiredSelectors) {
      expect(
        bundle.intents.some(
          (intent) =>
            intent.target.toLowerCase() === PENDLE_ROUTER_TARGET &&
            intent.selector.toLowerCase() === selector,
        ),
      ).toBe(true);
    }

    expect(onchainActionsClient.createTokenizedYieldBuyPt).not.toHaveBeenCalled();
    expect(onchainActionsClient.createTokenizedYieldSellPt).not.toHaveBeenCalled();
    expect(onchainActionsClient.createTokenizedYieldRedeemPt).not.toHaveBeenCalled();
    expect(onchainActionsClient.createTokenizedYieldClaimRewards).not.toHaveBeenCalled();
  });
});
