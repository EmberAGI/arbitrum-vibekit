import { copilotkitEmitState } from '@copilotkit/sdk-js/langgraph';
import {
  buildTaskStatus,
  type GMXTradeLog,
  isTaskTerminal,
  type GMXState,
  type GMXUpdate,
} from '../context.js';
import { cancelCronForThread } from '../cronScheduler.js';
import { Command } from '@langchain/langgraph';

type Configurable = { configurable?: { thread_id?: string } };

type CopilotKitConfig = Parameters<typeof copilotkitEmitState>[0];

export const pollCommandNode = async (
  state: GMXState,
  config: CopilotKitConfig,
): Promise<GMXUpdate> => {
  const mode = state.private.mode ?? 'debug';
  console.log('Inside Poll Command Node');
  const { task, statusEvent } = buildTaskStatus(
    state.view.task,
    'working',
    `[GMX-Agent] Starting Polling for GMX Market(s)`,
  );
  const trades: GMXTradeLog = [];
  const hasPosition = Array.isArray(state.view.positions) && state.view.positions.length > 0;

  if (!hasPosition) {
    return new Command({
      goto: 'openPosition',
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
  }

  return new Command({
    goto: 'holdPosition',
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
