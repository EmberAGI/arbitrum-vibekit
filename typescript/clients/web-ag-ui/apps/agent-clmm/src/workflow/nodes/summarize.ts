import { buildSummaryArtifact } from '../artifacts.js';
import { type ClmmEvent, type ClmmState, type ClmmUpdate } from '../context.js';

export const summarizeNode = (state: ClmmState): ClmmUpdate => {
  const summaryArtifact = buildSummaryArtifact(state.telemetry ?? []);
  const completion: ClmmEvent = {
    type: 'status',
    message: state.haltReason ?? 'CLMM workflow completed.',
  };
  return {
    events: [
      {
        type: 'artifact',
        artifact: summaryArtifact,
      },
      completion,
    ],
  };
};
