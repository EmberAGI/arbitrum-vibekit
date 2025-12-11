import { CopilotKitStateAnnotation } from '@copilotkit/sdk-js/langgraph';
import type { AIMessage as CopilotKitAIMessage } from '@copilotkit/shared';
import { type Artifact } from '@emberai/agent-node/workflow';
import { Annotation, MemorySaver } from '@langchain/langgraph';
import { v7 as uuidv7 } from 'uuid';

import { resolvePollIntervalMs, resolveStreamLimit } from '../config/constants.js';
import {
  type CamelotPool,
  type OperatorConfigInput,
  type RebalanceTelemetry,
  type ResolvedOperatorConfig,
} from '../domain/types.js';

export type AgentMessage = CopilotKitAIMessage;

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

export const ClmmStateAnnotation = Annotation.Root({
  ...CopilotKitStateAnnotation.spec,
  mode: Annotation<'debug' | 'production'>(),
  pollIntervalMs: Annotation<number>({
    default: () => resolvePollIntervalMs(),
    reducer: (_previous, current) => current ?? _previous ?? resolvePollIntervalMs(),
  }),
  streamLimit: Annotation<number>({
    default: () => resolveStreamLimit(),
    reducer: (_previous, current) => current ?? _previous ?? resolveStreamLimit(),
  }),
  cronScheduled: Annotation<boolean>({
    default: () => false,
    reducer: (_left, right) => right ?? _left ?? false,
  }),
  bootstrapped: Annotation<boolean>({
    default: () => false,
    reducer: (_left, right) => right ?? _left ?? false,
  }),
  command: Annotation<string | undefined>({ reducer: (_left, right) => right ?? _left }),
  amount: Annotation<number | undefined>({ reducer: (_left, right) => right ?? _left }),
  // Note: Client instances (EmberCamelotClient, viem clients) are NOT stored in state
  // because LangGraph's checkpointer serializes state to JSON, which strips prototype methods.
  // Instead, clients are created on-demand in each node via clientFactory.ts.
  task: Annotation<Task | undefined>({ reducer: (left, right) => right ?? left }),
  pools: Annotation<CamelotPool[]>({ default: () => [], reducer: (left, right) => right ?? left }),
  allowedPools: Annotation<CamelotPool[]>({
    default: () => [],
    reducer: (left, right) => right ?? left,
  }),
  poolArtifact: Annotation<Artifact | undefined>({ reducer: (left, right) => right ?? left }),
  operatorInput: Annotation<OperatorConfigInput | undefined>({
    reducer: (left, right) => right ?? left,
  }),
  selectedPool: Annotation<CamelotPool | undefined>({ reducer: (left, right) => right ?? left }),
  operatorConfig: Annotation<ResolvedOperatorConfig | undefined>({
    reducer: (left, right) => right ?? left,
  }),
  lastSnapshot: Annotation<CamelotPool | undefined>({ reducer: (left, right) => right ?? left }),
  previousPrice: Annotation<number | undefined>({ reducer: (left, right) => right ?? left }),
  cyclesSinceRebalance: Annotation<number>({
    default: () => 0,
    reducer: (left, right) => right ?? left ?? 0,
  }),
  staleCycles: Annotation<number>({
    default: () => 0,
    reducer: (left, right) => right ?? left ?? 0,
  }),
  iteration: Annotation<number>({ default: () => 0, reducer: (left, right) => right ?? left ?? 0 }),
  telemetry: Annotation<RebalanceTelemetry[]>({
    default: () => [],
    reducer: (left, right) => [...left, ...(right ?? [])],
  }),
  latestCycle: Annotation<RebalanceTelemetry | undefined>({
    reducer: (left, right) => right ?? left,
  }),
  events: Annotation<ClmmEvent[]>({
    default: () => [],
    reducer: (left, right) => [...left, ...(right ?? [])],
  }),
  haltReason: Annotation<string | undefined>({ reducer: (_left, right) => right }),
});

export type ClmmState = typeof ClmmStateAnnotation.State;
export type ClmmUpdate = typeof ClmmStateAnnotation.Update;

export const memory = new MemorySaver();

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

export const isTaskTerminal = (state: TaskState) =>
  state === 'completed' ||
  state === 'failed' ||
  state === 'canceled' ||
  state === 'rejected' ||
  state === 'unknown';

export const isTaskActive = (state: TaskState) =>
  state === 'submitted' ||
  state === 'working' ||
  state === 'input-required' ||
  state === 'auth-required';
