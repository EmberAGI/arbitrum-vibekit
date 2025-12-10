import { type Artifact } from '@emberai/agent-node/workflow';
import { Annotation, MemorySaver } from '@langchain/langgraph';

import type { createClients } from '../clients/clients.js';
import { type EmberCamelotClient } from '../clients/emberApi.js';
import { resolvePollIntervalMs, resolveStreamLimit } from '../config/constants.js';
import {
  type CamelotPool,
  type OperatorConfigInput,
  type RebalanceTelemetry,
  type ResolvedOperatorConfig,
} from '../domain/types.js';

export type ClmmEvent =
  | { type: 'status'; message: string }
  | { type: 'artifact'; artifact: Artifact; append?: boolean }
  | { type: 'dispatch-response'; parts: Array<{ kind: string; data: unknown }> };

export type OperatorInterrupt = {
  type: 'operator-config-request';
  message: string;
  artifactId?: string;
};

export const ClmmStateAnnotation = Annotation.Root({
  mode: Annotation<'debug' | 'production'>(),
  pollIntervalMs: Annotation<number>({
    default: () => resolvePollIntervalMs(),
    reducer: (_previous, current) => current ?? _previous ?? resolvePollIntervalMs(),
  }),
  streamLimit: Annotation<number>({
    default: () => resolveStreamLimit(),
    reducer: (_previous, current) => current ?? _previous ?? resolveStreamLimit(),
  }),
  camelotClient: Annotation<EmberCamelotClient | undefined>(),
  clients: Annotation<ReturnType<typeof createClients> | undefined>(),
  pools: Annotation<CamelotPool[]>({ default: () => [], reducer: (_left, right) => right }),
  allowedPools: Annotation<CamelotPool[]>({ default: () => [], reducer: (_left, right) => right }),
  poolArtifact: Annotation<Artifact | undefined>({ reducer: (_left, right) => right }),
  operatorInput: Annotation<OperatorConfigInput | undefined>({ reducer: (_left, right) => right }),
  selectedPool: Annotation<CamelotPool | undefined>({ reducer: (_left, right) => right }),
  operatorConfig: Annotation<ResolvedOperatorConfig | undefined>({ reducer: (_left, right) => right }),
  lastSnapshot: Annotation<CamelotPool | undefined>({ reducer: (_left, right) => right }),
  previousPrice: Annotation<number | undefined>({ reducer: (_left, right) => right }),
  cyclesSinceRebalance: Annotation<number>({ default: () => 0, reducer: (_left, right) => right ?? 0 }),
  staleCycles: Annotation<number>({ default: () => 0, reducer: (_left, right) => right ?? 0 }),
  iteration: Annotation<number>({ default: () => 0, reducer: (_left, right) => right ?? 0 }),
  telemetry: Annotation<RebalanceTelemetry[]>({
    default: () => [],
    reducer: (left, right) => [...left, ...(right ?? [])],
  }),
  latestCycle: Annotation<RebalanceTelemetry | undefined>({ reducer: (_left, right) => right }),
  events: Annotation<ClmmEvent[]>({
    default: () => [],
    reducer: (left, right) => [...left, ...(right ?? [])],
  }),
  haltReason: Annotation<string | undefined>({ reducer: (_left, right) => right }),
});

export type ClmmState = typeof ClmmStateAnnotation.State;
export type ClmmUpdate = typeof ClmmStateAnnotation.Update;

export const memory = new MemorySaver();

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
