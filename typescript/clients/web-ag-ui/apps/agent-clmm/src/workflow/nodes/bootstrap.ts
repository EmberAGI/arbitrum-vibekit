import { createClients } from '../../clients/clients.js';
import {
  EMBER_API_BASE_URL,
  resolvePollIntervalMs,
  resolveStreamLimit,
} from '../../config/constants.js';
import { EmberCamelotClient } from '../../clients/emberApi.js';
import { logInfo, type ClmmEvent, type ClmmUpdate } from '../context.js';
import { loadBootstrapContext } from '../store.js';

export const bootstrapNode = async (): Promise<ClmmUpdate> => {
  const { account, agentWalletAddress } = await loadBootstrapContext();
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

  const status: ClmmEvent = {
    type: 'status',
    message: `Bootstrapping CLMM workflow in ${mode} mode (poll every ${pollIntervalMs / 1000}s)`,
  };

  return {
    mode,
    pollIntervalMs,
    streamLimit,
    camelotClient,
    clients,
    events: [dispatch, status],
  };
};
