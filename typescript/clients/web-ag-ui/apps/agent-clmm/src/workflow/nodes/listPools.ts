import { copilotkitEmitState } from '@copilotkit/sdk-js/langgraph';
import { type Command } from '@langchain/langgraph';
import { buildNodeTransition, buildStateUpdate } from 'agent-workflow-core';

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
import { createLangGraphCommand } from '../langGraphCommandFactory.js';
import { isPoolAllowed } from '../pools.js';

type CopilotKitConfig = Parameters<typeof copilotkitEmitState>[0];

export const listPoolsNode = async (
  state: ClmmState,
  config: CopilotKitConfig,
): Promise<ClmmUpdate | Command<string, ClmmUpdate>> => {
  const startedAt = Date.now();
  logInfo('listPools: entering node', {
    mode: state.private.mode ?? 'debug',
    emberBaseUrl: process.env['EMBER_API_BASE_URL'] ?? 'https://api.emberai.xyz',
  });

  // Create client on-demand (class instances don't survive LangGraph checkpointing)
  const camelotClient = getCamelotClient();

  let pools: CamelotPool[];
  try {
    pools = await camelotClient.listCamelotPools(ARBITRUM_CHAIN_ID);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    const failureMessage = `ERROR: Failed to fetch Camelot pools - ${message}`;
    logInfo('listPools: failed to fetch pools', {
      error: message,
      elapsedMs: Date.now() - startedAt,
    });
    const { task, statusEvent } = buildTaskStatus(state.thread.task, 'failed', failureMessage);
    await copilotkitEmitState(config, {
      thread: { task, activity: { events: [statusEvent], telemetry: [] } },
    });
    return buildNodeTransition({
      node: 'summarize',
      update: {
        thread: {
          haltReason: failureMessage,
          activity: { events: [statusEvent], telemetry: [] },
          task,
          profile: state.thread.profile,
          transactionHistory: state.thread.transactionHistory,
          metrics: state.thread.metrics,
        },
      },
      createCommand: createLangGraphCommand,
    });
  }
  const mode = state.private.mode ?? 'debug';
  const allowedPools = pools.filter((pool) => isPoolAllowed(pool, mode));
  logInfo('Retrieved Camelot pools', {
    total: pools.length,
    allowed: allowedPools.length,
    mode,
    elapsedMs: Date.now() - startedAt,
  });
  if (allowedPools.length === 0) {
    const failureMessage = `ERROR: No Camelot pools available for mode=${mode}`;
    const { task, statusEvent } = buildTaskStatus(state.thread.task, 'failed', failureMessage);
    await copilotkitEmitState(config, {
      thread: { task, activity: { events: [statusEvent], telemetry: [] } },
    });
    return buildNodeTransition({
      node: 'summarize',
      update: {
        thread: {
          haltReason: failureMessage,
          activity: { events: [statusEvent], telemetry: [] },
          task,
          profile: state.thread.profile,
          transactionHistory: state.thread.transactionHistory,
          metrics: state.thread.metrics,
        },
      },
      createCommand: createLangGraphCommand,
    });
  }

  const poolArtifact = buildPoolArtifact(allowedPools.slice(0, 8));
  logInfo('listPools: built pool artifact', {
    artifactId: poolArtifact.artifactId,
    poolCount: Math.min(allowedPools.length, 8),
  });
  const { task, statusEvent } = buildTaskStatus(
    state.thread.task,
    'working',
    `Discovered ${allowedPools.length}/${pools.length} allowed Camelot pools`,
  );
  await copilotkitEmitState(config, {
    thread: { task, activity: { events: [statusEvent], telemetry: [] } },
  });

  const events: ClmmEvent[] = [{ type: 'artifact', artifact: poolArtifact }, statusEvent];

  // Note: Cron is scheduled in prepareOperatorNode AFTER the operator provides input
  // via the interrupt in collectOperatorInput. This ensures the cron only starts
  // once the workflow is fully configured.

  return buildStateUpdate({
    thread: {
      profile: {
        pools,
        allowedPools,
      },
      poolArtifact,
      task,
      activity: { events, telemetry: state.thread.activity.telemetry },
      transactionHistory: state.thread.transactionHistory,
      metrics: state.thread.metrics,
    },
    private: {
      mode,
    },
  });
};
