import { copilotkitEmitState } from '@copilotkit/sdk-js/langgraph';

import { buildPoolArtifact } from '../artifacts.js';
import {
  buildTaskStatus,
  logInfo,
  type ClmmEvent,
  type ClmmState,
  type ClmmUpdate,
} from '../context.js';
import { MOCK_POOLS } from '../mockData.js';

type CopilotKitConfig = Parameters<typeof copilotkitEmitState>[0];

export const listPoolsNode = async (
  state: ClmmState,
  config: CopilotKitConfig,
): Promise<ClmmUpdate> => {
  const pools = MOCK_POOLS;
  const allowedPools = MOCK_POOLS;

  logInfo('Loaded mock pools', {
    total: pools.length,
    allowed: allowedPools.length,
  });

  const poolArtifact = buildPoolArtifact(allowedPools.slice(0, 8));
  const { task, statusEvent } = buildTaskStatus(
    state.view.task,
    'working',
    `Loaded ${allowedPools.length} mock pools for onboarding.`,
  );
  await copilotkitEmitState(config, {
    view: { task, activity: { events: [statusEvent], telemetry: [] } },
  });

  const events: ClmmEvent[] = [{ type: 'artifact', artifact: poolArtifact }, statusEvent];

  return {
    view: {
      profile: {
        pools,
        allowedPools,
      },
      poolArtifact,
      task,
      activity: { events, telemetry: state.view.activity.telemetry },
      transactionHistory: state.view.transactionHistory,
      metrics: state.view.metrics,
    },
    private: {
      mode: state.private.mode,
    },
  };
};
