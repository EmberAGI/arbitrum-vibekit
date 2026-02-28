import {
  defaultActivity,
  defaultMetrics,
  defaultProfile,
  type ThreadLifecyclePhase,
  type ThreadState,
  type UiRuntimeState,
  type UiState,
} from '../types/agent';
import { deriveTaskStateForUi } from './deriveTaskStateForUi';

const ensureArray = <T>(value: T[] | undefined | null): T[] => (Array.isArray(value) ? value : []);

function cloneProfile(profile: ThreadState['profile'] | undefined): UiState['profile'] {
  const resolved = profile ?? defaultProfile;
  return {
    ...resolved,
    chains: [...ensureArray(resolved.chains)],
    protocols: [...ensureArray(resolved.protocols)],
    tokens: [...ensureArray(resolved.tokens)],
    pools: [...ensureArray(resolved.pools)],
    allowedPools: [...ensureArray(resolved.allowedPools)],
  };
}

function cloneActivity(activity: ThreadState['activity'] | undefined): UiState['activity'] {
  const resolved = activity ?? defaultActivity;
  return {
    ...resolved,
    telemetry: [...ensureArray(resolved.telemetry)],
    events: [...ensureArray(resolved.events)],
  };
}

function extractTaskMessage(threadState: ThreadState): string | null {
  const message = threadState.task?.taskStatus?.message;
  if (typeof message !== 'object' || message === null) return null;
  if (!('content' in message)) return null;
  const content = (message as { content?: unknown }).content;
  return typeof content === 'string' ? content : null;
}

function resolveOnboardingActive(params: {
  onboardingStatus?: 'in_progress' | 'completed' | 'failed' | 'canceled';
  effectiveTaskState: string | null;
}): boolean {
  if (params.onboardingStatus === 'in_progress') return true;
  if (
    params.onboardingStatus === 'completed' ||
    params.onboardingStatus === 'failed' ||
    params.onboardingStatus === 'canceled'
  ) {
    return false;
  }
  return params.effectiveTaskState === 'input-required';
}

export function deriveUiState(params: {
  threadState: ThreadState;
  runtime: UiRuntimeState;
}): UiState {
  const { threadState, runtime } = params;
  const metrics = threadState.metrics ?? defaultMetrics;
  const lifecyclePhase = (threadState.lifecycle?.phase ?? null) as ThreadLifecyclePhase | null;
  const effectiveTaskState = deriveTaskStateForUi({
    lifecyclePhase,
    taskState: threadState.task?.taskStatus?.state ?? null,
    taskMessage: extractTaskMessage(threadState),
  }) ?? null;
  const isHired =
    lifecyclePhase === 'onboarding' || lifecyclePhase === 'active' || lifecyclePhase === 'firing';
  const isOnboardingActive = resolveOnboardingActive({
    onboardingStatus: threadState.onboardingFlow?.status,
    effectiveTaskState,
  });
  const isActive =
    effectiveTaskState === 'submitted' ||
    effectiveTaskState === 'working' ||
    effectiveTaskState === 'input-required' ||
    threadState.onboardingFlow?.status === 'in_progress' ||
    runtime.commandInFlight ||
    runtime.syncPending;

  return {
    lifecycle: threadState.lifecycle,
    task: threadState.task,
    onboardingFlow: threadState.onboardingFlow,
    poolArtifact: threadState.poolArtifact,
    operatorInput: threadState.operatorInput,
    fundingTokenInput: threadState.fundingTokenInput,
    selectedPool: threadState.selectedPool,
    operatorConfig: threadState.operatorConfig,
    delegationBundle: threadState.delegationBundle,
    haltReason: threadState.haltReason,
    executionError: threadState.executionError,
    delegationsBypassActive: threadState.delegationsBypassActive,
    profile: cloneProfile(threadState.profile),
    activity: cloneActivity(threadState.activity),
    metrics: { ...metrics },
    transactionHistory: [...ensureArray(threadState.transactionHistory)],
    runtime: { ...runtime },
    selectors: {
      lifecyclePhase,
      effectiveTaskState,
      isHired,
      isActive,
      isOnboardingActive,
    },
  };
}
