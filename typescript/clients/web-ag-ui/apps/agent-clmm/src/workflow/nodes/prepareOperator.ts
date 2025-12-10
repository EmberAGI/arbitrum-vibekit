import { copilotkitEmitState } from '@copilotkit/sdk-js/langgraph';
import { Command } from '@langchain/langgraph';

import { fetchPoolSnapshot } from '../../clients/emberApi.js';
import { ARBITRUM_CHAIN_ID, DEFAULT_TICK_BANDWIDTH_BPS } from '../../config/constants.js';
import { type ResolvedOperatorConfig } from '../../domain/types.js';
import {
  buildTaskStatus,
  type ClmmState,
  type ClmmUpdate,
  logInfo,
  normalizeHexAddress,
  type ClmmEvent,
} from '../context.js';
import { loadBootstrapContext } from '../store.js';

type CopilotKitConfig = Parameters<typeof copilotkitEmitState>[0];
type Configurable = { configurable?: { thread_id?: string; scheduleCron?: (threadId: string) => void } };

export const prepareOperatorNode = async (
  state: ClmmState,
  config: CopilotKitConfig,
): Promise<ClmmUpdate | Command<string, ClmmUpdate>> => {
  const { operatorInput, allowedPools, camelotClient, clients } = state;
  if (!operatorInput) {
    const failureMessage = 'ERROR: Operator input missing';
    const { task, statusEvent } = buildTaskStatus(state.task, 'failed', failureMessage);
    await copilotkitEmitState(config, { task, events: [statusEvent] });
    return new Command({
      update: {
        haltReason: failureMessage,
        events: [statusEvent],
        task,
      },
      goto: 'summarize',
    });
  }
  if (!camelotClient) {
    const failureMessage = 'ERROR: Camelot client missing';
    const { task, statusEvent } = buildTaskStatus(state.task, 'failed', failureMessage);
    await copilotkitEmitState(config, { task, events: [statusEvent] });
    return new Command({
      update: {
        haltReason: failureMessage,
        events: [statusEvent],
        task,
      },
      goto: 'summarize',
    });
  }
  if (!clients) {
    const failureMessage = 'ERROR: Agent wallet context missing';
    const { task, statusEvent } = buildTaskStatus(state.task, 'failed', failureMessage);
    await copilotkitEmitState(config, { task, events: [statusEvent] });
    return new Command({
      update: {
        haltReason: failureMessage,
        events: [statusEvent],
        task,
      },
      goto: 'summarize',
    });
  }

  const { agentWalletAddress } = await loadBootstrapContext();

  const selectedPoolAddress = normalizeHexAddress(operatorInput.poolAddress, 'pool address');
  const operatorWalletAddress = normalizeHexAddress(operatorInput.walletAddress, 'wallet address');

  const selectedPool =
    allowedPools?.find(
      (pool) => pool.address.toLowerCase() === selectedPoolAddress.toLowerCase(),
    ) ?? (await fetchPoolSnapshot(camelotClient, selectedPoolAddress, ARBITRUM_CHAIN_ID));

  if (!selectedPool) {
    const failureMessage = `ERROR: Pool ${selectedPoolAddress} not available from Ember API`;
    const { task, statusEvent } = buildTaskStatus(state.task, 'failed', failureMessage);
    await copilotkitEmitState(config, { task, events: [statusEvent] });
    return new Command({
      update: {
        haltReason: failureMessage,
        events: [statusEvent],
        task,
      },
      goto: 'summarize',
    });
  }

  if (agentWalletAddress !== operatorWalletAddress) {
    logInfo('Operator wallet input differs from managed account', {
      operatorWalletAddress,
      agentWalletAddress,
    });
  }

  const operatorConfig: ResolvedOperatorConfig = {
    walletAddress: agentWalletAddress,
    baseContributionUsd: operatorInput.baseContributionUsd ?? 5_000,
    manualBandwidthBps: DEFAULT_TICK_BANDWIDTH_BPS,
    autoCompoundFees: true,
  };

  logInfo('Operator configuration established', {
    poolAddress: selectedPoolAddress,
    operatorWalletAddress,
    agentWalletAddress,
    baseContributionUsd: operatorConfig.baseContributionUsd,
  });

  const threadId = (config as Configurable).configurable?.thread_id;
  const scheduleCron = (config as Configurable).configurable?.scheduleCron;
  if (threadId && scheduleCron && !state.cronScheduled) {
    scheduleCron(threadId);
    logInfo('Cron scheduled after operator preparation', { threadId, cron: '*/1 * * * *' });
  }

  const { task, statusEvent } = buildTaskStatus(
    state.task,
    'working',
    `Managing pool ${selectedPool.token0.symbol}/${selectedPool.token1.symbol} from ${agentWalletAddress}`,
  );
  await copilotkitEmitState(config, { task, events: [statusEvent] });

  const events: ClmmEvent[] = [
    statusEvent,
  ];

  return {
    operatorConfig,
    selectedPool,
    lastSnapshot: selectedPool,
    cyclesSinceRebalance: 0,
    staleCycles: 0,
    iteration: 0,
    telemetry: [],
    previousPrice: undefined,
    cronScheduled: threadId ? true : state.cronScheduled,
    task,
    events,
  };
};
