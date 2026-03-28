import { randomUUID } from 'node:crypto';

import {
  buildCancelAutomationStatements,
  buildPiRuntimeGatewayConnectEvents,
  buildPersistAutomationDispatchStatements,
  buildPersistInterruptCheckpointStatements,
  buildPiRuntimeDirectExecutionRecordIds,
  buildPiRuntimeStableUuid,
  createAgentRuntime,
  createPiRuntimeGatewayAgUiHandler,
  ensurePiRuntimePostgresReady,
  executePostgresStatements,
  loadPiRuntimeInspectionState,
  persistPiRuntimeDirectExecution,
  type PiRuntimeGatewayInspectionState,
  type PiRuntimeGatewayService,
} from 'agent-runtime';

import {
  createPiExampleAgentConfig,
  type PiExampleAgentConfig,
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
  runtimeConfig?: PiExampleAgentConfig;
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
      title: string;
      instruction: string;
      schedule: Record<string, unknown>;
    }) => Promise<{
      automationId: string;
      runId: string;
      executionId: string;
      artifactId: string;
      title: string;
      schedule: Record<string, unknown>;
      nextRunAt: string | null;
    }>;
    listAutomations?: (params: {
      threadKey: string;
      state?: string;
      limit?: number;
    }) => Promise<
      Array<{
        id: string;
        title: string;
        status: 'active' | 'completed' | 'canceled';
        schedule: Record<string, unknown>;
        nextRunAt: string | null;
        lastRunAt: string | null;
        lastRunStatus: string | null;
      }>
    >;
    cancelAutomation?: (params: {
      threadKey: string;
      automationId: string;
    }) => Promise<{
      automationId: string;
      artifactId: string;
      title: string;
      instruction: string;
      schedule: Record<string, unknown>;
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
    const clonedEvents: BaseEvent[] = [];
    for (let index = 0; index < source.length; index += 1) {
      clonedEvents[index] = source[index] as BaseEvent;
    }
    return clonedEvents;
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
      title: string;
      instruction: string;
      schedule: Record<string, unknown>;
    }) => {
      await ensureReady();
      const directExecutionIds = buildPiRuntimeDirectExecutionRecordIds(params.threadKey);
      const automationId = randomUUID();
      const runId = randomUUID();
      const executionId = randomUUID();
      const activityId = randomUUID();
      const artifactId = buildPiRuntimeStableUuid('artifact', `pi-example:${params.threadKey}:automation-artifact`);
      const now = getNow();
      const scheduleKind = typeof params.schedule.kind === 'string' ? params.schedule.kind : 'every';
      const intervalMinutes = typeof params.schedule.intervalMinutes === 'number' ? params.schedule.intervalMinutes : 5;
      const nextRunAt =
        scheduleKind === 'at' && typeof params.schedule.at === 'string'
          ? new Date(params.schedule.at)
          : new Date(now.getTime() + intervalMinutes * 60 * 1000);

      await executePostgresStatements(
        databaseUrl,
        buildPersistAutomationDispatchStatements({
          automationId,
          runId,
          executionId,
          threadId: directExecutionIds.threadId,
          commandName: params.title,
          schedulePayload: {
            title: params.title,
            instruction: params.instruction,
            schedule: params.schedule,
            command: params.instruction,
            minutes: intervalMinutes,
          },
          activityId,
          leaseOwnerId: buildPiRuntimeStableUuid('lease-owner', `pi-example:${params.threadKey}:lease-owner`),
          now,
          nextRunAt,
          leaseExpiresAt: new Date(now.getTime() + 60 * 1000),
        }),
      );

      return {
        automationId,
        runId,
        executionId,
        artifactId,
        title: params.title,
        schedule: params.schedule,
        nextRunAt: nextRunAt.toISOString(),
      };
    });
  const listAutomations =
    options.persistence?.listAutomations ??
    (async (params: { threadKey: string; state?: string; limit?: number }) => {
      await ensureReady();
      const inspectionState = await loadInspectionState();
      const threadId = buildPiRuntimeDirectExecutionRecordIds(params.threadKey).threadId;
      const limit = Math.max(1, Math.min(params.limit ?? 20, 50));

      const summaries = inspectionState.automations
        .filter((automation) => automation.threadId === threadId)
        .map((automation) => {
          const latestRun = [...inspectionState.automationRuns]
            .filter((run) => run.automationId === automation.automationId)
            .sort((left, right) => right.scheduledAt.getTime() - left.scheduledAt.getTime())[0];
          const status: 'active' | 'completed' | 'canceled' =
            automation.suspended || latestRun?.status === 'canceled'
              ? 'canceled'
              : automation.nextRunAt === null
                ? 'completed'
                : 'active';
          return {
            id: automation.automationId,
            title:
              typeof automation.schedulePayload.title === 'string'
                ? automation.schedulePayload.title
                : automation.commandName,
            status,
            schedule:
              typeof automation.schedulePayload.schedule === 'object' && automation.schedulePayload.schedule !== null
                ? (automation.schedulePayload.schedule as Record<string, unknown>)
                : { kind: 'every', intervalMinutes: automation.schedulePayload.minutes ?? 5 },
            nextRunAt: automation.nextRunAt?.toISOString() ?? null,
            lastRunAt: latestRun?.completedAt?.toISOString() ?? latestRun?.scheduledAt.toISOString() ?? null,
            lastRunStatus: latestRun?.status ?? null,
          };
        })
        .filter((automation) => {
          const state = params.state ?? 'active';
          return state === 'all' ? true : automation.status === state;
        })
        .slice(0, limit);

      return summaries;
    });
  const cancelAutomation =
    options.persistence?.cancelAutomation ??
    (async (params: { threadKey: string; automationId: string }) => {
      await ensureReady();
      const inspectionState = await loadInspectionState();
      const threadId = buildPiRuntimeDirectExecutionRecordIds(params.threadKey).threadId;
      const automation = inspectionState.automations.find(
        (candidate) => candidate.automationId === params.automationId && candidate.threadId === threadId,
      );
      if (!automation) {
        throw new Error(`Unknown automation ${params.automationId}`);
      }

      const scheduledRun = [...inspectionState.automationRuns]
        .filter((run) => run.automationId === params.automationId && run.status === 'scheduled')
        .sort((left, right) => right.scheduledAt.getTime() - left.scheduledAt.getTime())[0];
      const now = getNow();

      await executePostgresStatements(
        databaseUrl,
        buildCancelAutomationStatements({
          automationId: params.automationId,
          currentRunId: scheduledRun?.runId ?? null,
          currentExecutionId: scheduledRun?.executionId ?? null,
          threadId,
          eventId: randomUUID(),
          activityId: randomUUID(),
          now,
        }),
      );

      return {
        automationId: params.automationId,
        artifactId: buildPiRuntimeStableUuid('artifact', `pi-example:${params.threadKey}:automation-artifact`),
        title:
          typeof automation.schedulePayload.title === 'string'
            ? automation.schedulePayload.title
            : automation.commandName,
        instruction:
          typeof automation.schedulePayload.instruction === 'string'
            ? automation.schedulePayload.instruction
            : automation.commandName,
        schedule:
          typeof automation.schedulePayload.schedule === 'object' && automation.schedulePayload.schedule !== null
            ? (automation.schedulePayload.schedule as Record<string, unknown>)
            : { kind: 'every', intervalMinutes: automation.schedulePayload.minutes ?? 5 },
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
      listAutomations,
      cancelAutomation,
      requestInterrupt,
    },
  };
  const runtimeConfig = options.runtimeConfig ?? createPiExampleAgentConfig(options.env, foundationOptions);
  const databaseUrl = runtimeConfig.databaseUrl;

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

  return createAgentRuntime({
    ...runtimeConfig,
    sessions: {
      getSession: (threadId) => runtimeState.getSession(threadId),
      updateSession: (threadId, update) => runtimeState.updateSession(threadId, update),
    },
    controlPlane: {
      loadInspectionState: async () => {
        await ensureReady();
        return await loadInspectionState();
      },
      now: getNow,
    },
    runtime: (baseRuntime) => ({
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
        if (typeof request.forwardedProps?.command?.resume === 'string') {
          runtimeState.resumeFromUserInput(request.threadId);
        }
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
          (events) => {
            void runtimeState.publishAttachedEventSource(request.threadId, events);
          },
          () => runtimeState.finishAttachedRun(request.threadId, request.runId),
        ),
    }),
  }).service;
}

export function createPiExampleAgUiHandler(options: PiExampleAgUiHandlerOptions) {
  return createPiRuntimeGatewayAgUiHandler({
    ...options,
    basePath: options.basePath ?? PI_EXAMPLE_AG_UI_BASE_PATH,
  });
}
