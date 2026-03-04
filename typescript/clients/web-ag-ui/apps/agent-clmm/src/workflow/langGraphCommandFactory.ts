import { Command } from '@langchain/langgraph';

import { logClmmStateEmission } from './context.js';

const resolveCommandOrigin = (): string | undefined => {
  if (process.env['CLMM_STATE_EMISSION_LOG_ENABLED'] !== 'true') {
    return undefined;
  }
  const stack = new Error().stack;
  if (!stack) {
    return undefined;
  }
  const stackLines = stack.split('\n').map((line) => line.trim());
  const originLine = stackLines.find((line) => line.includes('/workflow/nodes/'));
  if (!originLine) {
    return undefined;
  }
  return originLine.replace(/^at\s+/, '');
};

export const createLangGraphCommand = <TNode extends string, TUpdate extends Record<string, unknown>>(
  input: {
    goto: TNode;
    update?: TUpdate;
  },
): Command<TNode, TUpdate> => {
  logClmmStateEmission({
    source: 'command',
    goto: input.goto,
    origin: resolveCommandOrigin(),
    update: input.update as Record<string, unknown> | undefined,
  });
  return new Command(input);
};
