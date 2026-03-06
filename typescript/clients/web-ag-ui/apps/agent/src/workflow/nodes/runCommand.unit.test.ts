import { describe, expect, it } from 'vitest';

import type { ClmmState } from '../context.js';

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
    thread: {
      lastAppliedClientMutationId: undefined,
      poolArtifact: undefined,
      operatorInput: undefined,
      fundingTokenInput: undefined,
      delegationsBypassActive: false,
      delegationBundle: undefined,
      operatorConfig: undefined,
    },
  } as unknown as ClmmState;
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

describe('runCommandNode (starter agent)', () => {
  it('records sync mutation acknowledgements in thread state envelope', () => {
    const state = createState(JSON.stringify({ command: 'sync', clientMutationId: 'cmid-1' }));

    const result = runCommandNode(state) as unknown as {
      thread?: { lastAppliedClientMutationId?: string };
    };

    expect(result.thread?.lastAppliedClientMutationId).toBe('cmid-1');
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
    state.thread.fundingTokenInput = {
      fundingTokenAddress: '0xaf88d065e77c8cc2239327c5edb3a432268e5831',
    };
    state.thread.delegationsBypassActive = true;
    state.thread.operatorConfig = {
      walletAddress: '0x8aF45a2C60aBE9172D93aCddB40473DCc66AA9B9',
      baseContributionUsd: 10,
      autoCompoundFees: true,
      manualBandwidthBps: 125,
    };

    expect(resolveCommandTarget(state)).toBe('runCycleCommand');
  });

  it('routes cycle to bootstrap when thread is not bootstrapped', () => {
    const state = createState(JSON.stringify({ command: 'cycle' }));
    state.private.bootstrapped = false;

    expect(resolveCommandTarget(state)).toBe('bootstrap');
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
    state.thread.fundingTokenInput = {
      fundingTokenAddress: '0xaf88d065e77c8cc2239327c5edb3a432268e5831',
    };
    state.thread.delegationsBypassActive = true;
    state.thread.operatorConfig = {
      walletAddress: '0x8aF45a2C60aBE9172D93aCddB40473DCc66AA9B9',
      baseContributionUsd: 10,
      autoCompoundFees: true,
      manualBandwidthBps: 125,
    };

    const first = applyRunCommandUpdate(state);
    expect(resolveCommandTarget(first)).toBe('runCycleCommand');

    const second = applyRunCommandUpdate(first);
    expect(resolveCommandTarget(second)).toBe('__end__');
  });
});
