import { copilotkitEmitState } from '@copilotkit/sdk-js/langgraph';
import { Command } from '@langchain/langgraph';

import { ARBITRUM_CHAIN_ID } from '../../config/constants.js';
import { buildPoolArtifact } from '../artifacts.js';
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
  const pools = await state.camelotClient.listCamelotPools(ARBITRUM_CHAIN_ID);
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

  const events: ClmmEvent[] = [
    { type: 'artifact', artifact: poolArtifact },
    statusEvent,
  ];

  return {
    pools,
    allowedPools,
    poolArtifact,
    task,
    events,
  };
};
