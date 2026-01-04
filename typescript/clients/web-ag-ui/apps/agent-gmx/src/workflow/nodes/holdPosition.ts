import { copilotkitEmitState } from '@copilotkit/sdk-js/langgraph';
import { buildTaskStatus, isTaskTerminal, type GMXState, type GMXUpdate } from '../context.js';
import { cancelCronForThread } from '../cronScheduler.js';
import { Command } from '@langchain/langgraph';

type Configurable = { configurable?: { thread_id?: string } };

type CopilotKitConfig = Parameters<typeof copilotkitEmitState>[0];

export const holdPositionCommandNode = async (
  state: GMXState,
  config: CopilotKitConfig,
): Promise<GMXUpdate> => {
  const mode = state.private.mode ?? 'debug';
  console.log('Inside hold Position Command Node');
  const { task, statusEvent } = buildTaskStatus(
    state.view.task,
    'working',
    `[GMX-Agent] Starting Polling for GMX Market(s)`,
  );
  const trades = [];
  return new Command({
    goto: 'pollPosition',
    update: {
      view: {
        profile: {
          markets: [], /// TODO: add markets here
          tokens: [], /// TODO: add tokens here
        },
        task,
        trades,
      },
      private: {
        mode,
      },
    },
  });
};
