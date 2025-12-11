import { copilotkitEmitState } from '@copilotkit/sdk-js/langgraph';
import { Command } from '@langchain/langgraph';

import { ARBITRUM_CHAIN_ID } from '../../config/constants.js';
import { type CamelotPool } from '../../domain/types.js';
import { buildPoolArtifact } from '../artifacts.js';
import { getCamelotClient } from '../clientFactory.js';
import {
  buildTaskStatus,
  logInfo,
  type ClmmEvent,
  type ClmmState,
  type ClmmUpdate,
} from '../context.js';
import { isPoolAllowed } from '../pools.js';

type CopilotKitConfig = Parameters<typeof copilotkitEmitState>[0];

export const listPoolsNode = async (
  state: ClmmState,
  config: CopilotKitConfig,
): Promise<ClmmUpdate | Command<string, ClmmUpdate>> => {
  // Create client on-demand (class instances don't survive LangGraph checkpointing)
  const camelotClient = getCamelotClient();

  let pools: CamelotPool[];
  try {
    pools = await camelotClient.listCamelotPools(ARBITRUM_CHAIN_ID);
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

  // Note: Cron is scheduled in prepareOperatorNode AFTER the operator provides input
  // via the interrupt in collectOperatorInput. This ensures the cron only starts
  // once the workflow is fully configured.

  return {
    pools,
    allowedPools,
    poolArtifact,
    task,
    events,
  };
};
