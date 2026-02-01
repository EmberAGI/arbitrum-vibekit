import { copilotkitEmitState } from '@copilotkit/sdk-js/langgraph';
import { Command } from '@langchain/langgraph';

import { resolvePollIntervalMs, resolveStreamLimit } from '../../config/constants.js';
import { logInfo, type ClmmEvent, type ClmmState, type ClmmUpdate } from '../context.js';
import { ALLOWED_TOKENS, MARKETS } from '../seedData.js';

type CopilotKitConfig = Parameters<typeof copilotkitEmitState>[0];
type Configurable = { configurable?: { thread_id?: string } };

export const bootstrapNode = async (
  state: ClmmState,
  config: CopilotKitConfig,
): Promise<ClmmUpdate | Command<string, ClmmUpdate>> => {
  const threadId = (config as Configurable).configurable?.thread_id;

  if (state.private.bootstrapped) {
    logInfo('Skipping bootstrap; state already initialized for thread', { threadId });
    return new Command({
      update: {},
      goto: 'collectSetupInput',
    });
  }

  const mode = process.env['GMX_ALLORA_MODE'] === 'production' ? 'production' : 'debug';
  const pollIntervalMs = resolvePollIntervalMs();
  const streamLimit = resolveStreamLimit();
  const delegationsBypassActive = process.env['GMX_ALLORA_DELEGATIONS_BYPASS'] === 'true';

  logInfo('Initialized GMX Allora workflow context', {
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
          name: 'GMX Allora Trader',
          subtitle: 'Arbitrum One',
          description: 'Autonomous GMX perps strategy driven by Allora 8-hour signals.',
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
        agentIncome: 4100,
        aum: 42000,
        totalUsers: 58,
        apy: 9.2,
        chains: ['Arbitrum One'],
        protocols: ['GMX', 'Allora'],
        tokens: [...ALLOWED_TOKENS],
        pools: [...MARKETS],
        allowedPools: [...MARKETS],
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
