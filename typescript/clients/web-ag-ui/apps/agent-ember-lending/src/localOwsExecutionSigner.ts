import type { EmberLendingExecutionSigner } from './sharedEmberAdapter.js';

const jsonContentType = 'application/json; charset=utf-8';

type EmberLendingLocalOwsSignerEnv = NodeJS.ProcessEnv & {
  EMBER_LENDING_OWS_BASE_URL?: string;
};

function trimTrailingSlash(value: string): string {
  return value.endsWith('/') ? value.slice(0, -1) : value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function readErrorMessage(body: unknown): string | null {
  if (!isRecord(body)) {
    return null;
  }

  const message = body['message'];
  return typeof message === 'string' && message.trim().length > 0 ? message : null;
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
    throw new Error(`Local OWS signer HTTP request failed with status ${response.status}.`);
  }

  const errorMessage = readErrorMessage(parsedBody);
  if (errorMessage) {
    throw new Error(`Local OWS signer error: ${errorMessage}`);
  }

  return parsedBody;
}

export function resolveEmberLendingLocalOwsBaseUrl(
  env: EmberLendingLocalOwsSignerEnv = process.env,
): string | null {
  const normalized = env['EMBER_LENDING_OWS_BASE_URL']?.trim();
  return normalized ? trimTrailingSlash(normalized) : null;
}

export function createEmberLendingLocalOwsExecutionSigner(input: {
  baseUrl: string;
}): EmberLendingExecutionSigner {
  const baseUrl = trimTrailingSlash(input.baseUrl);

  return {
    async signExecutionPackage(request) {
      return (await postJson({
        url: `${baseUrl}/sign/execution`,
        body: request,
      })) as Awaited<ReturnType<EmberLendingExecutionSigner['signExecutionPackage']>>;
    },

    async signRedelegationPackage(request) {
      return (await postJson({
        url: `${baseUrl}/sign/redelegation`,
        body: request,
      })) as Awaited<
        ReturnType<NonNullable<EmberLendingExecutionSigner['signRedelegationPackage']>>
      >;
    },
  };
}
