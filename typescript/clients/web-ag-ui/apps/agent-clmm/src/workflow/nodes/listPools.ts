import { copilotkitEmitState } from '@copilotkit/sdk-js/langgraph';
import { Command } from '@langchain/langgraph';

import { ARBITRUM_CHAIN_ID, resolvePollIntervalMs } from '../../config/constants.js';
import { type CamelotPool } from '../../domain/types.js';
import { buildPoolArtifact } from '../artifacts.js';
import {
  buildTaskStatus,
  logInfo,
  type ClmmEvent,
  type ClmmState,
  type ClmmUpdate,
} from '../context.js';
import { ensureCronForThread } from '../cronScheduler.js';
import { isPoolAllowed } from '../pools.js';

type CopilotKitConfig = Parameters<typeof copilotkitEmitState>[0];
type Configurable = {
  configurable?: { thread_id?: string; scheduleCron?: (threadId: string) => void };
};

export const listPoolsNode = async (
  state: ClmmState,
  config: CopilotKitConfig & Configurable,
): Promise<ClmmUpdate | Command<string, ClmmUpdate>> => {
  if (!state.camelotClient) {
    const failureMessage = 'ERROR: Camelot client not initialized';
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
  let pools: CamelotPool[];
  try {
    pools = await state.camelotClient.listCamelotPools(ARBITRUM_CHAIN_ID);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    const failureMessage = `ERROR: Failed to fetch Camelot pools - ${message}`;
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
  const allowedPools = pools.filter((pool) => isPoolAllowed(pool, state.mode ?? 'debug'));
  logInfo('Retrieved Camelot pools', {
    total: pools.length,
    allowed: allowedPools.length,
    mode: state.mode,
  });
  if (allowedPools.length === 0) {
    const failureMessage = `ERROR: No Camelot pools available for mode=${state.mode}`;
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

  const poolArtifact = buildPoolArtifact(allowedPools.slice(0, 8));
  const { task, statusEvent } = buildTaskStatus(
    state.task,
    'working',
    `Discovered ${allowedPools.length}/${pools.length} allowed Camelot pools`,
  );
  await copilotkitEmitState(config, { task, events: [statusEvent] });

  const events: ClmmEvent[] = [{ type: 'artifact', artifact: poolArtifact }, statusEvent];

  // Schedule cron here before the interrupt in collectOperatorInput
  // This ensures the cron is set up even if the graph pauses waiting for operator input
  const threadId = config.configurable?.thread_id;
  const scheduleCron = config.configurable?.scheduleCron;
  let cronScheduled = state.cronScheduled;
  if (threadId && !cronScheduled) {
    if (scheduleCron) {
      scheduleCron(threadId);
    } else {
      const intervalMs = state.pollIntervalMs ?? resolvePollIntervalMs();
      ensureCronForThread(threadId, intervalMs);
    }
    cronScheduled = true;
    logInfo('Cron scheduled after pool discovery', { threadId });
  }

  return {
    pools,
    allowedPools,
    poolArtifact,
    task,
    events,
    cronScheduled,
  };
};
