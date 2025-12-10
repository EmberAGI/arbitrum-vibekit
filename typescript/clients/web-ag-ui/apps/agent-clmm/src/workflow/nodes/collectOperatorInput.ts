import { copilotkitEmitState } from '@copilotkit/sdk-js/langgraph';
import { interrupt } from '@langchain/langgraph';

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
): Promise<ClmmUpdate> => {
  if (!state.poolArtifact) {
    throw new Error('Pool artifact missing before operator input');
  }

  const request: OperatorInterrupt = {
    type: 'operator-config-request',
    message:
      'Select a Camelot pool to manage, confirm wallet, and optional allocation override for this CLMM workflow.',
    artifactId: state.poolArtifact.artifactId,
  };

  const awaitingInput = buildTaskStatus(
    state.task,
    'input-required',
    'Awaiting operator configuration to continue CLMM setup.',
  );
  await copilotkitEmitState(config, { task: awaitingInput.task, events: [awaitingInput.statusEvent] });

  const parsed = OperatorConfigInputSchema.parse(await interrupt(request));
  logInfo('Operator input received', { poolAddress: parsed.poolAddress, walletAddress: parsed.walletAddress });

  const { task, statusEvent } = buildTaskStatus(
    awaitingInput.task,
    'working',
    'Operator configuration received. Preparing execution context.',
  );
  await copilotkitEmitState(config, { task, events: [statusEvent] });

  return {
    operatorInput: parsed,
    task,
    events: [statusEvent],
  };
};
