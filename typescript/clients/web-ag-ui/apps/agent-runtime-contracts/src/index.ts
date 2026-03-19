export { extractCommandEnvelopeFromMessages, extractCommandFromMessages, type CommandEnvelope } from './commandEnvelope.js';
export { decodeInterruptPayload, requestInterruptPayload } from './interruptPayload.js';
export { createMessageHistoryReducer, mergeMessageHistory } from './messageHistory.js';
export {
  defineAgentDomainModule,
  getDomainCommandNames,
  getDomainInterruptTypes,
  getProjectionHookNames,
  type AgentDomainModule,
  type CoreRuntimeRecord,
  type DomainAutomationPolicyHookDefinition,
  type DomainCommandDefinition,
  type DomainInterruptDefinition,
  type DomainJsonSchema,
  type DomainLifecycleDefinition,
  type DomainLifecycleTransition,
  type DomainProjectionHookDefinition,
  type DomainProjectionHookName,
  type DomainRuntimeBoundary,
  type DomainTransitionTrigger,
} from './domainModule.js';
export {
  DEFI_LIFECYCLE_COMMANDS,
  DEFI_LIFECYCLE_INTERRUPTS,
  DEFI_LIFECYCLE_PHASES,
  defiLifecycleDomainModule,
} from './defiLifecycleModule.js';
export {
  assertProjectionIdentityTransition,
  buildProjectionIdentitySnapshot,
  type A2AProjectionIdentity,
  type AgUiProjectionIdentity,
  type CanonicalPiIdentity,
  type ChannelProjectionIdentity,
  type ProjectionIdentitySnapshot,
  type ProjectionIdentityTransitionMode,
} from './projectionIdentity.js';
export {
  PI_PROJECTION_RESPONSIBILITIES,
  PI_PROJECTION_SURFACES,
  PI_RUNTIME_FOUNDATION_BOUNDARY,
  PI_RUNTIME_RECORD_KINDS,
  type PiProjectionSurface,
  type PiRuntimeRecordKind,
  type ProjectionResponsibility,
} from './projectionResponsibilities.js';
export { TASK_STATES, isTaskActiveState, isTaskTerminalState, type TaskState } from './taskState.js';
export { mergeThreadPatchForEmit } from './threadEmission.js';
export { resolveThreadLifecyclePhase, type ThreadLifecyclePhase } from './threadLifecycle.js';
export {
  analyzeCycleProjectionThread,
  normalizeStaleOnboardingTask,
  projectCycleCommandThread,
  shouldPersistInputRequiredCheckpoint,
  type CycleProjectionDiagnostics,
} from './threadInvariants.js';
export {
  buildInterruptPauseTransition,
  buildNodeTransition,
  buildStateUpdate,
  buildTerminalTransition,
} from './transitionCommands.js';
