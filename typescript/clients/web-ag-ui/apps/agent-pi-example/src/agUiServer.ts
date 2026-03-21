import { randomUUID } from 'node:crypto';

import {
  buildPiRuntimeDirectExecutionRecordIds,
  createCanonicalPiRuntimeGatewayControlPlane,
  createPiRuntimeGatewayAgUiHandler,
  createPiRuntimeGatewayRuntime,
  createPiRuntimeGatewayService,
  ensurePiRuntimePostgresReady,
  loadPiRuntimeInspectionState,
  persistPiRuntimeDirectExecution,
  type PiRuntimeGatewayFoundation,
  type PiRuntimeGatewayInspectionState,
  type PiRuntimeGatewayService,
} from 'agent-runtime';
import { createPiExampleGatewayFoundation, type PiExampleGatewayEnv } from './piExampleFoundation.js';

export const PI_EXAMPLE_AGENT_ID = 'agent-pi-example';
export const PI_EXAMPLE_AG_UI_BASE_PATH = '/ag-ui';
const PI_EXAMPLE_NOW = new Date('2026-03-20T00:00:00.000Z');

type PiExampleAgUiHandlerOptions = {
  agentId: string;
  service: PiRuntimeGatewayService;
  basePath?: string;
};

type PiExampleGatewayServiceOptions = {
  env?: PiExampleGatewayEnv;
  foundation?: PiRuntimeGatewayFoundation;
  persistence?: {
    ensureReady?: () => Promise<void>;
    persistDirectExecution?: (params: {
      threadKey: string;
      threadId: string;
      executionId: string;
      interruptId: string;
      artifactId: string;
      activityId: string;
      now: Date;
    }) => Promise<void>;
    loadInspectionState?: () => Promise<PiRuntimeGatewayInspectionState>;
  };
};

function buildDirectExecutionIds(threadKey: string) {
  const stableIds = buildPiRuntimeDirectExecutionRecordIds(threadKey);

  return {
    ...stableIds,
    activityId: randomUUID(),
  };
}

export function createPiExampleGatewayService(options: PiExampleGatewayServiceOptions = {}): PiRuntimeGatewayService {
  const foundation = options.foundation ?? createPiExampleGatewayFoundation(options.env);
  const agent = foundation.agent;
  const databaseUrl = foundation.bootstrapPlan.databaseUrl;
  let ensuredReady: Promise<void> | null = null;
  const ensureReady =
    options.persistence?.ensureReady ??
    (() => {
      ensuredReady ??= ensurePiRuntimePostgresReady({
        env: options.env,
      }).then(() => undefined);
      return ensuredReady;
    });
  const persistDirectExecution =
    options.persistence?.persistDirectExecution ??
    (async (params: {
      threadKey: string;
      threadId: string;
      executionId: string;
      interruptId: string;
      artifactId: string;
      activityId: string;
      now: Date;
    }) => {
      await persistPiRuntimeDirectExecution({
        databaseUrl,
        threadId: params.threadId,
        threadKey: params.threadKey,
        threadState: { threadId: params.threadKey },
        executionId: params.executionId,
        interruptId: params.interruptId,
        artifactId: params.artifactId,
        activityId: params.activityId,
        now: params.now,
      });
    });
  const loadInspectionState =
    options.persistence?.loadInspectionState ??
    (async () =>
      await loadPiRuntimeInspectionState({
        databaseUrl,
      }));

  const persistThreadExecution = async (threadKey: string): Promise<void> => {
    await ensureReady();
    const now = new Date();
    const ids = buildDirectExecutionIds(threadKey);
    await persistDirectExecution({
      threadKey,
      now,
      ...ids,
    });
  };

  const baseRuntime = createPiRuntimeGatewayRuntime({
    agent,
    getSession: () => {
      const threadId = agent.sessionId ?? 'thread-1';
      return {
        thread: { id: threadId },
        execution: {
          id: `pi-example:${threadId}`,
          status: 'working',
        },
      };
    },
  });

  const controlPlane = createCanonicalPiRuntimeGatewayControlPlane({
    loadInspectionState: async () => {
      await ensureReady();
      return await loadInspectionState();
    },
    now: () => PI_EXAMPLE_NOW,
  });

  return createPiRuntimeGatewayService({
    runtime: {
      connect: async (request) => {
        await persistThreadExecution(request.threadId);
        return await baseRuntime.connect(request);
      },
      run: async (request) => {
        await persistThreadExecution(request.threadId);
        return await baseRuntime.run(request);
      },
      stop: (request) => baseRuntime.stop(request),
    },
    controlPlane,
  });
}

export function createPiExampleAgUiHandler(options: PiExampleAgUiHandlerOptions) {
  return createPiRuntimeGatewayAgUiHandler({
    ...options,
    basePath: options.basePath ?? PI_EXAMPLE_AG_UI_BASE_PATH,
  });
}
