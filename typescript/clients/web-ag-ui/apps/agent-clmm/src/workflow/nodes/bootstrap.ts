import { copilotkitEmitState } from '@copilotkit/sdk-js/langgraph';
import { Command } from '@langchain/langgraph';

import { resolvePollIntervalMs, resolveStreamLimit } from '../../config/constants.js';
import {
  logInfo,
  type ClmmEvent,
  type ClmmState,
  type ClmmUpdate,
} from '../context.js';

type CopilotKitConfig = Parameters<typeof copilotkitEmitState>[0];
type Configurable = { configurable?: { thread_id?: string } };

export const bootstrapNode = async (
  state: ClmmState,
  config: CopilotKitConfig,
): Promise<ClmmUpdate | Command<string, ClmmUpdate>> => {
  const threadId = (config as Configurable).configurable?.thread_id;

  if (state.bootstrapped) {
    logInfo('Skipping bootstrap; state already initialized for thread', { threadId });
    return new Command({
      update: {},
      goto: 'listPools',
    });
  }

  // Note: We don't store client instances in state because LangGraph's checkpointer
  // serializes state to JSON, which strips away prototype methods from class instances.
  // Instead, clients are created on-demand in each node via clientFactory.ts.
  const mode = process.env['CLMM_MODE'] === 'production' ? 'production' : 'debug';
  const pollIntervalMs = resolvePollIntervalMs();
  const streamLimit = resolveStreamLimit();

  logInfo('Initialized LangGraph workflow context', { mode, pollIntervalMs, streamLimit });

  const dispatch: ClmmEvent = {
    type: 'dispatch-response',
    parts: [
      {
        kind: 'data',
        data: {
          name: 'Camelot CLMM Auto-Rebalancer',
          subtitle: 'Arbitrum One',
          description:
            'Keeps liquidity centered around the pool mid price and enforces 30-second rebalance cadence.',
        },
      },
    ],
  };

  await copilotkitEmitState(config, { events: [dispatch] });

  return {
    bootstrapped: true,
    mode,
    pollIntervalMs,
    streamLimit,
    events: [dispatch],
  };
};
