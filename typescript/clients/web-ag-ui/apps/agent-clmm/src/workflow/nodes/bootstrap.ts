import { copilotkitEmitState } from '@copilotkit/sdk-js/langgraph';
import { Command } from '@langchain/langgraph';

import { createClients } from '../../clients/clients.js';
import { EmberCamelotClient } from '../../clients/emberApi.js';
import {
  EMBER_API_BASE_URL,
  resolvePollIntervalMs,
  resolveStreamLimit,
} from '../../config/constants.js';
import { buildTaskStatus, logInfo, type ClmmEvent, type ClmmState, type ClmmUpdate } from '../context.js';
import { loadBootstrapContext } from '../store.js';

type CopilotKitConfig = Parameters<typeof copilotkitEmitState>[0];
type Configurable = { configurable?: { thread_id?: string } };

export const bootstrapNode = async (
  state: ClmmState,
  config: CopilotKitConfig,
): Promise<ClmmUpdate | Command<string, ClmmUpdate>> => {
  if (state.cronScheduled) {
    logInfo('Skipping bootstrap; cron already scheduled for thread', {
      threadId: (config as Configurable).configurable?.thread_id,
    });
    return new Command({
      update: {},
      goto: 'pollCycle',
    });
  }
  const { account } = await loadBootstrapContext();
  const mode = process.env['CLMM_MODE'] === 'production' ? 'production' : 'debug';
  const pollIntervalMs = resolvePollIntervalMs();
  const streamLimit = resolveStreamLimit();
  const camelotClient = new EmberCamelotClient(EMBER_API_BASE_URL);
  const clients = createClients(account);

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

  const { task, statusEvent } = buildTaskStatus(
    state.task,
    'submitted',
    `Bootstrapping CLMM workflow in ${mode} mode (poll every ${pollIntervalMs / 1000}s)`,
  );
  await copilotkitEmitState(config, { task, events: [statusEvent] });

  return {
    mode,
    pollIntervalMs,
    streamLimit,
    camelotClient,
    clients,
    task,
    events: [dispatch, statusEvent],
  };
};
