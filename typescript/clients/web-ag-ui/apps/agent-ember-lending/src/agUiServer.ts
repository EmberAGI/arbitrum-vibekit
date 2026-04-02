import { createAgentRuntime, type AgentRuntimeService } from 'agent-runtime';

import {
  createEmberLendingAgentConfig,
  type EmberLendingAgentConfig,
  type EmberLendingGatewayEnv,
  resolveEmberLendingGatewayDependencies,
} from './emberLendingFoundation.js';
import {
  EMBER_LENDING_INTERNAL_HYDRATE_COMMAND,
  hasEmberLendingRuntimeProjection,
} from './sharedEmberAdapter.js';
import { ensureEmberLendingServiceIdentity } from './serviceIdentityPreflight.js';

export const EMBER_LENDING_AGENT_ID = 'agent-ember-lending';
export const EMBER_LENDING_AG_UI_BASE_PATH = '/ag-ui';
export type EmberLendingGatewayService = AgentRuntimeService;

type EmberLendingAgUiHandlerOptions = {
  agentId: string;
  service: EmberLendingGatewayService;
  basePath?: string;
};

type EmberLendingGatewayServiceOptions = {
  env?: EmberLendingGatewayEnv;
  runtimeConfig?: EmberLendingAgentConfig;
  now?: () => number;
};

type EmberLendingGatewayInternalOptions = EmberLendingGatewayServiceOptions & {
  __internalCreateAgentRuntime?: typeof createAgentRuntime;
  __internalEnsureServiceIdentity?: typeof ensureEmberLendingServiceIdentity;
  __internalPostgres?: {
    ensureReady?: (options?: { env?: { DATABASE_URL?: string } }) => Promise<{
      databaseUrl: string;
    }>;
    loadInspectionState?: (options: { databaseUrl: string }) => Promise<unknown>;
    executeStatements?: (databaseUrl: string, statements: readonly unknown[]) => Promise<void>;
    persistDirectExecution?: (options: unknown) => Promise<void>;
  };
};

const AGENT_RUNTIME_PERSISTED_DOMAIN_STATE_KEY = '__agentRuntimeDomainState';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function readConnectThreadId(body: unknown): string | null {
  return isRecord(body) ? readString(body['threadId']) : null;
}

function readPersistedEmberLendingState(threadRecord: unknown): unknown {
  if (!isRecord(threadRecord) || !isRecord(threadRecord['threadState'])) {
    return null;
  }

  return threadRecord['threadState'][AGENT_RUNTIME_PERSISTED_DOMAIN_STATE_KEY];
}

function findThreadRecord(records: unknown, threadId: string): unknown {
  if (!Array.isArray(records)) {
    return null;
  }

  return (
    records.find(
      (record) => isRecord(record) && readString(record['threadKey']) === threadId,
    ) ?? null
  );
}

async function consumeEventSource(events: Awaited<ReturnType<AgentRuntimeService['run']>>): Promise<void> {
  if (Array.isArray(events)) {
    return;
  }

  for await (const _event of events) {
    // Drain the internal hydration run so the runtime persists the projection before connect.
  }
}

async function hydrateManagedProjectionIfNeeded(input: {
  service: EmberLendingGatewayService;
  threadId: string;
}): Promise<void> {
  const threads = await input.service.control.listThreads();
  const persistedState = readPersistedEmberLendingState(findThreadRecord(threads, input.threadId));

  if (hasEmberLendingRuntimeProjection(persistedState)) {
    return;
  }

  await consumeEventSource(
    await input.service.run({
      threadId: input.threadId,
      runId: `connect-hydrate:${input.threadId}`,
      forwardedProps: {
        command: {
          name: EMBER_LENDING_INTERNAL_HYDRATE_COMMAND,
        },
      },
    }),
  );
}

export async function createEmberLendingGatewayService(
  options?: EmberLendingGatewayServiceOptions,
): Promise<AgentRuntimeService>;
export async function createEmberLendingGatewayService(
  options: EmberLendingGatewayInternalOptions = {},
): Promise<AgentRuntimeService> {
  const createAgentRuntimeImpl = options.__internalCreateAgentRuntime ?? createAgentRuntime;

  if (options.runtimeConfig === undefined) {
    const dependencies = resolveEmberLendingGatewayDependencies(options.env);
    if (dependencies.protocolHost) {
      const readSignerWalletAddress = dependencies.executionSigner?.readSignerWalletAddress;
      if (!readSignerWalletAddress) {
        throw new Error(
          'Lending startup identity preflight requires EMBER_LENDING_OWS_BASE_URL to resolve the local signer wallet.',
        );
      }

      await (options.__internalEnsureServiceIdentity ?? ensureEmberLendingServiceIdentity)({
        protocolHost: dependencies.protocolHost,
        readSignerWalletAddress,
      });
    }
  }

  const runtimeConfig = options.runtimeConfig ?? createEmberLendingAgentConfig(options.env);
  const runtime = await createAgentRuntimeImpl({
    ...runtimeConfig,
    ...(options.now ? { now: options.now } : {}),
    ...(options.__internalPostgres ? { __internalPostgres: options.__internalPostgres } : {}),
  } as never);

  return runtime.service;
}

export function createEmberLendingAgUiHandler(options: EmberLendingAgUiHandlerOptions) {
  const basePath = options.basePath ?? EMBER_LENDING_AG_UI_BASE_PATH;
  const baseHandler = options.service.createAgUiHandler({
    agentId: options.agentId,
    basePath,
  });

  return async (request: Request) => {
    const url = new URL(request.url);
    if (
      request.method === 'POST' &&
      url.pathname === `${basePath}/agent/${options.agentId}/connect`
    ) {
      try {
        const threadId = readConnectThreadId(await request.clone().json());
        if (threadId) {
          await hydrateManagedProjectionIfNeeded({
            service: options.service,
            threadId,
          });
        }
      } catch {
        // Let the base handler surface any malformed connect payload.
      }
    }

    return await baseHandler(request);
  };
}
