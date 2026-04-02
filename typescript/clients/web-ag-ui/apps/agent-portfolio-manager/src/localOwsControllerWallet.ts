type PortfolioManagerLocalOwsControllerWalletEnv = NodeJS.ProcessEnv & {
  PORTFOLIO_MANAGER_OWS_BASE_URL?: string;
};

const jsonContentType = 'application/json; charset=utf-8';

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

function readControllerWalletAddress(body: unknown): `0x${string}` | null {
  if (!isRecord(body)) {
    return null;
  }

  const walletAddress =
    body['controller_wallet_address'] ?? body['controller_address'] ?? body['wallet_address'];

  return typeof walletAddress === 'string' && walletAddress.startsWith('0x')
    ? (walletAddress as `0x${string}`)
    : null;
}

async function requestJson(input: {
  url: string;
}): Promise<unknown> {
  const response = await fetch(input.url, {
    method: 'GET',
    headers: {
      'content-type': jsonContentType,
    },
  });

  const rawBody = await response.text();
  const parsedBody = rawBody.length === 0 ? null : (JSON.parse(rawBody) as unknown);

  if (!response.ok) {
    throw new Error(`Local OWS controller HTTP request failed with status ${response.status}.`);
  }

  const errorMessage = readErrorMessage(parsedBody);
  if (errorMessage) {
    throw new Error(`Local OWS controller error: ${errorMessage}`);
  }

  return parsedBody;
}

export function resolvePortfolioManagerLocalOwsBaseUrl(
  env: PortfolioManagerLocalOwsControllerWalletEnv = process.env,
): string | null {
  const normalized = env.PORTFOLIO_MANAGER_OWS_BASE_URL?.trim();
  return normalized ? trimTrailingSlash(normalized) : null;
}

export function createPortfolioManagerLocalOwsControllerWallet(input: {
  baseUrl: string;
}): {
  readControllerWalletAddress: () => Promise<`0x${string}`>;
} {
  const baseUrl = trimTrailingSlash(input.baseUrl);

  return {
    async readControllerWalletAddress() {
      const responseBody = await requestJson({
        url: `${baseUrl}/identity`,
      });
      const walletAddress = readControllerWalletAddress(responseBody);
      if (!walletAddress) {
        throw new Error('Local OWS controller identity response was missing a wallet address.');
      }

      return walletAddress;
    },
  };
}
