import { randomUUID } from 'node:crypto';
import process from 'node:process';
import { inspect } from 'node:util';

import type { WorkflowContext, WorkflowState } from '@emberai/agent-node/workflow';
import { z } from 'zod';

import plugin from '../src/index.js';
import { OperatorConfigInputSchema, type OperatorConfigInput } from '../src/types.js';

const CliArgsSchema = z.object({
  pool: z.string().optional(),
  wallet: z.string().optional(),
  contribution: z.string().optional(),
});

function parseArgv(argv: string[]) {
  const result: Record<string, string | undefined> = {};
  for (let i = 0; i < argv.length; i += 1) {
    const raw = argv[i];
    if (!raw.startsWith('--')) {
      continue;
    }
    const withoutPrefix = raw.slice(2);
    const [key, inlineValue] = withoutPrefix.split('=', 2);
    if (!key) {
      continue;
    }
    if (inlineValue !== undefined) {
      result[key] = inlineValue;
      continue;
    }
    const next = argv[i + 1];
    if (next && !next.startsWith('--')) {
      result[key] = next;
      i += 1;
    } else {
      result[key] = 'true';
    }
  }
  return CliArgsSchema.safeParse(result);
}

function coerceOperatorInput(): OperatorConfigInput {
  const parsedArgs = parseArgv(process.argv.slice(2));
  if (!parsedArgs.success) {
    throw new Error(`Unable to parse CLI flags: ${parsedArgs.error.message}`);
  }
  const { pool, wallet, contribution } = parsedArgs.data;

  const poolAddress = pool ?? process.env['CLMM_DEMO_POOL_ADDRESS'];
  const walletAddress = wallet ?? process.env['CLMM_DEMO_WALLET_ADDRESS'];
  const baseContributionRaw = contribution ?? process.env['CLMM_DEMO_BASE_USD'];
  const baseContributionUsd =
    typeof baseContributionRaw === 'string' && baseContributionRaw.length > 0
      ? Number(baseContributionRaw)
      : undefined;

  const normalizedContribution =
    baseContributionUsd !== undefined && Number.isFinite(baseContributionUsd)
      ? baseContributionUsd
      : undefined;

  return OperatorConfigInputSchema.parse({
    poolAddress,
    walletAddress,
    baseContributionUsd: normalizedContribution,
  });
}

function logWorkflowState(state: WorkflowState) {
  switch (state.type) {
    case 'status-update':
      console.log(`[status] ${state.message}`);
      break;
    case 'artifact': {
      const name =
        typeof state.artifact === 'object' && state.artifact !== null
          ? (state.artifact.name as string | undefined) ?? (state.artifact.artifactId as string | undefined)
          : undefined;
      console.log(`[artifact] ${name ?? 'unnamed'}${state.append ? ' (append)' : ''}`);
      console.dir(state.artifact, { depth: null });
      break;
    }
    case 'dispatch-response':
      console.log('[dispatch-response]', JSON.stringify(state.parts, null, 2));
      break;
    case 'payment-required':
      console.warn(`[payment-required] ${state.message}`);
      console.dir(state.metadata, { depth: null });
      break;
    case 'reject':
      throw new Error(state.reason);
    default:
      console.log('[state]', inspect(state, { depth: null }));
  }
}

async function runDemo() {
  const operatorInput = coerceOperatorInput();
  console.log('[demo] Using operator input:', operatorInput);

  const context: WorkflowContext = {
    contextId: `camelot-demo-${Date.now().toString(16)}`,
    taskId: randomUUID(),
  };

  const iterator = plugin.execute(context);
  let awaitingOperatorInput = true;
  let nextInput: OperatorConfigInput | undefined;

  while (true) {
    const result = await iterator.next(nextInput);
    nextInput = undefined;

    if (result.done) {
      console.log('[demo] Workflow completed');
      break;
    }

    const state = result.value;
    if (state.type === 'interrupted') {
      console.log('[demo] Workflow requested operator input:', state.message);
      if (!awaitingOperatorInput) {
        throw new Error('Received an unexpected second input request; manual intervention required.');
      }
      awaitingOperatorInput = false;
      nextInput = operatorInput;
      continue;
    }

    logWorkflowState(state);
  }
}

runDemo().catch((error) => {
  console.error('[demo] Fatal error while running Camelot workflow demo');
  console.error(error);
  process.exitCode = 1;
});
