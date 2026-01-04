import { copilotkitEmitState } from '@copilotkit/sdk-js/langgraph';
import { Command } from '@langchain/langgraph';

import { resolvePollIntervalMs, resolveStreamLimit } from '../../config/constants.js';
import { logInfo, type GMXEvent, type GMXState, type GMXUpdate } from '../context.js';

type CopilotKitConfig = Parameters<typeof copilotkitEmitState>[0];
type Configurable = { configurable?: { thread_id?: string } };

export const bootstrapNode = async (
  state: GMXState,
  config: CopilotKitConfig,
): Promise<GMXUpdate | Command<string, GMXUpdate>> => {
  const threadId = (config as Configurable).configurable?.thread_id;

  if (state.private.bootstrapped) {
    logInfo('Skipping bootstrap; state already initialized for thread', { threadId });
    return new Command({
      update: {},
      goto: 'pollCommand', /// TODO:next gmx state if already bootstrapped
    });
  }

  // Note: We don't store client instances in state because LangGraph's checkpointer
  // serializes state to JSON, which strips away prototype methods from class instances.
  // Instead, clients are created on-demand in each node via clientFactory.ts.
  const mode = process.env['GMX_MODE'] === 'production' ? 'production' : 'debug';
  const pollIntervalMs = resolvePollIntervalMs();
  const streamLimit = resolveStreamLimit();
  const delegationsBypassActive = process.env['GMX_DELEGATIONS_BYPASS'] === 'true';

  logInfo('Initialized LangGraph workflow context', {
    mode,
    pollIntervalMs,
    streamLimit,
    delegationsBypassActive,
  });

  const dispatch: GMXEvent = {
    type: 'dispatch-response',
    parts: [
      {
        kind: 'data',
        data: {
          name: 'GMX Perps Execution Agent',
          subtitle: 'Arbitrum One',
          description: 'Executes perpetual trades on GMX with automated risk controls.',
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
      //   activity: { events: [dispatch], telemetry: [] },

      command: undefined,
      task: undefined,
      lastOrder: undefined,
      positions: [],
      trades: [],
      delegationBundle: undefined,
      haltReason: undefined,
      executionError: undefined,
      profile: {
        agentIncome: 3250,
        aum: 15000,
        totalUsers: 10,
        apy: 112,
        chains: ['Arbitrum One'],
        protocols: ['GMX'],
        tokens: ['WETH', 'USDC'],
        markets: [
          {
            longToken: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
            shortToken: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
          },
        ],
      },
      delegationsBypassActive,
    },
  };
};
