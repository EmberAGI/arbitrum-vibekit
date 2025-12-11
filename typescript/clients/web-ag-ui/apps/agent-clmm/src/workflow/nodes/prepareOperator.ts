import { copilotkitEmitState } from '@copilotkit/sdk-js/langgraph';
import { Command } from '@langchain/langgraph';

import { fetchPoolSnapshot } from '../../clients/emberApi.js';
import { ARBITRUM_CHAIN_ID, DEFAULT_TICK_BANDWIDTH_BPS } from '../../config/constants.js';
import { type ResolvedOperatorConfig } from '../../domain/types.js';
import { getCamelotClient } from '../clientFactory.js';
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

export const prepareOperatorNode = async (
  state: ClmmState,
  config: CopilotKitConfig,
): Promise<ClmmUpdate | Command<string, ClmmUpdate>> => {
  const { operatorInput, allowedPools } = state;
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

  // Create client on-demand (class instances don't survive LangGraph checkpointing)
  const camelotClient = getCamelotClient();
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

  // Note: Cron scheduling moved to pollCycle to ensure first cycle completes
  // before subsequent cron-triggered runs begin

  const { task, statusEvent } = buildTaskStatus(
    state.task,
    'working',
    `Managing pool ${selectedPool.token0.symbol}/${selectedPool.token1.symbol} from ${agentWalletAddress}`,
  );
  await copilotkitEmitState(config, { task, events: [statusEvent] });

  const events: ClmmEvent[] = [statusEvent];

  return {
    operatorConfig,
    selectedPool,
    lastSnapshot: selectedPool,
    cyclesSinceRebalance: 0,
    staleCycles: 0,
    iteration: 0,
    telemetry: [],
    previousPrice: undefined,
    cronScheduled: false, // Will be set to true in pollCycle after first cycle
    task,
    events,
  };
};
