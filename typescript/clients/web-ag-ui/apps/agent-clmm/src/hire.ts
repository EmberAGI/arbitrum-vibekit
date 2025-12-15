import { pathToFileURL } from 'node:url';

import { v7 as uuidv7 } from 'uuid';

import { clmmGraph } from './agent.js';
import { type OperatorConfigInput, OperatorConfigInputSchema } from './domain/types.js';
import { runGraphWithAutoResume } from './workflow/autoResumeRunner.js';
import { type OperatorInterrupt } from './workflow/context.js';
import { cancelCronForThread } from './workflow/cronScheduler.js';

function resolveOperatorInputFromEnv(): OperatorConfigInput {
  const rawJson = process.env['CLMM_OPERATOR_INPUT_JSON'];
  let candidate: unknown = undefined;
  if (rawJson) {
    try {
      candidate = JSON.parse(rawJson);
    } catch (error: unknown) {
      throw new Error(
        `CLMM_OPERATOR_INPUT_JSON must be valid JSON (${error instanceof Error ? error.message : 'invalid'}).`,
      );
    }
  }

  const poolAddress = process.env['CLMM_POOL_ADDRESS'];
  const walletAddress = process.env['CLMM_WALLET_ADDRESS'];
  const baseContributionUsd = process.env['CLMM_BASE_CONTRIBUTION_USD'];

  const input: unknown =
    candidate ??
    (poolAddress && walletAddress
      ? {
          poolAddress,
          walletAddress,
          baseContributionUsd: baseContributionUsd ? Number(baseContributionUsd) : undefined,
        }
      : undefined);

  const parsed = OperatorConfigInputSchema.safeParse(input);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => issue.message).join('; ');
    throw new Error(
      `Invalid operator input. Provide CLMM_OPERATOR_INPUT_JSON or CLMM_POOL_ADDRESS + CLMM_WALLET_ADDRESS. Issues: ${issues}`,
    );
  }

  return parsed.data;
}

function isOperatorInterrupt(value: unknown): value is OperatorInterrupt {
  return (
    typeof value === 'object' &&
    value !== null &&
    'type' in value &&
    (value as { type?: unknown }).type === 'operator-config-request'
  );
}

export async function startClmmHire(threadId: string, operatorInput: OperatorConfigInput) {
  const hireMessage = {
    id: uuidv7(),
    role: 'user' as const,
    content: JSON.stringify({ command: 'hire' }),
  };

  type ClmmInvokeInput = Parameters<typeof clmmGraph.invoke>[0];
  type ClmmInvokeOutput = Awaited<ReturnType<typeof clmmGraph.invoke>>;
  type ClmmInvokeConfig = Parameters<typeof clmmGraph.invoke>[1];

  const initialInput: ClmmInvokeInput = { messages: [hireMessage] } as ClmmInvokeInput;
  const invokeConfig: ClmmInvokeConfig = { configurable: { thread_id: threadId } } as ClmmInvokeConfig;

  const output = await runGraphWithAutoResume<ClmmInvokeInput, ClmmInvokeOutput, ClmmInvokeConfig>({
    graph: clmmGraph,
    initialInput,
    config: invokeConfig,
    resolveResumeValue: (interrupt) => {
      const value = interrupt.value;
      if (isOperatorInterrupt(value)) {
        return operatorInput;
      }
      throw new Error(
        `Unsupported interrupt type for auto-resume (value=${value ? JSON.stringify(value) : 'undefined'}).`,
      );
    },
  });

  if (
    typeof output === 'object' &&
    output !== null &&
    'view' in output &&
    typeof (output as { view?: unknown }).view === 'object' &&
    (output as { view?: { haltReason?: unknown } }).view?.haltReason
  ) {
    const reason = String((output as { view: { haltReason: unknown } }).view.haltReason);
    throw new Error(`Hire flow halted: ${reason}`);
  }
}

const invokedAsEntryPoint =
  process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;
if (invokedAsEntryPoint) {
  const threadId = process.env['CLMM_THREAD_ID'] ?? uuidv7();
  if (!process.env['CLMM_THREAD_ID']) {
    console.info(`[hire] CLMM_THREAD_ID not provided; generated thread id ${threadId}`);
  }

  const operatorInput = resolveOperatorInputFromEnv();
  await startClmmHire(threadId, operatorInput);

  if (process.env['CLMM_KEEP_ALIVE'] === 'false') {
    console.info('[hire] CLMM_KEEP_ALIVE=false; exiting after hire flow.');
  } else {
    console.info('[hire] Hire flow complete; keeping process alive for cron ticks.');
    const keepAliveTimer = setInterval(() => void 0, 1 << 30);
    const shutdown = (signal: string) => {
      console.info(`[hire] Received ${signal}; stopping cron and exiting.`);
      cancelCronForThread(threadId);
      clearInterval(keepAliveTimer);
      process.exit(0);
    };
    process.once('SIGINT', () => shutdown('SIGINT'));
    process.once('SIGTERM', () => shutdown('SIGTERM'));
  }
}

