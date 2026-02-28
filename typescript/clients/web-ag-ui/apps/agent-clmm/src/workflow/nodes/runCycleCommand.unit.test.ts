import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ClmmState } from '../context.js';

import { runCycleCommandNode } from './runCycleCommand.js';

const { copilotkitEmitStateMock } = vi.hoisted(() => ({
  copilotkitEmitStateMock: vi.fn(),
}));

vi.mock('@copilotkit/sdk-js/langgraph', () => ({
  copilotkitEmitState: copilotkitEmitStateMock,
}));

describe('runCycleCommandNode', () => {
  afterEach(() => {
    copilotkitEmitStateMock.mockReset();
  });

  it('reroutes scheduled cycles to delegation onboarding when prerequisites are missing', async () => {
    const state = {
      thread: {
        poolArtifact: { id: 'camelot-pools', generatedAt: '2026-01-01T00:00:00Z', kind: 'pool-list', payload: {} },
        operatorInput: {
          poolAddress: '0xb1026b8e7276e7ac75410f1fcbbe21796e8f7526',
          walletAddress: '0x8aF45a2C60aBE9172D93aCddB40473DCc66AA9B9',
          baseContributionUsd: 10,
        },
        selectedPool: {
          address: '0xb1026b8e7276e7ac75410f1fcbbe21796e8f7526',
          token0: { symbol: 'USDC', address: '0xaf88d065e77c8cc2239327c5edb3a432268e5831', decimals: 6 },
          token1: { symbol: 'WETH', address: '0x82af49447d8a07e3bd95bd0d56f35241523fbab1', decimals: 18 },
          tickSpacing: 10,
        },
        fundingTokenInput: { fundingTokenAddress: '0xaf88d065e77c8cc2239327c5edb3a432268e5831' },
        delegationBundle: undefined,
        delegationsBypassActive: false,
        operatorConfig: undefined,
        task: { id: 'task-1', taskStatus: { state: 'working' } },
      },
    } as unknown as ClmmState;

    const result = await runCycleCommandNode(state, {});
    const commandResult = result as unknown as {
      goto?: string[];
    };

    expect(commandResult.goto).toContain('collectDelegations');
    expect(copilotkitEmitStateMock).not.toHaveBeenCalled();
  });

  it('continues into cycle execution when onboarding prerequisites are already satisfied', async () => {
    copilotkitEmitStateMock.mockResolvedValue(undefined);
    const state = {
      thread: {
        poolArtifact: { id: 'camelot-pools', generatedAt: '2026-01-01T00:00:00Z', kind: 'pool-list', payload: {} },
        operatorInput: {
          poolAddress: '0xb1026b8e7276e7ac75410f1fcbbe21796e8f7526',
          walletAddress: '0x8aF45a2C60aBE9172D93aCddB40473DCc66AA9B9',
          baseContributionUsd: 10,
        },
        selectedPool: {
          address: '0xb1026b8e7276e7ac75410f1fcbbe21796e8f7526',
          token0: { symbol: 'USDC', address: '0xaf88d065e77c8cc2239327c5edb3a432268e5831', decimals: 6 },
          token1: { symbol: 'WETH', address: '0x82af49447d8a07e3bd95bd0d56f35241523fbab1', decimals: 18 },
          tickSpacing: 10,
        },
        fundingTokenInput: { fundingTokenAddress: '0xaf88d065e77c8cc2239327c5edb3a432268e5831' },
        delegationsBypassActive: false,
        delegationBundle: {
          chainId: 42161,
          delegationManager: '0xdb9B1e94B5b69Df7e401DDbedE43491141047dB3',
          delegatorAddress: '0x8aF45a2C60aBE9172D93aCddB40473DCc66AA9B9',
          delegateeAddress: '0x3fd83e40F96C3c81A807575F959e55C34a40e523',
          delegations: [],
          intents: [],
          descriptions: [],
          warnings: [],
        },
        operatorConfig: {
          walletAddress: '0x8aF45a2C60aBE9172D93aCddB40473DCc66AA9B9',
          baseContributionUsd: 10,
          autoCompoundFees: true,
          manualBandwidthBps: 125,
        },
        activity: { events: [], telemetry: [] },
      },
      settings: {},
      private: {},
    } as unknown as ClmmState;

    const result = await runCycleCommandNode(state, {});
    const view = (result as {
      thread: { lifecycle?: { phase?: string }; task?: { taskStatus?: { state?: string } } };
    }).thread;

    expect(view.lifecycle?.phase).toBe('active');
    expect(view.task?.taskStatus?.state).toBe('working');
    expect(copilotkitEmitStateMock).toHaveBeenCalledTimes(1);
  });

  it('continues into cycle execution when operator setup is complete without a funding token selection', async () => {
    copilotkitEmitStateMock.mockResolvedValue(undefined);
    const state = {
      thread: {
        poolArtifact: { id: 'camelot-pools', generatedAt: '2026-01-01T00:00:00Z', kind: 'pool-list', payload: {} },
        operatorInput: {
          poolAddress: '0xb1026b8e7276e7ac75410f1fcbbe21796e8f7526',
          walletAddress: '0x8aF45a2C60aBE9172D93aCddB40473DCc66AA9B9',
          baseContributionUsd: 10,
        },
        selectedPool: {
          address: '0xb1026b8e7276e7ac75410f1fcbbe21796e8f7526',
          token0: { symbol: 'USDC', address: '0xaf88d065e77c8cc2239327c5edb3a432268e5831', decimals: 6 },
          token1: { symbol: 'WETH', address: '0x82af49447d8a07e3bd95bd0d56f35241523fbab1', decimals: 18 },
          tickSpacing: 10,
        },
        fundingTokenInput: undefined,
        delegationsBypassActive: false,
        delegationBundle: {
          chainId: 42161,
          delegationManager: '0xdb9B1e94B5b69Df7e401DDbedE43491141047dB3',
          delegatorAddress: '0x8aF45a2C60aBE9172D93aCddB40473DCc66AA9B9',
          delegateeAddress: '0x3fd83e40F96C3c81A807575F959e55C34a40e523',
          delegations: [],
          intents: [],
          descriptions: [],
          warnings: [],
        },
        operatorConfig: {
          walletAddress: '0x8aF45a2C60aBE9172D93aCddB40473DCc66AA9B9',
          baseContributionUsd: 10,
          autoCompoundFees: true,
          manualBandwidthBps: 125,
        },
        activity: { events: [], telemetry: [] },
      },
      settings: {},
      private: {},
    } as unknown as ClmmState;

    const result = await runCycleCommandNode(state, {});
    const view = (result as {
      thread: { lifecycle?: { phase?: string }; task?: { taskStatus?: { state?: string } } };
    }).thread;

    expect(view.lifecycle?.phase).toBe('active');
    expect(view.task?.taskStatus?.state).toBe('working');
    expect(copilotkitEmitStateMock).toHaveBeenCalledTimes(1);
  });
});
