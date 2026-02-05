import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ClmmState } from '../src/workflow/context.js';
import { collectDelegationsNode } from '../src/workflow/nodes/collectDelegations.js';
import { collectFundingTokenInputNode } from '../src/workflow/nodes/collectFundingTokenInput.js';
import { collectSetupInputNode } from '../src/workflow/nodes/collectSetupInput.js';
import { prepareOperatorNode } from '../src/workflow/nodes/prepareOperator.js';
import { FUNDING_TOKENS } from '../src/workflow/seedData.js';

const { copilotkitEmitStateMock, interruptMock } = vi.hoisted(() => ({
  copilotkitEmitStateMock: vi.fn(async () => undefined),
  interruptMock: vi.fn<[], Promise<unknown>>(),
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
});

describe('GMX Allora onboarding (integration)', () => {
  it('collects USDC allocation and prepares operator config', async () => {
    const state = buildBaseState();

    interruptMock.mockResolvedValueOnce({
      walletAddress: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      usdcAllocation: 250,
      targetMarket: 'BTC',
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
      FUNDING_TOKENS.find((token) => token.symbol === 'USDC')?.address,
    );
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
