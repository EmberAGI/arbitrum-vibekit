import { copilotkitEmitState } from '@copilotkit/sdk-js/langgraph';
import type { Command } from '@langchain/langgraph';

import {
  resolveDelegationsBypass,
  resolvePollIntervalMs,
  resolveStreamLimit,
} from '../../config/constants.js';
import { logInfo, type ClmmEvent, type ClmmState, type ClmmUpdate } from '../context.js';
import { STABLECOIN_WHITELIST } from '../seedData.js';

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

  const mode = process.env['PENDLE_MODE'] === 'production' ? 'production' : 'debug';
  const pollIntervalMs = resolvePollIntervalMs();
  const streamLimit = resolveStreamLimit();
  const delegationsBypassActive = resolveDelegationsBypass();

  logInfo('Initialized Pendle workflow context', {
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
          name: 'Pendle Yield',
          subtitle: 'Arbitrum One',
          description: 'Yield optimizer for Pendle stablecoin markets with automated rotations.',
        },
      },
    ],
  };

  await copilotkitEmitState(config, {
    thread: { activity: { events: [dispatch], telemetry: [] } },
  });

  return {
    private: {
      bootstrapped: true,
      mode,
      pollIntervalMs,
      streamLimit,
    },
    thread: {
      activity: { events: [dispatch], telemetry: [] },
      profile: {
        agentIncome: undefined,
        aum: undefined,
        totalUsers: undefined,
        apy: undefined,
        chains: ['Arbitrum One'],
        protocols: ['Pendle'],
        tokens: [...STABLECOIN_WHITELIST],
        pools: [],
        allowedPools: [],
      },
      metrics: {
        lastSnapshot: undefined,
        previousApy: undefined,
        cyclesSinceRebalance: 0,
        staleCycles: 0,
        iteration: 0,
        latestCycle: undefined,
        aumUsd: undefined,
        apy: undefined,
        lifetimePnlUsd: undefined,
        pendle: undefined,
      },
      transactionHistory: [],
      delegationsBypassActive,
    },
  };
};
