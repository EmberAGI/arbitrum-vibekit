import { copilotkitEmitState as rawCopilotkitEmitState } from '@copilotkit/sdk-js/langgraph';

import { logClmmStateEmission } from './context.js';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const resolveEmitOrigin = (): string | undefined => {
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

export const copilotkitEmitState = async (
  ...args: Parameters<typeof rawCopilotkitEmitState>
): Promise<Awaited<ReturnType<typeof rawCopilotkitEmitState>>> => {
  const payload = args[1] as unknown;
  if (isRecord(payload)) {
    logClmmStateEmission({
      source: 'emit-state',
      origin: resolveEmitOrigin(),
      update: payload,
    });
  }
  return rawCopilotkitEmitState(...args);
};
