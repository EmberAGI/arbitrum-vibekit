import type { AIMessage as CopilotKitAIMessage } from '@copilotkit/shared';
import { type Artifact } from '@emberai/agent-node/workflow';
import { Annotation } from '@langchain/langgraph';
import {
  createMessageHistoryReducer,
  isTaskActiveState,
  isTaskTerminalState,
  mergeViewPatchForEmit,
  type AgentCommand,
  type OnboardingContract,
  type TaskState,
} from 'agent-workflow-core';
import { v7 as uuidv7 } from 'uuid';

import {
  resolvePollIntervalMs,
  resolveStateHistoryLimit,
  resolveStreamLimit,
} from '../config/constants.js';
import { createCheckpointer } from '../config/serviceConfig.js';
import type {
  CamelotPool,
  FundingTokenInput,
  OperatorConfigInput,
  RebalanceTelemetry,
  ResolvedOperatorConfig,
} from '../domain/types.js';

import { deriveStarterOnboardingFlow } from './onboardingFlow.js';

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
  iteration: number;
  latestCycle?: RebalanceTelemetry;
};

export type TaskStatus = {
  state: TaskState;
  message?: AgentMessage;
  timestamp?: string;
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
  balance: string;
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

type ClmmViewState = {
  command?: AgentCommand;
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
  delegationsBypassActive?: boolean;
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
});

const defaultViewState = (): ClmmViewState => ({
  command: undefined,
  lastAppliedClientMutationId: undefined,
  task: undefined,
  poolArtifact: undefined,
  operatorInput: undefined,
  onboarding: undefined,
  onboardingFlow: undefined,
  fundingTokenInput: undefined,
  selectedPool: undefined,
  operatorConfig: undefined,
  delegationBundle: undefined,
  haltReason: undefined,
  executionError: undefined,
  delegationsBypassActive: undefined,
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
    iteration: 0,
    latestCycle: undefined,
  },
  transactionHistory: [],
});

const STATE_HISTORY_LIMIT = resolveStateHistoryLimit();

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

const mergeViewState = (left: ClmmViewState, right?: Partial<ClmmViewState>): ClmmViewState => {
  if (!right) {
    return left;
  }
  const nextTask = right.task ?? left.task;
  const nextOnboarding = right.onboarding ?? left.onboarding;
  const nextOperatorConfig = right.operatorConfig ?? left.operatorConfig;
  const nextDelegationsBypassActive = right.delegationsBypassActive ?? left.delegationsBypassActive;
  const nextOnboardingFlow = deriveStarterOnboardingFlow({
    onboarding: nextOnboarding,
    previous: left.onboardingFlow,
    setupComplete: Boolean(nextOperatorConfig),
    taskState: nextTask?.taskStatus?.state,
    delegationsBypassActive: nextDelegationsBypassActive === true,
  });

  const nextTelemetry = limitHistory(
    mergeAppendOrReplace(left.activity.telemetry, right.activity?.telemetry),
    STATE_HISTORY_LIMIT,
  );
  const nextEvents = limitHistory(
    mergeAppendOrReplace(left.activity.events, right.activity?.events),
    STATE_HISTORY_LIMIT,
  );
  const nextTransactions = limitHistory(
    mergeAppendOrReplace(left.transactionHistory, right.transactionHistory),
    STATE_HISTORY_LIMIT,
  );
  const nextProfile: ClmmProfile = {
    agentIncome: right.profile?.agentIncome ?? left.profile.agentIncome,
    aum: right.profile?.aum ?? left.profile.aum,
    totalUsers: right.profile?.totalUsers ?? left.profile.totalUsers,
    apy: right.profile?.apy ?? left.profile.apy,
    chains: right.profile?.chains ?? left.profile.chains,
    protocols: right.profile?.protocols ?? left.profile.protocols,
    tokens: right.profile?.tokens ?? left.profile.tokens,
    pools: right.profile?.pools ?? left.profile.pools,
    allowedPools: right.profile?.allowedPools ?? left.profile.allowedPools,
  };
  const nextMetrics: ClmmMetrics = {
    lastSnapshot: right.metrics?.lastSnapshot ?? left.metrics.lastSnapshot,
    previousPrice: right.metrics?.previousPrice ?? left.metrics.previousPrice,
    cyclesSinceRebalance: right.metrics?.cyclesSinceRebalance ?? left.metrics.cyclesSinceRebalance,
    staleCycles: right.metrics?.staleCycles ?? left.metrics.staleCycles,
    iteration: right.metrics?.iteration ?? left.metrics.iteration,
    latestCycle: right.metrics?.latestCycle ?? left.metrics.latestCycle,
  };

  return {
    ...left,
    ...right,
    command: right.command ?? left.command,
    task: nextTask,
    poolArtifact: right.poolArtifact ?? left.poolArtifact,
    operatorInput: right.operatorInput ?? left.operatorInput,
    onboarding: nextOnboarding,
    onboardingFlow: nextOnboardingFlow,
    fundingTokenInput: right.fundingTokenInput ?? left.fundingTokenInput,
    selectedPool: right.selectedPool ?? left.selectedPool,
    operatorConfig: nextOperatorConfig,
    delegationBundle: right.delegationBundle ?? left.delegationBundle,
    haltReason: right.haltReason ?? left.haltReason,
    executionError: right.executionError ?? left.executionError,
    delegationsBypassActive: nextDelegationsBypassActive,
    profile: nextProfile,
    activity: {
      telemetry: nextTelemetry,
      events: nextEvents,
    },
    metrics: nextMetrics,
    transactionHistory: nextTransactions,
  };
};

const mergeCopilotkit = (left: CopilotkitState, right?: Partial<CopilotkitState>): CopilotkitState => ({
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
  view: Annotation<ClmmViewState, Partial<ClmmViewState>>({
    default: defaultViewState,
    reducer: (left, right) => mergeViewState(left ?? defaultViewState(), right),
  }),
});

export type ClmmState = typeof ClmmStateAnnotation.State;
export type ClmmUpdate = typeof ClmmStateAnnotation.Update;

export const applyViewPatch = (state: ClmmState, patch: Partial<ClmmViewState>): ClmmViewState => {
  const mergedView = mergeViewPatchForEmit({
    currentView: state.view,
    patchView: patch,
    mergeWithInvariants: (currentView, patchView) => {
      const hydratedCurrentView = mergeViewState(defaultViewState(), currentView);
      return mergeViewState(hydratedCurrentView, patchView);
    },
  });
  state.view = mergedView;
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
};

export function logInfo(message: string, metadata?: Record<string, unknown>, options?: LogOptions) {
  const timestamp = new Date().toISOString();
  const prefix = `[MockCLMM][${timestamp}]`;
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
