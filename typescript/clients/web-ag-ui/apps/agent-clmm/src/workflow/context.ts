import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import type { AIMessage as CopilotKitAIMessage } from '@copilotkit/shared';
import { type Artifact } from '@emberai/agent-node/workflow';
import { Annotation } from '@langchain/langgraph';
import {
  createMessageHistoryReducer,
  isTaskActiveState,
  isTaskTerminalState,
  mergeThreadPatchForEmit,
  normalizeStaleOnboardingTask,
  normalizeLegacyOnboardingState,
  resolveThreadLifecyclePhase,
  type OnboardingContract,
  type TaskState,
  type ThreadLifecyclePhase,
} from 'agent-workflow-core';
import { v7 as uuidv7 } from 'uuid';

import type { AccountingState } from '../accounting/types.js';
import {
  resolveAccountingHistoryLimit,
  resolvePollIntervalMs,
  resolveStateHistoryLimit,
  resolveStreamLimit,
} from '../config/constants.js';
import { createCheckpointer } from '../config/serviceConfig.js';
import {
  type CamelotPool,
  type FundingTokenInput,
  type OperatorConfigInput,
  type RebalanceTelemetry,
  type ResolvedOperatorConfig,
} from '../domain/types.js';

import { deriveClmmOnboardingFlow } from './onboardingFlow.js';

export type AgentMessage = CopilotKitAIMessage;

type ClmmMessage = Record<string, unknown> | string;
export const clmmMessagesReducer = createMessageHistoryReducer<ClmmMessage>(resolveStateHistoryLimit);

type CopilotkitState = {
  actions: Array<unknown>;
  context: Array<{ description: string; value: string }>;
};

export type ClmmSettings = {
  amount?: number;
};

export type ClmmPrivateState = {
  mode?: 'debug' | 'production';
  pollIntervalMs: number;
  streamLimit: number;
  cronScheduled: boolean;
  bootstrapped: boolean;
  suppressDuplicateCommand?: boolean;
  lastAppliedCommandMutationId?: string;
};

export type ClmmProfile = {
  agentIncome?: number;
  aum?: number;
  totalUsers?: number;
  apy?: number;
  chains?: string[];
  protocols?: string[];
  tokens?: string[];
  pools: CamelotPool[];
  allowedPools: CamelotPool[];
};

export type ClmmActivity = {
  telemetry: RebalanceTelemetry[];
  events: ClmmEvent[];
};

export type AgentTransaction = {
  cycle: number;
  action: string;
  txHash?: string;
  status: 'success' | 'failed';
  reason?: string;
  timestamp: string;
};

export type ClmmMetrics = {
  lastSnapshot?: CamelotPool;
  previousPrice?: number;
  cyclesSinceRebalance: number;
  staleCycles: number;
  rebalanceCycles?: number;
  iteration: number;
  latestCycle?: RebalanceTelemetry;
  aumUsd?: number;
  apy?: number;
  lifetimePnlUsd?: number;
  latestSnapshot?: {
    poolAddress?: `0x${string}`;
    totalUsd?: number;
    feesUsd?: number;
    feesApy?: number;
    timestamp?: string;
    positionOpenedAt?: string;
    positionTokens: Array<{
      address: `0x${string}`;
      symbol: string;
      decimals: number;
      amount?: number;
      amountBaseUnits?: string;
      valueUsd?: number;
    }>;
  };
};

export type ClmmAccounting = AccountingState;

export type TaskStatus = {
  state: TaskState;
  message?: AgentMessage;
  timestamp?: string; // ISO 8601
};

export type Task = {
  id: string;
  taskStatus: TaskStatus;
};

export type ClmmEvent =
  | { type: 'status'; message: string; task: Task }
  | { type: 'artifact'; artifact: Artifact; append?: boolean }
  | { type: 'dispatch-response'; parts: Array<{ kind: string; data: unknown }> };

export type OperatorInterrupt = {
  type: 'operator-config-request';
  message: string;
  payloadSchema: Record<string, unknown>;
  artifactId?: string;
};

export type FundingTokenOption = {
  address: `0x${string}`;
  symbol: string;
  decimals: number;
  balance: string; // base units (decimal string)
  valueUsd?: number;
};

export type FundingTokenInterrupt = {
  type: 'clmm-funding-token-request';
  message: string;
  payloadSchema: Record<string, unknown>;
  options: FundingTokenOption[];
};

export type DelegationCaveat = {
  enforcer: `0x${string}`;
  terms: `0x${string}`;
  args: `0x${string}`;
};

export type SignedDelegation = {
  delegate: `0x${string}`;
  delegator: `0x${string}`;
  authority: `0x${string}`;
  caveats: DelegationCaveat[];
  salt: `0x${string}`;
  signature: `0x${string}`;
};

export type UnsignedDelegation = Omit<SignedDelegation, 'signature'>;

export type DelegationIntentSummary = {
  target: `0x${string}`;
  selector: `0x${string}`;
  allowedCalldata: Array<{ startIndex: number; value: `0x${string}` }>;
};

export type DelegationBundle = {
  chainId: number;
  delegationManager: `0x${string}`;
  delegatorAddress: `0x${string}`;
  delegateeAddress: `0x${string}`;
  delegations: SignedDelegation[];
  intents: DelegationIntentSummary[];
  descriptions: string[];
  warnings: string[];
};

export type DelegationSigningInterrupt = {
  type: 'clmm-delegation-signing-request';
  message: string;
  payloadSchema: Record<string, unknown>;
  chainId: number;
  delegationManager: `0x${string}`;
  delegatorAddress: `0x${string}`;
  delegateeAddress: `0x${string}`;
  delegationsToSign: UnsignedDelegation[];
  descriptions: string[];
  warnings: string[];
};

export type OnboardingState = {
  step: number;
  key?: string;
};

export type ThreadLifecycle = {
  phase: ThreadLifecyclePhase;
  reason?: string;
  updatedAt?: string;
};

type ClmmThreadState = {
  lifecycle: ThreadLifecycle;
  lastAppliedClientMutationId?: string;
  task?: Task;
  poolArtifact?: Artifact;
  operatorInput?: OperatorConfigInput;
  onboarding?: OnboardingState;
  onboardingFlow?: OnboardingContract;
  fundingTokenInput?: FundingTokenInput;
  selectedPool?: CamelotPool;
  operatorConfig?: ResolvedOperatorConfig;
  delegationBundle?: DelegationBundle;
  haltReason?: string;
  executionError?: string;
  profile: ClmmProfile;
  activity: ClmmActivity;
  metrics: ClmmMetrics;
  transactionHistory: AgentTransaction[];
  accounting: ClmmAccounting;
  delegationsBypassActive?: boolean;
};

const ONBOARDING_KEY_PROGRESS: Record<string, number> = {
  setup: 1,
  'fund-wallet': 1.5,
  'funding-token': 2,
  'delegation-signing': 3,
};

const defaultSettingsState = (): ClmmSettings => ({
  amount: undefined,
});

const defaultPrivateState = (): ClmmPrivateState => ({
  mode: undefined,
  pollIntervalMs: resolvePollIntervalMs(),
  streamLimit: resolveStreamLimit(),
  cronScheduled: false,
  bootstrapped: false,
  suppressDuplicateCommand: false,
  lastAppliedCommandMutationId: undefined,
});

const defaultThreadState = (): ClmmThreadState => ({
  // Workflow state exposed to the UI
  lifecycle: {
    phase: 'prehire',
  },
  lastAppliedClientMutationId: undefined,
  task: undefined,
  poolArtifact: undefined,
  operatorInput: undefined,
  onboarding: undefined,
  onboardingFlow: undefined,
  fundingTokenInput: undefined,
  selectedPool: undefined,
  operatorConfig: undefined,
  haltReason: undefined,
  executionError: undefined,
  profile: {
    agentIncome: undefined,
    aum: undefined,
    totalUsers: undefined,
    apy: undefined,
    chains: [],
    protocols: [],
    tokens: [],
    pools: [],
    allowedPools: [],
  },
  activity: {
    telemetry: [],
    events: [],
  },
  metrics: {
    lastSnapshot: undefined,
    previousPrice: undefined,
    cyclesSinceRebalance: 0,
    staleCycles: 0,
    rebalanceCycles: 0,
    iteration: 0,
    latestCycle: undefined,
    aumUsd: undefined,
    apy: undefined,
    lifetimePnlUsd: undefined,
    latestSnapshot: undefined,
  },
  transactionHistory: [],
  accounting: {
    navSnapshots: [],
    flowLog: [],
    latestNavSnapshot: undefined,
    lastUpdated: undefined,
    lifecycleStart: undefined,
    lifecycleEnd: undefined,
    initialAllocationUsd: undefined,
    cashUsd: undefined,
    positionsUsd: undefined,
    aumUsd: undefined,
    lifetimePnlUsd: undefined,
    lifetimeReturnPct: undefined,
    highWaterMarkUsd: undefined,
    apy: undefined,
  },
});
export const createDefaultClmmThreadState = (): ClmmThreadState => defaultThreadState();

const STATE_HISTORY_LIMIT = resolveStateHistoryLimit();
const ACCOUNTING_HISTORY_LIMIT = resolveAccountingHistoryLimit();

const mergeSettings = (left: ClmmSettings, right?: Partial<ClmmSettings>): ClmmSettings => ({
  amount: right?.amount ?? left.amount,
});

const mergePrivateState = (
  left: ClmmPrivateState,
  right?: Partial<ClmmPrivateState>,
): ClmmPrivateState => ({
  mode: right?.mode ?? left.mode,
  pollIntervalMs: right?.pollIntervalMs ?? left.pollIntervalMs ?? resolvePollIntervalMs(),
  streamLimit: right?.streamLimit ?? left.streamLimit ?? resolveStreamLimit(),
  cronScheduled: right?.cronScheduled ?? left.cronScheduled ?? false,
  bootstrapped: right?.bootstrapped ?? left.bootstrapped ?? false,
  suppressDuplicateCommand: right?.suppressDuplicateCommand ?? left.suppressDuplicateCommand ?? false,
  lastAppliedCommandMutationId:
    right?.lastAppliedCommandMutationId ?? left.lastAppliedCommandMutationId,
});

const mergeAppendOrReplace = <T>(left: T[], right?: T[]): T[] => {
  if (!right) {
    return left;
  }
  if (right.length === 0) {
    return left;
  }
  if (right === left) {
    return left;
  }
  if (right.length >= left.length) {
    let isPrefix = true;
    for (let index = 0; index < left.length; index += 1) {
      if (right[index] !== left[index]) {
        isPrefix = false;
        break;
      }
    }
    if (isPrefix) {
      return right;
    }
  }
  return [...left, ...right];
};

const limitHistory = <T>(items: T[], limit: number): T[] => {
  if (limit <= 0 || items.length <= limit) {
    return items;
  }
  return items.slice(-limit);
};

const isHireSubmittedTask = (task: Task | undefined): boolean => {
  if (!task || task.taskStatus.state !== 'submitted') {
    return false;
  }
  const message = task.taskStatus.message;
  const content = message ? message.content : undefined;
  const messageText = typeof content === 'string' ? content : undefined;
  return typeof messageText === 'string' && messageText.startsWith('Agent hired!');
};

const resetThreadForNewHire = (thread: ClmmThreadState): ClmmThreadState => ({
  ...defaultThreadState(),
  delegationsBypassActive: thread.delegationsBypassActive,
});

const resolveOnboardingProgress = (onboarding: OnboardingState | undefined): number => {
  if (!onboarding) {
    return 0;
  }
  const keyProgress =
    typeof onboarding.key === 'string' ? (ONBOARDING_KEY_PROGRESS[onboarding.key] ?? 0) : 0;
  return Math.max(onboarding.step, keyProgress);
};

const resolveMonotonicOnboardingState = (
  previous: OnboardingState | undefined,
  incoming: OnboardingState | undefined,
): OnboardingState | undefined => {
  if (!previous || !incoming) {
    return incoming ?? previous;
  }
  if (resolveOnboardingProgress(incoming) < resolveOnboardingProgress(previous)) {
    return previous;
  }
  return incoming;
};

const shouldPreserveOnboardingInputRequiredTask = (params: {
  previousTask: Task | undefined;
  incomingTask: Task | undefined;
  previousOnboarding: OnboardingState | undefined;
  incomingOnboarding: OnboardingState | undefined;
  onboardingFlowStatus: OnboardingContract['status'] | undefined;
  previousOperatorInput: OperatorConfigInput | undefined;
  incomingOperatorInput: OperatorConfigInput | undefined;
  previousFundingTokenInput: FundingTokenInput | undefined;
  incomingFundingTokenInput: FundingTokenInput | undefined;
  previousDelegationBundle: DelegationBundle | undefined;
  incomingDelegationBundle: DelegationBundle | undefined;
  previousOperatorConfig: ResolvedOperatorConfig | undefined;
  incomingOperatorConfig: ResolvedOperatorConfig | undefined;
}): boolean => {
  const previousTaskState = params.previousTask?.taskStatus?.state;
  const incomingTaskState = params.incomingTask?.taskStatus?.state;
  if (previousTaskState !== 'input-required' || incomingTaskState !== 'working') {
    return false;
  }
  if (params.onboardingFlowStatus === 'completed') {
    return false;
  }

  const previousOnboardingProgress = resolveOnboardingProgress(params.previousOnboarding);
  const incomingOnboardingProgress = resolveOnboardingProgress(params.incomingOnboarding);
  const hasOnboardingForwardProgress = incomingOnboardingProgress > previousOnboardingProgress;
  if (hasOnboardingForwardProgress) {
    return false;
  }

  const hasDomainForwardProgress =
    (!params.previousOperatorInput && Boolean(params.incomingOperatorInput)) ||
    (!params.previousFundingTokenInput && Boolean(params.incomingFundingTokenInput)) ||
    (!params.previousDelegationBundle && Boolean(params.incomingDelegationBundle)) ||
    (!params.previousOperatorConfig && Boolean(params.incomingOperatorConfig));

  return !hasDomainForwardProgress;
};

const mergeThreadState = (left: ClmmThreadState, right?: Partial<ClmmThreadState>): ClmmThreadState => {
  if (!right) {
    return left;
  }
  const baseThread =
    right.lifecycle?.phase === 'onboarding' && isHireSubmittedTask(right.task)
      ? resetThreadForNewHire(left)
      : left;
  const incomingOnboarding = right.onboarding ?? baseThread.onboarding;
  const nextOnboarding = resolveMonotonicOnboardingState(baseThread.onboarding, incomingOnboarding);
  const nextOperatorConfig = right.operatorConfig ?? baseThread.operatorConfig;
  const nextDelegationBundle = right.delegationBundle ?? baseThread.delegationBundle;
  const nextOperatorInput = right.operatorInput ?? baseThread.operatorInput;
  const nextFundingTokenInput = right.fundingTokenInput ?? baseThread.fundingTokenInput;
  const incomingTask = right.task ?? baseThread.task;
  const nextDelegationsBypassActive =
    right.delegationsBypassActive ?? baseThread.delegationsBypassActive;
  const nextOnboardingFlow = deriveClmmOnboardingFlow({
    onboarding: nextOnboarding,
    previous: baseThread.onboardingFlow,
    setupComplete: Boolean(nextOperatorConfig),
    taskState: incomingTask?.taskStatus?.state,
    delegationsBypassActive: nextDelegationsBypassActive === true,
  });
  const nextTask = shouldPreserveOnboardingInputRequiredTask({
    previousTask: baseThread.task,
    incomingTask,
    previousOnboarding: baseThread.onboarding,
    incomingOnboarding: nextOnboarding,
    onboardingFlowStatus: nextOnboardingFlow?.status,
    previousOperatorInput: baseThread.operatorInput,
    incomingOperatorInput: nextOperatorInput,
    previousFundingTokenInput: baseThread.fundingTokenInput,
    incomingFundingTokenInput: nextFundingTokenInput,
    previousDelegationBundle: baseThread.delegationBundle,
    incomingDelegationBundle: nextDelegationBundle,
    previousOperatorConfig: baseThread.operatorConfig,
    incomingOperatorConfig: nextOperatorConfig,
  })
    ? baseThread.task
    : incomingTask;
  const normalizedOnboarding = normalizeLegacyOnboardingState({
    onboarding: nextOnboarding,
    onboardingFlow: nextOnboardingFlow,
  });
  const normalizedTaskProjection = normalizeStaleOnboardingTask({
    thread: {
      onboardingFlow: nextOnboardingFlow,
      operatorConfig: nextOperatorConfig,
      delegationBundle: nextDelegationBundle,
      task: nextTask,
    },
    completedMessage: 'Onboarding complete. CLMM strategy is active.',
  });
  const normalizedTask = (normalizedTaskProjection as { task?: Task }).task ?? nextTask;
  const effectiveOnboarding =
    nextOnboardingFlow?.status === 'completed' ? undefined : normalizedOnboarding;

  const nextTelemetry = limitHistory(
    mergeAppendOrReplace(baseThread.activity.telemetry, right.activity?.telemetry),
    STATE_HISTORY_LIMIT,
  );
  const nextEvents = limitHistory(
    mergeAppendOrReplace(baseThread.activity.events, right.activity?.events),
    STATE_HISTORY_LIMIT,
  );
  const nextTransactions = limitHistory(
    mergeAppendOrReplace(baseThread.transactionHistory, right.transactionHistory),
    STATE_HISTORY_LIMIT,
  );
  const nextProfile: ClmmProfile = {
    agentIncome: right.profile?.agentIncome ?? baseThread.profile.agentIncome,
    aum: right.profile?.aum ?? baseThread.profile.aum,
    totalUsers: right.profile?.totalUsers ?? baseThread.profile.totalUsers,
    apy: right.profile?.apy ?? baseThread.profile.apy,
    chains: right.profile?.chains ?? baseThread.profile.chains,
    protocols: right.profile?.protocols ?? baseThread.profile.protocols,
    tokens: right.profile?.tokens ?? baseThread.profile.tokens,
    pools: right.profile?.pools ?? baseThread.profile.pools,
    allowedPools: right.profile?.allowedPools ?? baseThread.profile.allowedPools,
  };
  const nextMetrics: ClmmMetrics = {
    lastSnapshot: right.metrics?.lastSnapshot ?? baseThread.metrics.lastSnapshot,
    previousPrice: right.metrics?.previousPrice ?? baseThread.metrics.previousPrice,
    cyclesSinceRebalance:
      right.metrics?.cyclesSinceRebalance ?? baseThread.metrics.cyclesSinceRebalance ?? 0,
    staleCycles: right.metrics?.staleCycles ?? baseThread.metrics.staleCycles ?? 0,
    rebalanceCycles: right.metrics?.rebalanceCycles ?? baseThread.metrics.rebalanceCycles ?? 0,
    iteration: right.metrics?.iteration ?? baseThread.metrics.iteration ?? 0,
    latestCycle: right.metrics?.latestCycle ?? baseThread.metrics.latestCycle,
    aumUsd: right.metrics?.aumUsd ?? baseThread.metrics.aumUsd,
    apy: right.metrics?.apy ?? baseThread.metrics.apy,
    lifetimePnlUsd: right.metrics?.lifetimePnlUsd ?? baseThread.metrics.lifetimePnlUsd,
    latestSnapshot: right.metrics?.latestSnapshot ?? baseThread.metrics.latestSnapshot,
  };
  const nextAccounting: ClmmAccounting = {
    navSnapshots: limitHistory(
      mergeAppendOrReplace(baseThread.accounting.navSnapshots, right.accounting?.navSnapshots),
      ACCOUNTING_HISTORY_LIMIT,
    ),
    flowLog: limitHistory(
      mergeAppendOrReplace(baseThread.accounting.flowLog, right.accounting?.flowLog),
      ACCOUNTING_HISTORY_LIMIT,
    ),
    latestNavSnapshot: right.accounting?.latestNavSnapshot ?? baseThread.accounting.latestNavSnapshot,
    lastUpdated: right.accounting?.lastUpdated ?? baseThread.accounting.lastUpdated,
    lifecycleStart: right.accounting?.lifecycleStart ?? baseThread.accounting.lifecycleStart,
    lifecycleEnd: right.accounting?.lifecycleEnd ?? baseThread.accounting.lifecycleEnd,
    initialAllocationUsd:
      right.accounting?.initialAllocationUsd ?? baseThread.accounting.initialAllocationUsd,
    cashUsd: right.accounting?.cashUsd ?? baseThread.accounting.cashUsd,
    positionsUsd: right.accounting?.positionsUsd ?? baseThread.accounting.positionsUsd,
    aumUsd: right.accounting?.aumUsd ?? baseThread.accounting.aumUsd,
    lifetimePnlUsd: right.accounting?.lifetimePnlUsd ?? baseThread.accounting.lifetimePnlUsd,
    lifetimeReturnPct:
      right.accounting?.lifetimeReturnPct ?? baseThread.accounting.lifetimeReturnPct,
    highWaterMarkUsd: right.accounting?.highWaterMarkUsd ?? baseThread.accounting.highWaterMarkUsd,
    apy: right.accounting?.apy ?? baseThread.accounting.apy,
  };
  const explicitLifecyclePhase = right.lifecycle?.phase;
  const nextLifecyclePhase = resolveThreadLifecyclePhase({
    previousPhase: baseThread.lifecycle?.phase,
    taskState: normalizedTask?.taskStatus?.state,
    onboardingFlowStatus: nextOnboardingFlow?.status,
    onboardingStep: effectiveOnboarding?.step,
    explicitLifecyclePhase,
    hasOperatorConfig: Boolean(nextOperatorConfig),
    hasDelegationBundle: Boolean(nextDelegationBundle),
    fireRequested: explicitLifecyclePhase === 'firing',
  });
  const nextLifecycle: ThreadLifecycle = {
    phase: nextLifecyclePhase,
    reason: right.lifecycle?.reason ?? baseThread.lifecycle?.reason,
    updatedAt: right.lifecycle?.updatedAt ?? baseThread.lifecycle?.updatedAt,
  };

  return {
    ...baseThread,
    ...right,
    lifecycle: nextLifecycle,
    task: normalizedTask,
    poolArtifact: right.poolArtifact ?? baseThread.poolArtifact,
    operatorInput: nextOperatorInput,
    onboarding: effectiveOnboarding,
    onboardingFlow: nextOnboardingFlow,
    fundingTokenInput: nextFundingTokenInput,
    selectedPool: right.selectedPool ?? baseThread.selectedPool,
    operatorConfig: nextOperatorConfig,
    delegationBundle: nextDelegationBundle,
    haltReason: right.haltReason ?? baseThread.haltReason,
    executionError: right.executionError ?? baseThread.executionError,
    delegationsBypassActive: nextDelegationsBypassActive,
    profile: nextProfile,
    activity: {
      telemetry: nextTelemetry,
      events: nextEvents,
    },
    metrics: nextMetrics,
    transactionHistory: nextTransactions,
    accounting: nextAccounting,
  };
};

type ClmmThreadTransitionLogSource = 'threadReducer' | 'applyThreadPatch';

type ClmmThreadTransitionSnapshot = {
  lifecyclePhase: ThreadLifecyclePhase;
  taskId?: string;
  taskState?: TaskState;
  taskTimestamp?: string;
  taskMessage?: string;
  onboardingStep?: number;
  onboardingKey?: string;
  selectedPoolAddress?: `0x${string}`;
  haltReason?: string;
  executionError?: string;
  delegationsBypassActive: boolean;
  metricsIteration: number;
  eventCount: number;
  telemetryCount: number;
  transactionCount: number;
  accountingFlowCount: number;
  accountingNavCount: number;
};

type ClmmThreadTransitionLogEntry = {
  timestamp: string;
  source: ClmmThreadTransitionLogSource;
  changedFields: string[];
  patchKeys: string[];
  previous: ClmmThreadTransitionSnapshot;
  next: ClmmThreadTransitionSnapshot;
  patch?: Partial<ClmmThreadState>;
};

const CLMM_STATE_TRANSITION_LOG_DEFAULT_PATH = './.logs/clmm-state-transitions.ndjson';

const clmmTransitionSnapshotKeys: Array<keyof ClmmThreadTransitionSnapshot> = [
  'lifecyclePhase',
  'taskId',
  'taskState',
  'taskTimestamp',
  'taskMessage',
  'onboardingStep',
  'onboardingKey',
  'selectedPoolAddress',
  'haltReason',
  'executionError',
  'delegationsBypassActive',
  'metricsIteration',
  'eventCount',
  'telemetryCount',
  'transactionCount',
  'accountingFlowCount',
  'accountingNavCount',
];

let hasWarnedTransitionLogFailure = false;

const isClmmTransitionLogEnabled = (): boolean =>
  process.env['CLMM_STATE_TRANSITION_LOG_ENABLED'] === 'true';

const shouldIncludeFullPatch = (): boolean =>
  process.env['CLMM_STATE_TRANSITION_LOG_INCLUDE_FULL_PATCH'] === 'true';

const resolveClmmTransitionLogPath = (): string =>
  resolve(process.env['CLMM_STATE_TRANSITION_LOG_PATH'] ?? CLMM_STATE_TRANSITION_LOG_DEFAULT_PATH);

const asTaskMessageText = (message: AgentMessage | undefined): string | undefined => {
  if (!message) {
    return undefined;
  }
  if (typeof message.content === 'string') {
    return message.content;
  }
  return undefined;
};

const summarizeThreadForTransitionLog = (thread: ClmmThreadState): ClmmThreadTransitionSnapshot => ({
  lifecyclePhase: thread.lifecycle?.phase ?? 'prehire',
  taskId: thread.task?.id,
  taskState: thread.task?.taskStatus?.state,
  taskTimestamp: thread.task?.taskStatus?.timestamp,
  taskMessage: asTaskMessageText(thread.task?.taskStatus?.message),
  onboardingStep: thread.onboarding?.step,
  onboardingKey: thread.onboarding?.key,
  selectedPoolAddress: thread.selectedPool?.address,
  haltReason: thread.haltReason,
  executionError: thread.executionError,
  delegationsBypassActive: thread.delegationsBypassActive === true,
  metricsIteration: thread.metrics.iteration,
  eventCount: thread.activity.events.length,
  telemetryCount: thread.activity.telemetry.length,
  transactionCount: thread.transactionHistory.length,
  accountingFlowCount: thread.accounting.flowLog.length,
  accountingNavCount: thread.accounting.navSnapshots.length,
});

const computeTransitionChangedFields = (
  previous: ClmmThreadTransitionSnapshot,
  next: ClmmThreadTransitionSnapshot,
): string[] =>
  clmmTransitionSnapshotKeys.filter((key) => previous[key] !== next[key]).map(String);

const patchKeys = (patch?: Partial<ClmmThreadState>): string[] =>
  patch ? Object.keys(patch).sort() : [];

const warnTransitionLogFailure = (error: unknown): void => {
  if (hasWarnedTransitionLogFailure) {
    return;
  }
  hasWarnedTransitionLogFailure = true;
  const message = error instanceof Error ? error.message : String(error);
  console.warn('[CamelotCLMM] Failed to write state transition log', { message });
};

export const logClmmThreadTransition = (params: {
  source: ClmmThreadTransitionLogSource;
  previousThread: ClmmThreadState;
  nextThread: ClmmThreadState;
  patchThread?: Partial<ClmmThreadState>;
}): void => {
  if (!isClmmTransitionLogEnabled()) {
    return;
  }

  const previous = summarizeThreadForTransitionLog(params.previousThread);
  const next = summarizeThreadForTransitionLog(params.nextThread);
  const changedFields = computeTransitionChangedFields(previous, next);
  if (changedFields.length === 0) {
    return;
  }

  const entry: ClmmThreadTransitionLogEntry = {
    timestamp: new Date().toISOString(),
    source: params.source,
    changedFields,
    patchKeys: patchKeys(params.patchThread),
    previous,
    next,
  };
  if (shouldIncludeFullPatch() && params.patchThread) {
    entry.patch = params.patchThread;
  }

  const logPath = resolveClmmTransitionLogPath();
  try {
    mkdirSync(dirname(logPath), { recursive: true });
    appendFileSync(logPath, `${JSON.stringify(entry)}\n`, 'utf8');
  } catch (error: unknown) {
    warnTransitionLogFailure(error);
  }
};

const reduceThreadState = (left: ClmmThreadState, right?: Partial<ClmmThreadState>): ClmmThreadState => {
  const next = mergeThreadState(left, right);
  logClmmThreadTransition({
    source: 'threadReducer',
    previousThread: left,
    nextThread: next,
    patchThread: right,
  });
  return next;
};

export const reduceThreadStateForTest = (
  left: ClmmThreadState,
  right?: Partial<ClmmThreadState>,
): ClmmThreadState => reduceThreadState(left, right);

const mergeCopilotkit = (
  left: CopilotkitState,
  right?: Partial<CopilotkitState>,
): CopilotkitState => ({
  actions: right?.actions ?? left.actions ?? [],
  context: right?.context ?? left.context ?? [],
});

export const ClmmStateAnnotation = Annotation.Root({
  messages: Annotation<ClmmMessage[], ClmmMessage | ClmmMessage[]>({
    default: () => [],
    reducer: clmmMessagesReducer,
  }),
  copilotkit: Annotation<CopilotkitState, Partial<CopilotkitState>>({
    default: () => ({ actions: [], context: [] }),
    reducer: (left, right) => mergeCopilotkit(left ?? { actions: [], context: [] }, right),
  }),
  settings: Annotation<ClmmSettings, Partial<ClmmSettings>>({
    default: defaultSettingsState,
    reducer: (left, right) => mergeSettings(left ?? defaultSettingsState(), right),
  }),
  private: Annotation<ClmmPrivateState, Partial<ClmmPrivateState>>({
    default: defaultPrivateState,
    reducer: (left, right) => mergePrivateState(left ?? defaultPrivateState(), right),
  }),
  thread: Annotation<ClmmThreadState, Partial<ClmmThreadState>>({
    default: defaultThreadState,
    reducer: (left, right) => reduceThreadState(left ?? defaultThreadState(), right),
  }),
});

export type ClmmState = typeof ClmmStateAnnotation.State;
export type ClmmUpdate = typeof ClmmStateAnnotation.Update;

export const applyThreadPatch = (state: ClmmState, patch: Partial<ClmmThreadState>): ClmmThreadState => {
  const previousThread = state.thread;
  const mergedView = mergeThreadPatchForEmit({
    currentThread: state.thread,
    patchThread: patch,
    mergeWithInvariants: (currentThread, patchThread) => {
      const hydratedCurrentView = mergeThreadState(defaultThreadState(), currentThread);
      return mergeThreadState(hydratedCurrentView, patchThread);
    },
  });
  state.thread = mergedView;
  logClmmThreadTransition({
    source: 'applyThreadPatch',
    previousThread,
    nextThread: mergedView,
    patchThread: patch,
  });
  return mergedView;
};

export const memory = createCheckpointer();

function buildAgentMessage(message: string): AgentMessage {
  return {
    id: uuidv7(),
    role: 'assistant',
    content: message,
  };
}

export function buildTaskStatus(
  task: Task | undefined,
  state: TaskState,
  message: string,
): { task: Task; statusEvent: ClmmEvent } {
  const timestamp = new Date().toISOString();
  const nextTask: Task = {
    id: task?.id ?? uuidv7(),
    taskStatus: {
      state,
      message: buildAgentMessage(message),
      timestamp,
    },
  };

  const statusEvent: ClmmEvent = {
    type: 'status',
    message,
    task: nextTask,
  };

  return { task: nextTask, statusEvent };
}

export type LogOptions = {
  detailed?: boolean;
  force?: boolean;
};

type AgentLogLevel = 'debug' | 'info' | 'warn' | 'error' | 'silent';

const LOG_LEVEL_WEIGHT: Record<AgentLogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  silent: 50,
};

function resolveAgentLogLevel(): AgentLogLevel {
  const raw =
    process.env['CLMM_LOG_LEVEL'] ?? process.env['AGENT_LOG_LEVEL'] ?? process.env['LOG_LEVEL'];
  switch (raw) {
    case 'debug':
    case 'info':
    case 'warn':
    case 'error':
    case 'silent':
      return raw;
    default:
      return 'info';
  }
}

function shouldLogInfo(options?: LogOptions): boolean {
  if (options?.force) {
    return true;
  }
  return LOG_LEVEL_WEIGHT[resolveAgentLogLevel()] <= LOG_LEVEL_WEIGHT.info;
}

export function logInfo(message: string, metadata?: Record<string, unknown>, options?: LogOptions) {
  if (!shouldLogInfo(options)) {
    return;
  }
  const timestamp = new Date().toISOString();
  const prefix = `[CamelotCLMM][${timestamp}]`;
  if (metadata && Object.keys(metadata).length > 0) {
    if (options?.detailed) {
      console.info(`${prefix} ${message}`);
      // eslint-disable-next-line no-console
      console.dir(metadata, { depth: null });
      return;
    }
    console.info(`${prefix} ${message}`, metadata);
    return;
  }
  console.info(`${prefix} ${message}`);
}

export function normalizeHexAddress(value: string, label: string): `0x${string}` {
  if (!value.startsWith('0x')) {
    throw new Error(`Invalid ${label}: ${value}`);
  }
  return value as `0x${string}`;
}

export const isTaskTerminal = (state: TaskState) => isTaskTerminalState(state);

export const isTaskActive = (state: TaskState) => isTaskActiveState(state);
