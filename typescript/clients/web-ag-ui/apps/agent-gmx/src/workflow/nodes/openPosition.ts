import { copilotkitEmitState } from '@copilotkit/sdk-js/langgraph';
import {
  buildTaskStatus,
  isTaskTerminal,
  type GMXTradeLog,
  type GMXState,
  type GMXUpdate,
} from '../context.js';
import { cancelCronForThread } from '../cronScheduler.js';
import { Command } from '@langchain/langgraph';

type Configurable = { configurable?: { thread_id?: string } };

type CopilotKitConfig = Parameters<typeof copilotkitEmitState>[0];

export const openPositionCommandNode = async (
  state: GMXState,
  config: CopilotKitConfig,
): Promise<GMXUpdate> => {
  const mode = state.private.mode ?? 'debug';
  console.log('Inside open Position Command Node');
  const { task, statusEvent } = buildTaskStatus(
    state.view.task,
    'working',
    `[GMX-Agent] Starting Polling for GMX Market(s)`,
  );
  console.log(`📈[GMX Agent :: Open Position]\n`, state.view.profile);

  return new Command({
    goto: 'pollPosition',
    update: {
      view: {
        task,
      },
      private: {
        mode,
      },
    },
  });
};
