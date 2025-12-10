import { interrupt } from '@langchain/langgraph';

import { OperatorConfigInputSchema, type OperatorConfigInput } from '../../domain/types.js';
import { logInfo, type ClmmState, type OperatorInterrupt, type ClmmUpdate } from '../context.js';

export const collectOperatorInputNode = async (
  state: ClmmState,
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

  const operatorInput = await interrupt<OperatorConfigInput>(request);
  const parsed = OperatorConfigInputSchema.parse(operatorInput);
  logInfo('Operator input received', { poolAddress: parsed.poolAddress, walletAddress: parsed.walletAddress });

  return {
    operatorInput: parsed,
    events: [{ type: 'status', message: 'Operator configuration received. Preparing execution context.' }],
  };
};
