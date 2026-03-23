import { randomUUID } from 'node:crypto';

import {
  buildPersistAutomationDispatchStatements,
  buildPersistInterruptCheckpointStatements,
  buildPiRuntimeDirectExecutionRecordIds,
  buildPiRuntimeStableUuid,
  createCanonicalPiRuntimeGatewayControlPlane,
  createPiRuntimeGatewayAgUiHandler,
  createPiRuntimeGatewayRuntime,
  createPiRuntimeGatewayService,
  ensurePiRuntimePostgresReady,
  executePostgresStatements,
  loadPiRuntimeInspectionState,
  persistPiRuntimeDirectExecution,
  type PiRuntimeGatewayFoundation,
  type PiRuntimeGatewayInspectionState,
  type PiRuntimeGatewayService,
} from 'agent-runtime';
import {
  createPiExampleGatewayFoundation,
  type PiExampleGatewayEnv,
  type PiExampleGatewayFoundationOptions,
} from './piExampleFoundation.js';
import { createPiExampleRuntimeStateStore, type PiExampleRuntimeStateStore } from './runtimeState.js';

export const PI_EXAMPLE_AGENT_ID = 'agent-pi-example';
export const PI_EXAMPLE_AG_UI_BASE_PATH = '/ag-ui';

type PiExampleAgUiHandlerOptions = {
  agentId: string;
  service: PiRuntimeGatewayService;
  basePath?: string;
};

type PiExampleGatewayServiceOptions = {
  env?: PiExampleGatewayEnv;
  foundation?: PiRuntimeGatewayFoundation;
  runtimeState?: PiExampleRuntimeStateStore;
  now?: () => Date;
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
    scheduleAutomation?: (params: {
      threadKey: string;
      command: string;
      minutes: number;
    }) => Promise<{
      automationId: string;
      runId: string;
      artifactId: string;
    }>;
    requestInterrupt?: (params: {
      threadKey: string;
      message: string;
    }) => Promise<{
      artifactId: string;
    }>;
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
  const runtimeState = options.runtimeState ?? createPiExampleRuntimeStateStore();
  const getNow = options.now ?? (() => new Date());
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
  const scheduleAutomation =
    options.persistence?.scheduleAutomation ??
    (async (params: {
      threadKey: string;
      command: string;
      minutes: number;
    }) => {
      await ensureReady();
      const directExecutionIds = buildPiRuntimeDirectExecutionRecordIds(params.threadKey);
      const automationId = buildPiRuntimeStableUuid(`pi-example:${params.threadKey}:automation`);
      const runId = buildPiRuntimeStableUuid(`pi-example:${params.threadKey}:automation-run`);
      const executionId = buildPiRuntimeStableUuid(`pi-example:${params.threadKey}:automation-execution`);
      const activityId = buildPiRuntimeStableUuid(`pi-example:${params.threadKey}:automation-activity`);
      const artifactId = buildPiRuntimeStableUuid(`pi-example:${params.threadKey}:automation-artifact`);
      const now = getNow();

      await executePostgresStatements(
        databaseUrl,
        buildPersistAutomationDispatchStatements({
          automationId,
          runId,
          executionId,
          threadId: directExecutionIds.threadId,
          commandName: params.command,
          schedulePayload: {
            command: params.command,
            minutes: params.minutes,
          },
          activityId,
          leaseOwnerId: buildPiRuntimeStableUuid(`pi-example:${params.threadKey}:lease-owner`),
          now,
          nextRunAt: new Date(now.getTime() + params.minutes * 60 * 1000),
          leaseExpiresAt: new Date(now.getTime() + 60 * 1000),
        }),
      );

      return {
        automationId,
        runId,
        artifactId,
      };
    });
  const requestInterrupt =
    options.persistence?.requestInterrupt ??
    (async (params: {
      threadKey: string;
      message: string;
    }) => {
      await ensureReady();
      const directExecutionIds = buildPiRuntimeDirectExecutionRecordIds(params.threadKey);
      const artifactId = buildPiRuntimeStableUuid(`pi-example:${params.threadKey}:interrupt-artifact`);

      await executePostgresStatements(
        databaseUrl,
        buildPersistInterruptCheckpointStatements({
          executionId: directExecutionIds.executionId,
          interruptId: buildPiRuntimeStableUuid(`pi-example:${params.threadKey}:interrupt`),
          artifactId,
          activityId: buildPiRuntimeStableUuid(`pi-example:${params.threadKey}:interrupt-activity`),
          threadId: directExecutionIds.threadId,
          now: getNow(),
        }),
      );

      return {
        artifactId,
      };
    });
  const foundationOptions: PiExampleGatewayFoundationOptions = {
    runtimeState,
    persistence: {
      scheduleAutomation,
      requestInterrupt,
    },
  };
  const foundation = options.foundation ?? createPiExampleGatewayFoundation(options.env, foundationOptions);
  const agent = foundation.agent;
  const databaseUrl = foundation.bootstrapPlan.databaseUrl;

  const persistThreadExecution = async (threadKey: string): Promise<void> => {
    await ensureReady();
    const now = getNow();
    const ids = buildDirectExecutionIds(threadKey);
    await persistDirectExecution({
      threadKey,
      now,
      ...ids,
    });
  };

  const baseRuntime = createPiRuntimeGatewayRuntime({
    agent,
    getSession: (threadId) => runtimeState.getSession(threadId),
  });

  const controlPlane = createCanonicalPiRuntimeGatewayControlPlane({
    loadInspectionState: async () => {
      await ensureReady();
      return await loadInspectionState();
    },
    now: getNow,
  });

  return createPiRuntimeGatewayService({
    runtime: {
      connect: async (request) => {
        await persistThreadExecution(request.threadId);
        return await baseRuntime.connect(request);
      },
      run: async (request) => {
        await persistThreadExecution(request.threadId);
        runtimeState.resumeFromUserInput(request.threadId);
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
