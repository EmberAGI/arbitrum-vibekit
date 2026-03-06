import { appendFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import { logInfo } from './context.js';

type LatencyMetadata = Record<string, unknown>;
type LatencyOutcome = 'started' | 'completed' | 'failed';

let latencyLogWriteChain: Promise<void> = Promise.resolve();

function resolveLatencyLogPath(): string | undefined {
  const rawPath = process.env['PENDLE_LATENCY_LOG_PATH']?.trim();
  if (!rawPath) {
    return undefined;
  }
  return resolve(rawPath);
}

function enqueueLatencyLog(event: Record<string, unknown>): void {
  const logPath = resolveLatencyLogPath();
  if (!logPath) {
    return;
  }

  const line = `${JSON.stringify(event)}\n`;
  latencyLogWriteChain = latencyLogWriteChain
    .catch(() => undefined)
    .then(async () => {
      await mkdir(dirname(logPath), { recursive: true });
      await appendFile(logPath, line, 'utf8');
    });
}

function emitLatencyEvent(params: {
  node: string;
  stage: string;
  outcome: LatencyOutcome;
  startedAt: string;
  durationMs?: number;
  metadata?: LatencyMetadata;
  error?: string;
}) {
  enqueueLatencyLog({
    timestamp: new Date().toISOString(),
    node: params.node,
    stage: params.stage,
    outcome: params.outcome,
    startedAt: params.startedAt,
    durationMs: params.durationMs,
    error: params.error,
    ...(params.metadata ?? {}),
  });
}

export type LatencyStage = {
  complete: (metadata?: LatencyMetadata) => number;
  fail: (error: unknown, metadata?: LatencyMetadata) => number;
};

export function startLatencyStage(params: {
  node: string;
  stage: string;
  metadata?: LatencyMetadata;
}): LatencyStage {
  const startedAtEpochMs = Date.now();
  const startedAt = new Date(startedAtEpochMs).toISOString();
  const baseMetadata = params.metadata ?? {};

  logInfo(`${params.node}: ${params.stage} started`, {
    stage: params.stage,
    startedAt,
    ...baseMetadata,
  });
  emitLatencyEvent({
    node: params.node,
    stage: params.stage,
    outcome: 'started',
    startedAt,
    metadata: baseMetadata,
  });

  return {
    complete(metadata) {
      const durationMs = Date.now() - startedAtEpochMs;
      const mergedMetadata = {
        ...baseMetadata,
        ...(metadata ?? {}),
      };
      logInfo(`${params.node}: ${params.stage} completed`, {
        stage: params.stage,
        startedAt,
        durationMs,
        ...mergedMetadata,
      });
      emitLatencyEvent({
        node: params.node,
        stage: params.stage,
        outcome: 'completed',
        startedAt,
        durationMs,
        metadata: mergedMetadata,
      });
      return durationMs;
    },
    fail(error, metadata) {
      const durationMs = Date.now() - startedAtEpochMs;
      const errorMessage = error instanceof Error ? error.message : String(error);
      const mergedMetadata = {
        ...baseMetadata,
        ...(metadata ?? {}),
      };
      logInfo(`${params.node}: ${params.stage} failed`, {
        stage: params.stage,
        startedAt,
        durationMs,
        error: errorMessage,
        ...mergedMetadata,
      });
      emitLatencyEvent({
        node: params.node,
        stage: params.stage,
        outcome: 'failed',
        startedAt,
        durationMs,
        error: errorMessage,
        metadata: mergedMetadata,
      });
      return durationMs;
    },
  };
}

export async function measureAsyncStage<T>(params: {
  node: string;
  stage: string;
  metadata?: LatencyMetadata;
  run: () => Promise<T>;
  onSuccessMetadata?: (value: T) => LatencyMetadata | undefined;
}): Promise<T> {
  const stage = startLatencyStage({
    node: params.node,
    stage: params.stage,
    metadata: params.metadata,
  });

  try {
    const value = await params.run();
    stage.complete(params.onSuccessMetadata?.(value));
    return value;
  } catch (error: unknown) {
    stage.fail(error);
    throw error;
  }
}

export function flushLatencyLogWrites(): Promise<void> {
  return latencyLogWriteChain;
}
