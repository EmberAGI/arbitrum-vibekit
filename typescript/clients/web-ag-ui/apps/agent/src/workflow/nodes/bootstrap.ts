import { copilotkitEmitState } from '@copilotkit/sdk-js/langgraph';
import type { Command } from '@langchain/langgraph';

import { resolvePollIntervalMs, resolveStreamLimit } from '../../config/constants.js';
import { logInfo, type ClmmEvent, type ClmmState, type ClmmUpdate } from '../context.js';

type CopilotKitConfig = Parameters<typeof copilotkitEmitState>[0];
type Configurable = { configurable?: { thread_id?: string } };

export const bootstrapNode = async (
  state: ClmmState,
  config: CopilotKitConfig,
): Promise<ClmmUpdate | Command<string, ClmmUpdate>> => {
  const threadId = (config as Configurable).configurable?.thread_id;

  if (state.private.bootstrapped) {
    logInfo('Skipping bootstrap; state already initialized for thread', { threadId });
    // Return a no-op update so the graph's post-bootstrap conditional routing
    // decides the next node from current state.
    return {};
  }

  const mode = process.env['CLMM_MODE'] === 'production' ? 'production' : 'debug';
  const pollIntervalMs = resolvePollIntervalMs();
  const streamLimit = resolveStreamLimit();
  const delegationsBypassActive = process.env['DELEGATIONS_BYPASS'] === 'true';

  logInfo('Initialized mock CLMM workflow context', {
    mode,
    pollIntervalMs,
    streamLimit,
    delegationsBypassActive,
  });

  const dispatch: ClmmEvent = {
    type: 'dispatch-response',
    parts: [
      {
        kind: 'data',
        data: {
          name: 'Mock Camelot CLMM',
          subtitle: 'Arbitrum One',
          description: 'Deterministic mock workflow for onboarding and cron testing.',
        },
      },
    ],
  };

  await copilotkitEmitState(config, {
    view: { activity: { events: [dispatch], telemetry: [] } },
  });

  return {
    private: {
      bootstrapped: true,
      mode,
      pollIntervalMs,
      streamLimit,
    },
    view: {
      activity: { events: [dispatch], telemetry: [] },
      profile: {
        agentIncome: 3250,
        aum: 25000,
        totalUsers: 42,
        apy: 120.5,
        chains: ['Arbitrum One'],
        protocols: ['Camelot'],
        tokens: ['WETH', 'USDC', 'USDT', 'ARB'],
        pools: [],
        allowedPools: [],
      },
      metrics: {
        lastSnapshot: undefined,
        previousPrice: undefined,
        cyclesSinceRebalance: 0,
        staleCycles: 0,
        iteration: 0,
        latestCycle: undefined,
      },
      transactionHistory: [],
      command: undefined,
      task: undefined,
      poolArtifact: undefined,
      operatorInput: undefined,
      selectedPool: undefined,
      operatorConfig: undefined,
      haltReason: undefined,
      executionError: undefined,
      fundingTokenInput: undefined,
      delegationBundle: undefined,
      delegationsBypassActive,
    },
  };
};
