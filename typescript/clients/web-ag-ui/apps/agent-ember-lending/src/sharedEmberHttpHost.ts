import type { EmberLendingSharedEmberProtocolHost } from './sharedEmberAdapter.js';

const jsonContentType = 'application/json; charset=utf-8';

type EmberLendingSharedEmberHttpHostEnv = NodeJS.ProcessEnv & {
  SHARED_EMBER_BASE_URL?: string;
};

function trimTrailingSlash(value: string): string {
  return value.endsWith('/') ? value.slice(0, -1) : value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function readJsonRpcErrorMessage(body: unknown): string | null {
  if (!isRecord(body) || !('error' in body) || !isRecord(body['error'])) {
    return null;
  }

  const message = body['error']['message'];
  return typeof message === 'string' && message.trim().length > 0 ? message : 'Unknown JSON-RPC error.';
}

function readJsonRpcResult(body: unknown): unknown {
  if (!isRecord(body) || !('result' in body)) {
    throw new Error('Shared Ember Domain Service returned a malformed JSON-RPC success payload.');
  }

  return body['result'];
}

function readHttpErrorMessage(body: unknown): string | null {
  if (!isRecord(body)) {
    return null;
  }

  const message = body['message'];
  if (typeof message === 'string' && message.trim().length > 0) {
    return message;
  }

  const error = body['error'];
  if (typeof error === 'string' && error.trim().length > 0) {
    return error;
  }

  return readJsonRpcErrorMessage(body);
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
    const errorMessage = readHttpErrorMessage(parsedBody);
    throw new Error(
      `Shared Ember Domain Service HTTP request failed with status ${response.status}${
        errorMessage === null ? '' : `: ${errorMessage}`
      }.`,
    );
  }

  const jsonRpcErrorMessage = readJsonRpcErrorMessage(parsedBody);
  if (jsonRpcErrorMessage) {
    throw new Error(`Shared Ember Domain Service JSON-RPC error: ${jsonRpcErrorMessage}`);
  }

  return parsedBody;
}

let nextTransportRequestId = 1;

async function postJsonRpcResult(input: {
  baseUrl: string;
  method: string;
  params: Record<string, unknown>;
}): Promise<unknown> {
  const response = await postJson({
    url: `${input.baseUrl}/jsonrpc`,
    body: {
      jsonrpc: '2.0',
      id: `shared-ember-transport-${input.method}-${nextTransportRequestId++}`,
      method: input.method,
      params: input.params,
    },
  });

  return readJsonRpcResult(response);
}

export function resolveEmberLendingSharedEmberBaseUrl(
  env: EmberLendingSharedEmberHttpHostEnv = process.env,
): string | null {
  const normalized = env['SHARED_EMBER_BASE_URL']?.trim();
  return normalized ? trimTrailingSlash(normalized) : null;
}

export function createEmberLendingSharedEmberHttpHost(input: {
  baseUrl: string;
}): EmberLendingSharedEmberProtocolHost {
  const baseUrl = trimTrailingSlash(input.baseUrl);

  return {
    async handleJsonRpc(request) {
      return postJson({
        url: `${baseUrl}/jsonrpc`,
        body: request,
      });
    },

    async readCommittedEventOutbox(request) {
      return postJsonRpcResult({
        baseUrl,
        method: 'readCommittedEventOutbox.v1',
        params: {
          consumer_id: (request as Record<string, unknown>)['consumer_id'],
          after_sequence: (request as Record<string, unknown>)['after_sequence'],
          limit: (request as Record<string, unknown>)['limit'],
        },
      });
    },

    async acknowledgeCommittedEventOutbox(request) {
      return postJsonRpcResult({
        baseUrl,
        method: 'ackCommittedEventOutbox.v1',
        params: {
          consumer_id: (request as Record<string, unknown>)['consumer_id'],
          delivered_through_sequence: (request as Record<string, unknown>)['delivered_through_sequence'],
        },
      });
    },
  };
}
