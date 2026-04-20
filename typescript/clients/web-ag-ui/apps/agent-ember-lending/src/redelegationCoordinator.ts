import { createHash, randomUUID } from 'node:crypto';

import { createAgentRuntimeHttpAgent } from 'agent-runtime';

const PORTFOLIO_MANAGER_AGENT_ID = 'agent-portfolio-manager';
const PORTFOLIO_MANAGER_THREAD_NAMESPACE = '6ba7b811-9dad-11d1-80b4-00c04fd430c8';
const DEFAULT_PORTFOLIO_MANAGER_AGENT_DEPLOYMENT_URL = 'http://127.0.0.1:3420/ag-ui';

type RunResult = {
  subscribe: (observer: {
    complete?: () => void;
    error?: (error: unknown) => void;
  }) => { unsubscribe?: () => void };
};

type RuntimeHttpAgent = {
  run: (input: {
    threadId: string;
    runId: string;
    messages: unknown[];
    state: Record<string, unknown>;
    tools: unknown[];
    context: unknown[];
    forwardedProps: {
      command: {
        name: string;
      };
    };
  }) => RunResult;
};

function normalizeWalletAddress(value: string): string {
  return value.trim().toLowerCase();
}

function decodeUuid(uuid: string): Uint8Array {
  const normalized = uuid.replace(/-/g, '');
  const bytes = new Uint8Array(16);
  for (let index = 0; index < 16; index += 1) {
    bytes[index] = Number.parseInt(normalized.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}

function encodeUuid(bytes: Uint8Array): string {
  const hex = Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function buildPortfolioManagerThreadId(rootWalletAddress: string): string {
  const hash = createHash('sha1')
    .update(decodeUuid(PORTFOLIO_MANAGER_THREAD_NAMESPACE))
    .update(`copilotkit:${PORTFOLIO_MANAGER_AGENT_ID}:${normalizeWalletAddress(rootWalletAddress)}`)
    .digest();
  const bytes = new Uint8Array(hash.subarray(0, 16));
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  return encodeUuid(bytes);
}

export function resolvePortfolioManagerAgentDeploymentUrl(
  env:
    | NodeJS.ProcessEnv
    | {
        PORTFOLIO_MANAGER_AGENT_DEPLOYMENT_URL?: string;
      } = process.env,
): string {
  return (
    env.PORTFOLIO_MANAGER_AGENT_DEPLOYMENT_URL?.trim() ||
    DEFAULT_PORTFOLIO_MANAGER_AGENT_DEPLOYMENT_URL
  );
}

export function createPortfolioManagerRedelegationRefresher(input: {
  runtimeUrl: string;
  createHttpAgent?: (config: {
    agentId: string;
    runtimeUrl: string;
  }) => RuntimeHttpAgent;
}): (params: { rootWalletAddress: string }) => Promise<void> {
  const createHttpAgent = input.createHttpAgent ?? createAgentRuntimeHttpAgent;

  return async ({ rootWalletAddress }) => {
    const agent = createHttpAgent({
      agentId: PORTFOLIO_MANAGER_AGENT_ID,
      runtimeUrl: input.runtimeUrl,
    });

    await new Promise<void>((resolve, reject) => {
      agent
        .run({
          threadId: buildPortfolioManagerThreadId(rootWalletAddress),
          runId: randomUUID(),
          messages: [],
          state: {},
          tools: [],
          context: [],
          forwardedProps: {
            command: {
              name: 'refresh_redelegation_work',
            },
          },
        })
        .subscribe({
          complete: resolve,
          error: reject,
        });
    });
  };
}
