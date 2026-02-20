import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  AgentInterrupt,
  AgentMetrics,
  AgentProfile,
  AgentViewMetrics,
  ClmmEvent,
  OnboardingFlow,
  OnboardingState,
  Pool,
  Transaction,
  UnsignedDelegation,
} from '../types/agent';
import { __agentDetailPageTestOnly } from './AgentDetailPage';

const usePrivyWalletClientMock = vi.fn();

vi.mock('../hooks/usePrivyWalletClient', () => {
  return {
    usePrivyWalletClient: () => usePrivyWalletClientMock(),
  };
});

const BASE_PROFILE: AgentProfile = {
  chains: ['Arbitrum'],
  protocols: ['Camelot'],
  tokens: ['USDC', 'WETH', 'WBTC'],
  agentIncome: 754,
  aum: 742_510,
  totalUsers: 5_321,
  apy: 22,
};

const BASE_METRICS: AgentMetrics = {
  iteration: 7,
  cyclesSinceRebalance: 2,
  staleCycles: 1,
  rebalanceCycles: 5,
  apy: 22,
  aumUsd: 742_510,
  lifetimePnlUsd: 1245.12,
};

const HASH_A = `0x${'a'.repeat(64)}` as `0x${string}`;
const HASH_B = `0x${'b'.repeat(64)}` as `0x${string}`;

function defaultWalletHookValue() {
  return {
    walletClient: {
      account: `0x${'1'.repeat(40)}`,
    },
    privyWallet: {
      address: `0x${'2'.repeat(40)}`,
    },
    chainId: 42161,
    switchChain: async () => {},
    isLoading: false,
    error: null,
  };
}

beforeEach(() => {
  usePrivyWalletClientMock.mockReset();
  usePrivyWalletClientMock.mockReturnValue(defaultWalletHookValue());
});

describe('AgentDetailPage internals: metrics variants', () => {
  it('renders the CLMM metrics layout with latest cycle and activity stream', () => {
    const fullMetrics: AgentViewMetrics = {
      iteration: 7,
      cyclesSinceRebalance: 2,
      staleCycles: 1,
      rebalanceCycles: 5,
      previousPrice: 1700.123456,
      latestCycle: {
        cycle: 7,
        action: 'rebalance',
        timestamp: '2026-02-15T12:00:00.000Z',
        reason: 'spread threshold crossed',
        midPrice: 1703.55,
      },
      latestSnapshot: {
        poolAddress: `0x${'3'.repeat(40)}`,
        totalUsd: 845.2,
        feesUsd: 12.1,
        timestamp: '2026-02-15T12:00:00.000Z',
        positionOpenedAt: '2026-02-14T12:00:00.000Z',
        positionTokens: [
          {
            address: `0x${'4'.repeat(40)}`,
            symbol: 'USDC',
            decimals: 6,
            amount: 845.2,
          },
        ],
      },
      lastSnapshot: {
        address: `0x${'5'.repeat(40)}`,
        token0: { symbol: 'USDC' },
        token1: { symbol: 'WETH' },
      },
    };

    const events: ClmmEvent[] = [
      {
        type: 'status',
        message: 'cycle completed',
        task: { id: 'task-1', taskStatus: { state: 'completed' } },
      },
      {
        type: 'artifact',
        artifact: {
          type: 'rebalance-report',
        },
      },
      {
        type: 'dispatch-response',
        parts: [{ kind: 'data', data: { ok: true } }],
      },
    ];

    const html = renderToStaticMarkup(
      React.createElement(__agentDetailPageTestOnly.MetricsTab, {
        agentId: 'agent-clmm',
        profile: BASE_PROFILE,
        metrics: BASE_METRICS,
        fullMetrics,
        events,
        transactions: [],
        hasLoadedView: true,
      }),
    );

    expect(html).toContain('Your Performance');
    expect(html).toContain('Your Position');
    expect(html).toContain('Token Amounts');
    expect(html).toContain('Latest Cycle');
    expect(html).toContain('spread threshold crossed');
    expect(html).toContain('Activity Stream');
    expect(html).toContain('Artifact: rebalance-report');
    expect(html).toContain('Response with 1 parts');
  });

  it('renders GMX Allora metrics with execution status and arbiscan links', () => {
    const events: ClmmEvent[] = [
      {
        type: 'artifact',
        artifact: {
          artifactId: 'gmx-allora-execution-result',
          parts: [
            {
              kind: 'data',
              data: {
                ok: false,
                error: 'oracle lag',
                txHashes: [HASH_A, 'not-a-hash'],
                lastTxHash: HASH_B,
              },
            },
          ],
        },
      },
    ];

    const html = renderToStaticMarkup(
      React.createElement(__agentDetailPageTestOnly.MetricsTab, {
        agentId: 'agent-gmx-allora',
        profile: BASE_PROFILE,
        metrics: {
          ...BASE_METRICS,
          lifetimePnlUsd: -25,
        },
        fullMetrics: {
          iteration: 7,
          cyclesSinceRebalance: 2,
          staleCycles: 1,
          latestCycle: {
            cycle: 7,
            action: 'open',
            marketSymbol: 'BTC/USDC',
            side: 'long',
            sizeUsd: 100,
            leverage: 2,
            timestamp: '2026-02-15T12:00:00.000Z',
            prediction: {
              topic: 'allora:btc:8h',
              horizonHours: 8,
              confidence: 0.91,
              direction: 'up',
              predictedPrice: 71000,
              timestamp: '2026-02-15T11:59:00.000Z',
            },
            metrics: {
              decisionThreshold: 0.62,
            },
          },
          latestSnapshot: {
            poolAddress: `0x${'6'.repeat(40)}`,
            totalUsd: 100,
            leverage: 2,
            positionTokens: [],
          },
        },
        events,
        transactions: [
          {
            cycle: 7,
            action: 'open',
            txHash: HASH_A,
            status: 'failed',
            timestamp: '2026-02-15T12:00:00.000Z',
          },
        ],
        hasLoadedView: true,
      }),
    );

    expect(html).toContain('Latest Execution');
    expect(html).toContain('oracle lag');
    expect(html).toContain('failed');
    expect(html).toContain('Transaction Hashes');
    expect(html).toContain(`https://arbiscan.io/tx/${HASH_A}`);
    expect(html).toContain(`https://arbiscan.io/tx/${HASH_B}`);
    expect(html).toContain('Signal Confidence');
    expect(html).toContain('Decision Threshold');
  });

  it('renders GMX funding-blocked execution as pending without a failure banner', () => {
    const events: ClmmEvent[] = [
      {
        type: 'artifact',
        artifact: {
          artifactId: 'gmx-allora-execution-result',
          parts: [
            {
              kind: 'data',
              data: {
                ok: false,
                status: 'blocked',
                txHashes: [HASH_A],
                lastTxHash: HASH_A,
              },
            },
          ],
        },
      },
    ];

    const html = renderToStaticMarkup(
      React.createElement(__agentDetailPageTestOnly.MetricsTab, {
        agentId: 'agent-gmx-allora',
        profile: BASE_PROFILE,
        metrics: {
          ...BASE_METRICS,
          lifetimePnlUsd: -25,
        },
        fullMetrics: {
          iteration: 7,
          cyclesSinceRebalance: 2,
          staleCycles: 1,
          latestCycle: {
            cycle: 7,
            action: 'open',
            marketSymbol: 'BTC/USDC',
            side: 'long',
            sizeUsd: 100,
            leverage: 2,
            timestamp: '2026-02-15T12:00:00.000Z',
            prediction: {
              topic: 'allora:btc:8h',
              horizonHours: 8,
              confidence: 0.91,
              direction: 'up',
              predictedPrice: 71000,
              timestamp: '2026-02-15T11:59:00.000Z',
            },
            metrics: {
              decisionThreshold: 0.62,
            },
          },
          latestSnapshot: {
            poolAddress: `0x${'6'.repeat(40)}`,
            totalUsd: 100,
            leverage: 2,
            positionTokens: [],
          },
        },
        events,
        transactions: [],
        hasLoadedView: true,
      }),
    );

    expect(html).toContain('Latest Execution');
    expect(html).toContain('pending');
    expect(html).not.toContain('failed');
  });

  it('renders Pendle metrics with APY details and claimable rewards', () => {
    const html = renderToStaticMarkup(
      React.createElement(__agentDetailPageTestOnly.MetricsTab, {
        agentId: 'agent-pendle',
        profile: BASE_PROFILE,
        metrics: BASE_METRICS,
        fullMetrics: {
          iteration: 9,
          cyclesSinceRebalance: 1,
          staleCycles: 0,
          pendle: {
            marketAddress: `0x${'7'.repeat(40)}`,
            ytSymbol: 'YT-sUSDe',
            underlyingSymbol: 'USDe',
            maturity: '2026-12-26',
            baseContributionUsd: 500,
            fundingTokenAddress: `0x${'8'.repeat(40)}`,
            currentApy: 18.22,
            bestApy: 19.01,
            apyDelta: 0.79,
            position: {
              marketAddress: `0x${'7'.repeat(40)}`,
              ptSymbol: 'PT-sUSDe',
              ptAmount: '2.1234',
              ytSymbol: 'YT-sUSDe',
              ytAmount: '1.1111',
              claimableRewards: [{ symbol: 'PENDLE', amount: '4.5' }],
            },
          },
          latestCycle: {
            cycle: 9,
            action: 'rotate',
            apy: 18.22,
            timestamp: '2026-02-15T12:00:00.000Z',
            reason: 'yield improved',
          },
          latestSnapshot: {
            poolAddress: `0x${'9'.repeat(40)}`,
            totalUsd: 530.2,
            positionTokens: [
              {
                address: `0x${'a'.repeat(40)}`,
                symbol: 'PT-sUSDe',
                decimals: 18,
                amountBaseUnits: '2123400000000000000',
              },
              {
                address: `0x${'b'.repeat(40)}`,
                symbol: 'YT-sUSDe',
                decimals: 18,
                amountBaseUnits: '1111100000000000000',
              },
            ],
            pendle: {
              marketAddress: `0x${'7'.repeat(40)}`,
              ptSymbol: 'PT-sUSDe',
              ytSymbol: 'YT-sUSDe',
              underlyingSymbol: 'USDe',
              maturity: '2026-12-26',
              impliedApyPct: 19.4,
              underlyingApyPct: 8.1,
              pendleApyPct: 6.3,
              aggregatedApyPct: 19.4,
              swapFeeApyPct: 1.2,
              ytFloatingApyPct: 3.8,
              maxBoostedApyPct: 21.2,
              netPnlUsd: 27.65,
              netPnlPct: 5.22,
            },
          },
        },
        events: [],
        transactions: [],
        hasLoadedView: true,
      }),
    );

    expect(html).toContain('Strategy');
    expect(html).toContain('APY Details');
    expect(html).toContain('Position');
    expect(html).toContain('Claimable Rewards');
    expect(html).toContain('PENDLE');
    expect(html).toContain('Latest Cycle');
    expect(html).toContain('yield improved');
  });
});

describe('AgentDetailPage internals: transaction and sidebar primitives', () => {
  it('renders an empty-state transaction history table', () => {
    const html = renderToStaticMarkup(
      React.createElement(__agentDetailPageTestOnly.TransactionHistoryTab, {
        transactions: [],
        iconsLoaded: false,
        chainIconUri: null,
        protocolIconUri: null,
        protocolLabel: null,
      }),
    );

    expect(html).toContain('No transactions yet');
    expect(html).toContain('Transactions will appear here once the agent starts operating.');
  });

  it('renders transaction rows for success, failed, and pending statuses', () => {
    const pendingTx = {
      cycle: 3,
      action: 'hold',
      reason: 'cooldown',
      timestamp: 'invalid-date',
    } as unknown as Transaction;

    const html = renderToStaticMarkup(
      React.createElement(__agentDetailPageTestOnly.TransactionHistoryTab, {
        transactions: [
          {
            cycle: 1,
            action: 'buy',
            txHash: HASH_A,
            status: 'success',
            timestamp: '2026-02-15T12:00:00.000Z',
          },
          {
            cycle: 2,
            action: 'sell',
            txHash: HASH_B,
            status: 'failed',
            timestamp: '2026-02-15T12:10:00.000Z',
          },
          pendingTx,
        ],
        iconsLoaded: true,
        chainIconUri: 'https://example.com/arbitrum.png',
        protocolIconUri: 'https://example.com/camelot.png',
        protocolLabel: 'Camelot',
      }),
    );

    expect(html).toContain('Showing the latest 3 of 3');
    expect(html).toContain('success');
    expect(html).toContain('failed');
    expect(html).toContain('pending');
    expect(html).toContain('Cycle 3 · hold');
    expect(html).toContain('cooldown');
    expect(html).toContain('Camelot');
  });

  it('renders overflow indicator for tag columns and point rows with metrics', () => {
    const tagsHtml = renderToStaticMarkup(
      React.createElement(__agentDetailPageTestOnly.TagColumn, {
        title: 'Tokens',
        items: ['USDC', 'WETH', 'WBTC', 'ARB', 'USDT'],
        iconsLoaded: true,
        getIconUri: () => null,
      }),
    );

    const pointsHtml = renderToStaticMarkup(
      React.createElement(__agentDetailPageTestOnly.PointsColumn, {
        metrics: BASE_METRICS,
      }),
    );

    expect(tagsHtml).toContain('2 more');
    expect(pointsHtml).toContain('7x');
    expect(pointsHtml).toContain('2x');
    expect(pointsHtml).toContain('5x');
  });
});

describe('AgentDetailPage internals: blockers variants', () => {
  const basePools: Pool[] = [
    {
      address: `0x${'c'.repeat(40)}`,
      token0: { symbol: 'USDC' },
      token1: { symbol: 'WETH' },
    },
    {
      address: `0x${'c'.repeat(40)}`,
      token0: { symbol: 'USDC' },
      token1: { symbol: 'WETH' },
    },
  ];

  const signedDelegationInput: UnsignedDelegation = {
    delegate: `0x${'d'.repeat(40)}`,
    delegator: `0x${'e'.repeat(40)}`,
    authority: `0x${'f'.repeat(40)}`,
    caveats: [],
    salt: `0x${'1'.repeat(64)}`,
  };

  function renderBlockers(
    activeInterrupt: AgentInterrupt | null,
    options?: { agentId?: string; onboarding?: OnboardingState; onboardingFlow?: OnboardingFlow },
  ) {
    return renderToStaticMarkup(
      React.createElement(__agentDetailPageTestOnly.AgentBlockersTab, {
        agentId: options?.agentId ?? 'agent-clmm',
        activeInterrupt,
        allowedPools: basePools,
        onInterruptSubmit: () => {},
        taskId: 'task-1234567890',
        taskStatus: 'working',
        haltReason: undefined,
        executionError: undefined,
        delegationsBypassActive: false,
        onboarding: options?.onboarding ?? { step: 2 },
        onboardingFlow: options?.onboardingFlow,
        telemetry: [
          { cycle: 1, action: 'cycle', timestamp: '2026-02-15T12:00:00.000Z' },
          { cycle: 2, action: 'rebalance', timestamp: '2026-02-15T12:30:00.000Z' },
        ],
        settings: { amount: 200 },
        onSettingsChange: () => {},
      }),
    );
  }

  it('renders funding-token step with sorted options and wallet telemetry', () => {
    const fundingInterrupt: AgentInterrupt = {
      type: 'clmm-funding-token-request',
      message: 'select funding token',
      options: [
        {
          address: `0x${'1'.repeat(40)}`,
          symbol: 'WETH',
          decimals: 18,
          balance: '1000000000000000000',
        },
        {
          address: `0x${'2'.repeat(40)}`,
          symbol: 'USDC',
          decimals: 6,
          balance: '500000000',
          valueUsd: 500,
        },
      ],
    };

    const html = renderBlockers(fundingInterrupt);

    expect(html).toContain('Select Funding Token');
    expect(html).toContain('USDC');
    expect(html).toContain('WETH');
    expect(html).toContain('Current Task');
    expect(html).toContain('Latest Activity');
    expect(html.indexOf('USDC')).toBeLessThan(html.indexOf('WETH'));
  });

  it('renders GMX fund-wallet blocker guidance', () => {
    const html = renderBlockers({
      type: 'gmx-fund-wallet-request',
      message: 'GMX order simulation failed. Fund wallet and continue.',
      walletAddress: `0x${'6'.repeat(40)}`,
      requiredCollateralSymbol: 'USDC',
    });

    expect(html).toContain('Fund Wallet');
    expect(html).toContain('Add enough USDC on Arbitrum for GMX collateral.');
    expect(html).toContain('Add a small amount of Arbitrum ETH for execution gas fees.');
    expect(html).toContain(`0x${'6'.repeat(40)}`);
    expect(html).toContain('Continue');
  });

  it('renders dynamic GMX 4-step onboarding model for fund-wallet blocker', () => {
    const html = renderBlockers(
      {
        type: 'gmx-fund-wallet-request',
        message: 'GMX order simulation failed. Fund wallet and continue.',
      },
      {
        agentId: 'agent-gmx-allora',
        onboardingFlow: {
          status: 'in_progress',
          revision: 3,
          activeStepId: 'fund-wallet',
          steps: [
            { id: 'gmx-setup', title: 'Strategy Config', status: 'completed' },
            { id: 'funding-token', title: 'Funding Token', status: 'completed' },
            { id: 'delegation-signing', title: 'Delegation Signing', status: 'completed' },
            { id: 'fund-wallet', title: 'Fund Wallet', status: 'active' },
          ],
        },
      },
    );

    expect(html).toContain('Strategy Config');
    expect(html).toContain('Funding Token');
    expect(html).toContain('Delegation Signing');
    expect(html).toContain('Fund Wallet');
  });

  it('renders delegation signing flow with warnings and switch chain action', () => {
    usePrivyWalletClientMock.mockReturnValue({
      ...defaultWalletHookValue(),
      chainId: 1,
      walletClient: {
        account: `0x${'2'.repeat(40)}`,
      },
    });

    const delegationInterrupt: AgentInterrupt = {
      type: 'clmm-delegation-signing-request',
      message: 'sign delegations',
      chainId: 42161,
      delegationManager: `0x${'3'.repeat(40)}`,
      delegatorAddress: `0x${'4'.repeat(40)}`,
      delegateeAddress: `0x${'5'.repeat(40)}`,
      delegationsToSign: [signedDelegationInput],
      descriptions: ['Authorize spend for CLMM strategy'],
      warnings: ['This can move funds.'],
    };

    const html = renderBlockers(delegationInterrupt);

    expect(html).toContain('Review &amp; Sign Delegations');
    expect(html).toContain('Warnings');
    expect(html).toContain('Authorize spend for CLMM strategy');
    expect(html).toContain('Switch Chain');
    expect(html).toContain('Sign &amp; Continue');
  });

  it('renders the waiting state when no active interrupt is present', () => {
    const html = renderToStaticMarkup(
      React.createElement(__agentDetailPageTestOnly.AgentBlockersTab, {
        agentId: 'agent-clmm',
        activeInterrupt: null,
        allowedPools: [],
        onInterruptSubmit: () => {},
        taskId: undefined,
        taskStatus: undefined,
        haltReason: undefined,
        executionError: undefined,
        delegationsBypassActive: false,
        onboarding: undefined,
        telemetry: [],
        settings: { amount: 100 },
        onSettingsChange: () => {},
      }),
    );

    expect(html).toContain('Waiting for agent');
    expect(html).toContain('No active task. The agent may need to be started.');
    expect(html).toContain('Set up agent');
  });
});
