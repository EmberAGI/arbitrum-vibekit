import { randomUUID } from 'node:crypto';

import {
  buildPiRuntimeGatewayConnectEvents,
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

type BaseEvent = ReturnType<typeof buildPiRuntimeGatewayConnectEvents>[number];

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
      executionId: string;
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

function createAttachedEventStream(params: {
  seedEvents: readonly BaseEvent[];
  attach: (push: (event: BaseEvent) => void) => {
    detach: () => void;
    activeRunEvents: readonly BaseEvent[];
  };
}): AsyncIterable<BaseEvent> {
  const queue = [...params.seedEvents];
  const readers: Array<{
    resolve: (result: IteratorResult<BaseEvent>) => void;
    reject: (error: unknown) => void;
  }> = [];
  let detached = false;

  const flush = (event: BaseEvent) => {
    const reader = readers.shift();
    if (reader) {
      reader.resolve({ value: event, done: false });
      return;
    }

    queue.push(event);
  };

  const attachment = params.attach(flush);
  for (const event of attachment.activeRunEvents) {
    flush(event);
  }

  const detach = () => {
    if (detached) {
      return;
    }

    detached = true;
    attachment.detach();
    while (readers.length > 0) {
      readers.shift()?.resolve({ value: undefined, done: true });
    }
  };

  return {
    [Symbol.asyncIterator]() {
      return {
        next() {
          if (queue.length > 0) {
            return Promise.resolve({
              value: queue.shift()!,
              done: false,
            });
          }

          if (detached) {
            return Promise.resolve({ value: undefined, done: true });
          }

          return new Promise<IteratorResult<BaseEvent>>((resolve, reject) => {
            readers.push({ resolve, reject });
          });
        },
        return() {
          detach();
          return Promise.resolve({ value: undefined, done: true });
        },
      };
    },
  };
}

function tapEventSource(
  source: readonly BaseEvent[] | AsyncIterable<BaseEvent>,
  onEvents: (events: readonly BaseEvent[]) => void,
  onComplete?: () => void,
): readonly BaseEvent[] | AsyncIterable<BaseEvent> {
  if (Array.isArray(source)) {
    onEvents(source);
    onComplete?.();
    return source;
  }

  return {
    [Symbol.asyncIterator]() {
      const iterator = (source as AsyncIterable<BaseEvent>)[Symbol.asyncIterator]();

      return {
        async next() {
          const result = await iterator.next();
          if (!result.done) {
            onEvents([result.value]);
          } else {
            onComplete?.();
          }
          return result;
        },
        async return() {
          onComplete?.();
          return typeof iterator.return === 'function'
            ? await iterator.return()
            : { value: undefined, done: true };
        },
        async throw(error: unknown) {
          onComplete?.();
          if (typeof iterator.throw === 'function') {
            return await iterator.throw(error);
          }

          throw error;
        },
      };
    },
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
      const automationId = buildPiRuntimeStableUuid('automation', `pi-example:${params.threadKey}:automation`);
      const runId = randomUUID();
      const executionId = randomUUID();
      const activityId = randomUUID();
      const artifactId = buildPiRuntimeStableUuid('artifact', `pi-example:${params.threadKey}:automation-artifact`);
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
          leaseOwnerId: buildPiRuntimeStableUuid('lease-owner', `pi-example:${params.threadKey}:lease-owner`),
          now,
          nextRunAt: new Date(now.getTime() + params.minutes * 60 * 1000),
          leaseExpiresAt: new Date(now.getTime() + 60 * 1000),
        }),
      );

      return {
        automationId,
        runId,
        executionId,
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
      const artifactId = buildPiRuntimeStableUuid('artifact', `pi-example:${params.threadKey}:interrupt-artifact`);

      await executePostgresStatements(
        databaseUrl,
        buildPersistInterruptCheckpointStatements({
          executionId: directExecutionIds.executionId,
          interruptId: buildPiRuntimeStableUuid('interrupt', `pi-example:${params.threadKey}:interrupt`),
          artifactId,
          activityId: buildPiRuntimeStableUuid('activity', `pi-example:${params.threadKey}:interrupt-activity`),
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
    updateSession: (threadId, update) => runtimeState.updateSession(threadId, update),
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
        return createAttachedEventStream({
          seedEvents: buildPiRuntimeGatewayConnectEvents({
            threadId: request.threadId,
            runId: request.runId ?? `connect:${request.threadId}`,
            session: runtimeState.getSession(request.threadId),
          }),
          attach: (push) => runtimeState.attachToThread(request.threadId, push),
        });
      },
      run: async (request) => {
        await persistThreadExecution(request.threadId);
        runtimeState.resumeFromUserInput(request.threadId);
        runtimeState.startAttachedRun(request.threadId, request.runId);
        return tapEventSource(
          await baseRuntime.run(request),
          (events) => runtimeState.appendAttachedRunEvents(request.threadId, request.runId, events),
          () => runtimeState.finishAttachedRun(request.threadId, request.runId),
        );
      },
      stop: async (request) =>
        tapEventSource(
          await baseRuntime.stop(request),
          (events) => runtimeState.publishAttachedEventSource(request.threadId, events),
          () => runtimeState.finishAttachedRun(request.threadId, request.runId),
        ),
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
