import { describe, expect, it } from 'vitest';

import { createDefaultClmmThreadState, type ClmmState } from '../context.js';

import { resolveCommandTarget, runCommandNode } from './runCommand.js';

function createState(messageContent: string): ClmmState {
  return {
    messages: [{ role: 'user', content: messageContent }],
    copilotkit: { actions: [], context: [] },
    settings: {},
    private: {
      mode: undefined,
      pollIntervalMs: 30_000,
      streamLimit: -1,
      cronScheduled: false,
      bootstrapped: true,
    },
    thread: createDefaultClmmThreadState(),
  };
}

function applyRunCommandUpdate(state: ClmmState): ClmmState {
  const update = runCommandNode(state);
  return {
    ...state,
    private: {
      ...state.private,
      ...(update.private ?? {}),
    },
    thread: {
      ...state.thread,
      ...(update.thread ?? {}),
    },
  };
}

describe('runCommandNode', () => {
  it('records sync mutation acknowledgements in thread state envelope', () => {
    const state = createState(JSON.stringify({ command: 'sync', clientMutationId: 'cmid-1' }));

    const result = runCommandNode(state) as unknown as {
      thread?: { lastAppliedClientMutationId?: string };
      view?: { lastAppliedClientMutationId?: string };
    };

    expect(result.thread?.lastAppliedClientMutationId).toBe('cmid-1');
    expect(result.view).toBeUndefined();
  });

  it('returns a minimal thread patch so stale snapshots cannot overwrite onboarding state', () => {
    const state = createState(JSON.stringify({ command: 'cycle' }));
    state.thread.task = {
      id: 'task-1',
      taskStatus: {
        state: 'input-required',
      },
    } as ClmmState['thread']['task'];
    state.thread.onboarding = {
      step: 3,
      key: 'delegation-signing',
    };

    const update = runCommandNode(state);

    expect(update.thread).toEqual({
      lastAppliedClientMutationId: state.thread.lastAppliedClientMutationId,
    });
  });

  it('suppresses cycle commands while onboarding is incomplete', () => {
    const state = createState(JSON.stringify({ command: 'cycle' }));

    expect(resolveCommandTarget(state)).toBe('syncState');
  });

  it('routes cycle commands once onboarding is complete', () => {
    const state = createState(JSON.stringify({ command: 'cycle' }));
    state.thread.poolArtifact = {
      artifactId: 'camelot-pools',
      parts: [],
    } as unknown as ClmmState['thread']['poolArtifact'];
    state.thread.operatorInput = {
      poolAddress: '0xb1026b8e7276e7ac75410f1fcbbe21796e8f7526',
      walletAddress: '0x8aF45a2C60aBE9172D93aCddB40473DCc66AA9B9',
      baseContributionUsd: 10,
    };
    state.thread.operatorConfig = {
      walletAddress: '0x8aF45a2C60aBE9172D93aCddB40473DCc66AA9B9',
      baseContributionUsd: 10,
      autoCompoundFees: true,
      manualBandwidthBps: 125,
    };
    state.thread.delegationBundle = {
      chainId: 42161,
      delegationManager: '0xdb9B1e94B5b69Df7e401DDbedE43491141047dB3',
      delegatorAddress: '0x8aF45a2C60aBE9172D93aCddB40473DCc66AA9B9',
      delegateeAddress: '0x3fd83e40F96C3c81A807575F959e55C34a40e523',
      delegations: [],
      intents: [],
      descriptions: [],
      warnings: [],
    };
    state.thread.selectedPool = {
      address: '0xb1026b8e7276e7ac75410f1fcbbe21796e8f7526',
      token0: {
        address: '0x82af49447d8a07e3bd95bd0d56f35241523fbab1',
        symbol: 'WETH',
        decimals: 18,
      },
      token1: {
        address: '0xaf88d065e77c8cc2239327c5edb3a432268e5831',
        symbol: 'USDC',
        decimals: 6,
      },
      tickSpacing: 10,
    };

    expect(resolveCommandTarget(state)).toBe('runCycleCommand');
  });

  it('suppresses replayed non-sync command envelopes with the same clientMutationId', () => {
    const state = createState(JSON.stringify({ command: 'cycle', clientMutationId: 'cycle-1' }));
    state.thread.poolArtifact = {
      artifactId: 'camelot-pools',
      parts: [],
    } as unknown as ClmmState['thread']['poolArtifact'];
    state.thread.operatorInput = {
      poolAddress: '0xb1026b8e7276e7ac75410f1fcbbe21796e8f7526',
      walletAddress: '0x8aF45a2C60aBE9172D93aCddB40473DCc66AA9B9',
      baseContributionUsd: 10,
    };
    state.thread.operatorConfig = {
      walletAddress: '0x8aF45a2C60aBE9172D93aCddB40473DCc66AA9B9',
      baseContributionUsd: 10,
      autoCompoundFees: true,
      manualBandwidthBps: 125,
    };
    state.thread.delegationBundle = {
      chainId: 42161,
      delegationManager: '0xdb9B1e94B5b69Df7e401DDbedE43491141047dB3',
      delegatorAddress: '0x8aF45a2C60aBE9172D93aCddB40473DCc66AA9B9',
      delegateeAddress: '0x3fd83e40F96C3c81A807575F959e55C34a40e523',
      delegations: [],
      intents: [],
      descriptions: [],
      warnings: [],
    };
    state.thread.selectedPool = {
      address: '0xb1026b8e7276e7ac75410f1fcbbe21796e8f7526',
      token0: {
        address: '0x82af49447d8a07e3bd95bd0d56f35241523fbab1',
        symbol: 'WETH',
        decimals: 18,
      },
      token1: {
        address: '0xaf88d065e77c8cc2239327c5edb3a432268e5831',
        symbol: 'USDC',
        decimals: 6,
      },
      tickSpacing: 10,
    };

    const first = applyRunCommandUpdate(state);
    expect(resolveCommandTarget(first)).toBe('runCycleCommand');

    const second = applyRunCommandUpdate(first);
    expect(resolveCommandTarget(second)).toBe('__end__');
  });
});
