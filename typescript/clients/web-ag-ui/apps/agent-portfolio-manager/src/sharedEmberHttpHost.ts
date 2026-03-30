import type { PortfolioManagerSharedEmberProtocolHost } from './sharedEmberAdapter.js';

const jsonContentType = 'application/json; charset=utf-8';

type PortfolioManagerSharedEmberHttpHostEnv = NodeJS.ProcessEnv & {
  SHARED_EMBER_BASE_URL?: string;
};

function trimTrailingSlash(value: string): string {
  return value.endsWith('/') ? value.slice(0, -1) : value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function readJsonRpcErrorMessage(body: unknown): string | null {
  if (!isRecord(body) || !('error' in body) || !isRecord(body.error)) {
    return null;
  }

  const message = body.error.message;
  return typeof message === 'string' && message.trim().length > 0 ? message : 'Unknown JSON-RPC error.';
}

async function postJson(input: {
  url: string;
  body: unknown;
}): Promise<unknown> {
  const response = await fetch(input.url, {
    method: 'POST',
    headers: {
      'content-type': jsonContentType,
    },
    body: JSON.stringify(input.body),
  });

  const rawBody = await response.text();
  const parsedBody = rawBody.length === 0 ? null : (JSON.parse(rawBody) as unknown);

  if (!response.ok) {
    throw new Error(
      `Shared Ember Domain Service HTTP request failed with status ${response.status}.`,
    );
  }

  const jsonRpcErrorMessage = readJsonRpcErrorMessage(parsedBody);
  if (jsonRpcErrorMessage) {
    throw new Error(`Shared Ember Domain Service JSON-RPC error: ${jsonRpcErrorMessage}`);
  }

  return parsedBody;
}

export function resolvePortfolioManagerSharedEmberBaseUrl(
  env: PortfolioManagerSharedEmberHttpHostEnv = process.env,
): string | null {
  const normalized = env.SHARED_EMBER_BASE_URL?.trim();
  return normalized ? trimTrailingSlash(normalized) : null;
}

export function createPortfolioManagerSharedEmberHttpHost(input: {
  baseUrl: string;
}): PortfolioManagerSharedEmberProtocolHost {
  const baseUrl = trimTrailingSlash(input.baseUrl);

  return {
    async handleJsonRpc(request) {
      return postJson({
        url: `${baseUrl}/jsonrpc`,
        body: request,
      });
    },

    async readCommittedEventOutbox(request) {
      return postJson({
        url: `${baseUrl}/outbox/read`,
        body: request,
      });
    },

    async acknowledgeCommittedEventOutbox(request) {
      return postJson({
        url: `${baseUrl}/outbox/ack`,
        body: request,
      });
    },
  };
}
