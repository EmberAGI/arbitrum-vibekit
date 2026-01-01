import type { AIMessage as CopilotKitAIMessage } from '@copilotkit/shared';
import type { CopilotKitState } from '@copilotkit/sdk-js/langgraph';
import { type Artifact } from '@emberai/agent-node/workflow';
import { Annotation, MemorySaver, messagesStateReducer } from '@langchain/langgraph';
import type { Messages } from '@langchain/langgraph';
import { v7 as uuidv7 } from 'uuid';
import { resolvePollIntervalMs, resolveStreamLimit } from '../config/constants.js';

import type {
  OrderType,
  PositionDirection,
  DecreaseSwapType,
  GMXOrderParams,
} from '../domain/types.ts';

export type AgentMessage = CopilotKitAIMessage;

type CopilotState = CopilotKitState;

export type GMXSettings = {
  amount?: number;
};

/* ============================
   Runtime State
   ============================ */
export type GMXPrivateState = {
  mode?: 'debug' | 'production';
  pollIntervalMs: number;
  streamLimit: number;
  cronScheduled: boolean;
};

/* ============================
   Positions and Trades Tracking
   ============================ */

export type GMXPositionView = {
  marketAddress: `0x${string}`;
  direction: PositionDirection;
  sizeUsd: string;
  entryPrice: string;
  markPrice?: string;
  unrealizedPnlUsd?: string;
};

export type GMXTradeLog = {
  action: 'open-position' | 'close-position';
  txHash?: string;
  sizeUsd?: string;
  direction?: PositionDirection;
  reason: string;
  timestamp: string;
};
/* ============================
   UI State
   ============================ */

export type GMXViewState = {
  command?: string;
  lastOrder?: GMXOrderParams;
  position?: GMXPositionView;
  trades: GMXTradeLog[];
  haltReason?: string;
  executionError?: string;
};

/* ============================
   Delegations & Caveats
   ============================ */
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

/* ============================
   Default States
   ============================ */

const defaultPrivateState = (): GMXPrivateState => ({
  mode: undefined,
  pollIntervalMs: resolvePollIntervalMs(),
  streamLimit: resolveStreamLimit(),
  cronScheduled: false,
  bootstrapped: false,
});

const defaultViewState = (): GMXViewState => ({
  trades: [],
});

const defaultSettingsState = (): GMXSettings => ({
  amount: undefined,
});


/* ============================
   Merge Helpers
   ============================ */

const mergePrivateState = (
  left: GMXPrivateState,
  right?: Partial<GMXPrivateState>,
): GMXPrivateState => ({
  mode: right?.mode ?? left.mode,
  pollIntervalMs: right?.pollIntervalMs ?? left.pollIntervalMs ?? resolvePollIntervalMs(),
  streamLimit: right?.streamLimit ?? left.streamLimit ?? resolveStreamLimit(),
  cronScheduled: right?.cronScheduled ?? left.cronScheduled ?? false,
  bootstrapped: right?.bootstrapped ?? left.bootstrapped ?? false,
});

const mergeViewState = (left: GMXViewState, right?: Partial<GMXViewState>): GMXViewState => ({
  ...left,
  ...right,
  trades: right?.trades ? [...left.trades, ...right.trades] : left.trades,
});

const mergeSettings = (left: GMXSettings, right?: Partial<GMXSettings>): GMXSettings => ({
  amount: right?.amount ?? left.amount,
});
/* ============================
   LangGraph Annotation Root
   ============================ */

export const GMXStateAnnotation = Annotation.Root({
  messages: Annotation<Messages>({
    default: () => [],
    reducer: messagesStateReducer,
  }),
  copilotkit: Annotation<CopilotState['copilotkit'], Partial<CopilotState['copilotkit']>>({
    default: () => ({ actions: [], context: [] }),
    reducer: (l, r) => ({ actions: r?.actions ?? l.actions, context: r?.context ?? l.context }),
  }),
  settings:Annotation<GMXSettings, Partial<GMXSettings>>({
    default:defaultSettingsState,
    reducer: (l,r) => mergeSettings(left ?? defaultSettingsState(), right)
  })
  private: Annotation<GMXPrivateState, Partial<GMXPrivateState>>({
    default: defaultPrivateState,
    reducer: (l, r) => mergePrivateState(l ?? defaultPrivateState(), r),
  }),
  view: Annotation<GMXViewState, Partial<GMXViewState>>({
    default: defaultViewState,
    reducer: (l, r) => mergeViewState(l ?? defaultViewState(), r),
  }),
});

export type GMXState = typeof GMXStateAnnotation.State;
export type GMXUpdate = typeof GMXStateAnnotation.Update;

export const memory = new MemorySaver();

/* ============================
   Helper
   ============================ */

function buildAgentMessage(message: string): AgentMessage {
  return {
    id: uuidv7(),
    role: 'assistant',
    content: message,
  };
}
export function normalizeHexAddress(value: string, label: string): `0x${string}` {
  if (!value.startsWith('0x')) {
    throw new Error(`Invalid ${label}: ${value}`);
  }
  return value as `0x${string}`;
}

/* ============================
   Task Types
   ============================ */

export type TaskState =
  | 'submitted'
  | 'working'
  | 'input-required'
  | 'completed'
  | 'canceled'
  | 'failed'
  | 'rejected'
  | 'auth-required'
  | 'unknown';

export type TaskStatus = {
  state: TaskState;
  message?: AgentMessage;
  timestamp?: string;
};

export type Task = {
  id: string;
  taskStatus: TaskStatus;
};

/* ============================
   GMX Events
   ============================ */

export type GMXEvent =
  | { type: 'status'; message: string; task: Task }
  | { type: 'dispatch-response'; parts: Array<{ kind: string; data: unknown }> };

/* ============================
   Helpers
   ============================ */

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
): { task: Task; statusEvent: GMXEvent } {
  const timestamp = new Date().toISOString();

  const nextTask: Task = {
    id: task?.id ?? uuidv7(),
    taskStatus: {
      state,
      message: buildAgentMessage(message),
      timestamp,
    },
  };

  const statusEvent: GMXEvent = {
    type: 'status',
    message,
    task: nextTask,
  };

  return { task: nextTask, statusEvent };
}
