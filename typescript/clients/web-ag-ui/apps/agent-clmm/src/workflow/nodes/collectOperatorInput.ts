import { copilotkitEmitState } from '@copilotkit/sdk-js/langgraph';
import { Command, interrupt } from '@langchain/langgraph';
import { z } from 'zod';

import { OperatorConfigInputSchema } from '../../domain/types.js';
import {
  buildTaskStatus,
  logInfo,
  type ClmmState,
  type OperatorInterrupt,
  type ClmmUpdate,
} from '../context.js';

type CopilotKitConfig = Parameters<typeof copilotkitEmitState>[0];

export const collectOperatorInputNode = async (
  state: ClmmState,
  config: CopilotKitConfig,
): Promise<ClmmUpdate | Command<string, ClmmUpdate>> => {
  logInfo('collectOperatorInput: entering node', { hasPoolArtifact: !!state.poolArtifact });

  if (!state.poolArtifact) {
    const failureMessage = 'ERROR: Pool artifact missing before operator input';
    const { task, statusEvent } = buildTaskStatus(state.task, 'failed', failureMessage);
    await copilotkitEmitState(config, { task, events: [statusEvent] });
    return new Command({
      update: {
        haltReason: failureMessage,
        task,
        events: [statusEvent],
      },
      goto: 'summarize',
    });
  }

  const request: OperatorInterrupt = {
    type: 'operator-config-request',
    message:
      'Select a Camelot pool to manage, confirm wallet, and optional allocation override for this CLMM workflow.',
    payloadSchema: z.toJSONSchema(OperatorConfigInputSchema),
    artifactId: state.poolArtifact.artifactId,
  };

  logInfo('collectOperatorInput: emitting input-required status before interrupt');

  const awaitingInput = buildTaskStatus(
    state.task,
    'input-required',
    'Awaiting operator configuration to continue CLMM setup.',
  );

  await copilotkitEmitState(config, {
    task: awaitingInput.task,
    events: [awaitingInput.statusEvent],
  });

  logInfo('collectOperatorInput: calling interrupt() - graph should pause here');
  const incoming: unknown = await interrupt(request);
  logInfo('collectOperatorInput: interrupt resolved with input', {
    hasInput: incoming !== undefined,
    incomingType: typeof incoming,
    incoming: typeof incoming === 'string' ? incoming.slice(0, 100) : incoming,
  });

  // CopilotKit's AG-UI protocol passes the response as a JSON string, so parse it first
  let inputToParse: unknown = incoming;
  if (typeof incoming === 'string') {
    try {
      inputToParse = JSON.parse(incoming);
      logInfo('collectOperatorInput: parsed JSON string input', { parsed: inputToParse });
    } catch {
      logInfo('collectOperatorInput: incoming is string but not valid JSON');
    }
  }

  const parsed = OperatorConfigInputSchema.safeParse(inputToParse);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => issue.message).join('; ');
    const failureMessage = `Invalid operator input: ${issues}`;
    logInfo('collectOperatorInput: validation failed', { issues, failureMessage });
    const { task, statusEvent } = buildTaskStatus(awaitingInput.task, 'failed', failureMessage);
    await copilotkitEmitState(config, { task, events: [statusEvent] });
    return {
      haltReason: failureMessage,
      task,
      events: [statusEvent],
    };
  }

  logInfo('Operator input received', {
    poolAddress: parsed.data.poolAddress,
    walletAddress: parsed.data.walletAddress,
  });

  const { task, statusEvent } = buildTaskStatus(
    awaitingInput.task,
    'working',
    'Operator configuration received. Preparing execution context.',
  );
  await copilotkitEmitState(config, { task, events: [statusEvent] });

  return {
    operatorInput: parsed.data,
    task,
    events: [statusEvent],
  };
};
