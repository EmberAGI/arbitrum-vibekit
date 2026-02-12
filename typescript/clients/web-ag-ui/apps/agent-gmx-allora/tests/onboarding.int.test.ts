import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { PerpetualMarket } from '../src/clients/onchainActions.js';
import type { ClmmState } from '../src/workflow/context.js';
import { collectDelegationsNode } from '../src/workflow/nodes/collectDelegations.js';
import { collectFundingTokenInputNode } from '../src/workflow/nodes/collectFundingTokenInput.js';
import { collectSetupInputNode } from '../src/workflow/nodes/collectSetupInput.js';
import { prepareOperatorNode } from '../src/workflow/nodes/prepareOperator.js';

const { copilotkitEmitStateMock, interruptMock, listPerpetualMarketsMock } = vi.hoisted(() => ({
  copilotkitEmitStateMock: vi.fn(async () => undefined),
  interruptMock: vi.fn<[], Promise<unknown>>(),
  listPerpetualMarketsMock: vi.fn<[], Promise<PerpetualMarket[]>>(),
}));

vi.mock('@copilotkit/sdk-js/langgraph', () => ({
  copilotkitEmitState: copilotkitEmitStateMock,
}));

vi.mock('@langchain/langgraph', async () => {
  const actual = await vi.importActual<typeof import('@langchain/langgraph')>('@langchain/langgraph');
  return {
    ...actual,
    interrupt: interruptMock,
  };
});

vi.mock('../src/workflow/clientFactory.js', () => ({
  getOnchainActionsClient: () => ({
    listPerpetualMarkets: listPerpetualMarketsMock,
  }),
  getOnchainClients: vi.fn(),
}));

function buildBaseState(): ClmmState {
  return {
    messages: [],
    copilotkit: { actions: [], context: [] },
    settings: { amount: undefined },
    private: {
      mode: undefined,
      pollIntervalMs: 5000,
      streamLimit: -1,
      cronScheduled: false,
      bootstrapped: false,
    },
    view: {
      command: undefined,
      task: undefined,
      poolArtifact: undefined,
      operatorInput: undefined,
      onboarding: undefined,
      fundingTokenInput: undefined,
      selectedPool: undefined,
      operatorConfig: undefined,
      delegationBundle: undefined,
      haltReason: undefined,
      executionError: undefined,
      delegationsBypassActive: true,
      profile: {
        agentIncome: undefined,
        aum: undefined,
        totalUsers: undefined,
        apy: undefined,
        chains: [],
        protocols: [],
        tokens: [],
        pools: [],
        allowedPools: [],
      },
      activity: { telemetry: [], events: [] },
      metrics: {
        lastSnapshot: undefined,
        previousPrice: undefined,
        cyclesSinceRebalance: 0,
        staleCycles: 0,
        iteration: 0,
        latestCycle: undefined,
      },
      transactionHistory: [],
    },
  };
}

function mergeState(state: ClmmState, update: Partial<ClmmState>): ClmmState {
  return {
    ...state,
    ...update,
    view: {
      ...state.view,
      ...update.view,
      activity: update.view?.activity ?? state.view.activity,
      metrics: update.view?.metrics ?? state.view.metrics,
      profile: update.view?.profile ?? state.view.profile,
      transactionHistory: update.view?.transactionHistory ?? state.view.transactionHistory,
    },
    private: {
      ...state.private,
      ...update.private,
    },
    settings: {
      ...state.settings,
      ...update.settings,
    },
    copilotkit: {
      ...state.copilotkit,
      ...update.copilotkit,
    },
  };
}

afterEach(() => {
  copilotkitEmitStateMock.mockReset();
  interruptMock.mockReset();
  listPerpetualMarketsMock.mockReset();
});

describe('GMX Allora onboarding (integration)', () => {
  beforeEach(() => {
    process.env.GMX_ALLORA_AGENT_WALLET_ADDRESS = '0x0000000000000000000000000000000000000002';
  });

  afterEach(() => {
    delete process.env.GMX_ALLORA_AGENT_WALLET_ADDRESS;
  });

  it('collects USDC allocation and prepares operator config', async () => {
    listPerpetualMarketsMock.mockResolvedValueOnce([
      {
        marketToken: { chainId: '42161', address: '0x70d95587d40a2caf56bd97485ab3eec10bee6336' },
        longFundingFee: '0',
        shortFundingFee: '0',
        longBorrowingFee: '0',
        shortBorrowingFee: '0',
        chainId: '42161',
        name: 'ETH/USD [WETH-USDC]',
        indexToken: {
          tokenUid: { chainId: '42161', address: '0x0000000000000000000000000000000000000000' },
          name: 'Ethereum',
          symbol: 'ETH',
          isNative: true,
          decimals: 18,
          iconUri: null,
          isVetted: true,
        },
        longToken: {
          tokenUid: { chainId: '42161', address: '0x82af49447d8a07e3bd95bd0d56f35241523fbab1' },
          name: 'Wrapped Ether',
          symbol: 'WETH',
          isNative: false,
          decimals: 18,
          iconUri: null,
          isVetted: true,
        },
        shortToken: {
          tokenUid: { chainId: '42161', address: '0xaf88d065e77c8cc2239327c5edb3a432268e5831' },
          name: 'USDC',
          symbol: 'USDC',
          isNative: false,
          decimals: 6,
          iconUri: null,
          isVetted: true,
        },
      },
    ]);

    const state = buildBaseState();

    interruptMock.mockResolvedValueOnce({
      walletAddress: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      usdcAllocation: 250,
      targetMarket: 'ETH',
    });

    const setupUpdate = await collectSetupInputNode(state, {});
    const stateAfterSetup = mergeState(state, setupUpdate);

    const fundingUpdate = await collectFundingTokenInputNode(stateAfterSetup, {});
    const stateAfterFunding = mergeState(stateAfterSetup, fundingUpdate);

    const delegationsUpdate = await collectDelegationsNode(stateAfterFunding, {});
    const stateAfterDelegations = mergeState(stateAfterFunding, delegationsUpdate);

    const prepared = await prepareOperatorNode(stateAfterDelegations, {});

    expect(prepared.view?.operatorConfig?.baseContributionUsd).toBe(250);
    expect(prepared.view?.operatorConfig?.fundingTokenAddress).toBe(
      '0xaf88d065e77c8cc2239327c5edb3a432268e5831',
    );
  });

  it('skips delegation signing interrupts when bypass is active', async () => {
    const state = buildBaseState();
    state.view.delegationsBypassActive = true;

    const update = await collectDelegationsNode(state, {});

    expect(interruptMock).not.toHaveBeenCalled();
    expect(update.view?.onboarding?.step).toBe(3);
  });

  it('omits testing warning in production-mode delegation requests', async () => {
    const state = buildBaseState();
    state.view.delegationsBypassActive = false;
    state.private.mode = 'production';
    state.view.operatorInput = {
      walletAddress: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      usdcAllocation: 10,
      targetMarket: 'ETH',
    };

    interruptMock.mockResolvedValueOnce({ outcome: 'rejected' });

    await collectDelegationsNode(state, {});

    expect(interruptMock).toHaveBeenCalledTimes(1);
    const request = interruptMock.mock.calls[0]?.[0] as { warnings?: string[] };
    expect(request.warnings).toEqual([]);
  });

  it('includes testing warning in debug-mode delegation requests', async () => {
    const state = buildBaseState();
    state.view.delegationsBypassActive = false;
    state.private.mode = 'debug';
    state.view.operatorInput = {
      walletAddress: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      usdcAllocation: 10,
      targetMarket: 'ETH',
    };

    interruptMock.mockResolvedValueOnce({ outcome: 'rejected' });

    await collectDelegationsNode(state, {});

    const request = interruptMock.mock.calls[0]?.[0] as { warnings?: string[] };
    expect(request.warnings).toEqual(['This delegation flow is for testing only.']);
  });

  it('rejects setup input without USDC allocation', async () => {
    const state = buildBaseState();

    interruptMock.mockResolvedValueOnce({
      walletAddress: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      targetMarket: 'BTC',
    });

    const setupUpdate = await collectSetupInputNode(state, {});

    expect(setupUpdate.view?.haltReason).toContain('Invalid setup input');
  });
});
