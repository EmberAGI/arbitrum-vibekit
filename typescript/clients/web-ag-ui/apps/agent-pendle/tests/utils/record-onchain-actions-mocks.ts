import { getAddress, parseUnits } from 'viem';

import { recordMockData } from '../mocks/utils/mock-loader.js';

const DEFAULT_TEST_WALLET = '0x3fd83e40F96C3c81A807575F959e55C34a40e523';
const DEFAULT_CHAIN_ID = '42161';

type RecordedResponse = {
  status: number;
  headers: Record<string, string>;
  rawBody: string;
  json: unknown;
};

const resolveBaseUrl = (): string =>
  process.env['ONCHAIN_ACTIONS_RECORDING_URL'] ??
  process.env['ONCHAIN_ACTIONS_API_URL'] ??
  'https://api.emberai.xyz';

const resolveWalletAddress = (): `0x${string}` =>
  (process.env['SMOKE_WALLET'] ?? DEFAULT_TEST_WALLET) as `0x${string}`;

const toBase64 = (buffer: ArrayBuffer): string => Buffer.from(buffer).toString('base64');

const readResponse = async (response: Response): Promise<RecordedResponse> => {
  const arrayBuffer = await response.arrayBuffer();
  const rawBody = toBase64(arrayBuffer);
  const text = Buffer.from(arrayBuffer).toString('utf-8');
  const json = text ? (JSON.parse(text) as unknown) : undefined;

  const headers: Record<string, string> = {};
  response.headers.forEach((value, key) => {
    headers[key] = value;
  });

  return {
    status: response.status,
    headers,
    rawBody,
    json,
  };
};

const requestJson = async (url: string, init?: RequestInit): Promise<RecordedResponse> => {
  const response = await fetch(url, {
    ...init,
    headers: {
      Accept: 'application/json',
      'User-Agent': 'pendle-mock-recorder/1.0',
      ...(init?.headers ?? {}),
    },
  });
  return readResponse(response);
};

const probeEndpoint = async (params: {
  baseUrl: string;
  method: 'GET' | 'POST';
  path: string;
  query?: Record<string, string>;
  body?: unknown;
}): Promise<RecordedResponse> => {
  const url = new URL(params.path, params.baseUrl);
  if (params.query) {
    Object.entries(params.query).forEach(([key, value]) => url.searchParams.append(key, value));
  }
  return requestJson(url.toString(), {
    method: params.method,
    ...(params.body ? { body: JSON.stringify(params.body), headers: { 'Content-Type': 'application/json' } } : {}),
  });
};

const recordEndpoint = async (params: {
  baseUrl: string;
  method: 'GET' | 'POST';
  path: string;
  key: string;
  query?: Record<string, string>;
  body?: unknown;
}): Promise<RecordedResponse> => {
  const url = new URL(params.path, params.baseUrl);
  if (params.query) {
    Object.entries(params.query).forEach(([key, value]) => url.searchParams.append(key, value));
  }

  const response = await requestJson(url.toString(), {
    method: params.method,
    ...(params.body ? { body: JSON.stringify(params.body), headers: { 'Content-Type': 'application/json' } } : {}),
  });

  await recordMockData(
    'onchain-actions',
    url.pathname,
    params.method,
    {
      params: params.query,
      body: params.body,
    },
    {
      status: response.status,
      headers: response.headers,
      rawBody: response.rawBody,
    },
    params.key,
  );

  return response;
};

const recordPaginated = async (params: {
  baseUrl: string;
  path: string;
  keyPrefix: string;
  query?: Record<string, string>;
  itemsKey: string;
}): Promise<unknown[]> => {
  const first = await recordEndpoint({
    baseUrl: params.baseUrl,
    method: 'GET',
    path: params.path,
    key: `${params.keyPrefix}-page-1`,
    query: params.query,
  });

  const firstJson = first.json as { totalPages?: number; cursor?: string; [key: string]: unknown };
  const items = Array.isArray(firstJson?.[params.itemsKey])
    ? (firstJson?.[params.itemsKey] as unknown[])
    : [];

  const totalPages = typeof firstJson?.totalPages === 'number' ? firstJson.totalPages : 1;
  const cursor = typeof firstJson?.cursor === 'string' ? firstJson.cursor : undefined;

  if (!cursor || totalPages <= 1) {
    return items;
  }

  for (let page = 2; page <= totalPages; page += 1) {
    const pageResponse = await recordEndpoint({
      baseUrl: params.baseUrl,
      method: 'GET',
      path: params.path,
      key: `${params.keyPrefix}-page-${page}`,
      query: {
        ...(params.query ?? {}),
        cursor,
        page: page.toString(),
      },
    });

    const pageJson = pageResponse.json as Record<string, unknown>;
    const pageItems = Array.isArray(pageJson?.[params.itemsKey])
      ? (pageJson?.[params.itemsKey] as unknown[])
      : [];
    items.push(...pageItems);
  }

  return items;
};

const findTokenBySymbol = (tokens: Array<{ symbol?: string; tokenUid?: { chainId?: string } }>, symbol: string) =>
  tokens.find(
    (token) =>
      token.symbol?.toLowerCase() === symbol.toLowerCase() &&
      token.tokenUid?.chainId === DEFAULT_CHAIN_ID,
  );

const findMarketByUnderlyingSymbol = (
  markets: Array<{ underlyingToken?: { symbol?: string; tokenUid?: { chainId?: string } } }>,
  symbol: string,
) =>
  markets.find(
    (market) =>
      market.underlyingToken?.symbol?.toLowerCase() === symbol.toLowerCase() &&
      market.underlyingToken?.tokenUid?.chainId === DEFAULT_CHAIN_ID,
  );

const normalizeTokenUid = (tokenUid: { chainId?: string; address?: string }) => {
  if (!tokenUid.address) {
    return tokenUid;
  }
  return {
    ...tokenUid,
    address: getAddress(tokenUid.address),
  };
};

const pickPlanningMarket = async (params: {
  baseUrl: string;
  walletAddress: `0x${string}`;
  markets: Array<{
    marketIdentifier?: { address?: string; chainId?: string };
    underlyingToken?: { tokenUid?: { chainId?: string }; decimals?: number; symbol?: string };
  }>;
}): Promise<{ address: string; index: number }> => {
  for (let index = 0; index < params.markets.length; index += 1) {
    const market = params.markets[index];
    const rawMarketAddress = market.marketIdentifier?.address;
    const marketAddress = rawMarketAddress ? getAddress(rawMarketAddress) : undefined;
    const underlyingUid = market.underlyingToken?.tokenUid
      ? normalizeTokenUid(market.underlyingToken.tokenUid)
      : undefined;
    if (!marketAddress || !underlyingUid || market.marketIdentifier?.chainId !== DEFAULT_CHAIN_ID) {
      continue;
    }
    const decimals = market.underlyingToken?.decimals;
    const symbol = market.underlyingToken?.symbol ?? 'underlying';
    if (!Number.isInteger(decimals) || decimals === undefined || decimals < 0) {
      continue;
    }
    const amountHuman = symbol.toLowerCase().includes('usd') ? '3' : '0.01';
    const amount = parseUnits(amountHuman, decimals).toString();
    const response = await probeEndpoint({
      baseUrl: params.baseUrl,
      method: 'POST',
      path: '/tokenizedYield/buyPt',
      body: {
        walletAddress: params.walletAddress,
        marketAddress,
        inputTokenUid: underlyingUid,
        amount,
        slippage: '0.5',
      },
    });
    if (response.status === 200) {
      return { address: marketAddress, index };
    }
  }
  throw new Error('Unable to locate a Pendle market that supports buyPt planning.');
};

const main = async (): Promise<void> => {
  const baseUrl = resolveBaseUrl();
  const walletAddress = resolveWalletAddress();

  console.log(`[record] Recording onchain-actions mocks from ${baseUrl}`);

  const tokens = await recordPaginated({
    baseUrl,
    path: '/tokens',
    keyPrefix: 'tokens',
    query: { chainIds: DEFAULT_CHAIN_ID },
    itemsKey: 'tokens',
  });

  const markets = await recordPaginated({
    baseUrl,
    path: '/tokenizedYield/markets',
    keyPrefix: 'markets',
    query: { chainIds: DEFAULT_CHAIN_ID },
    itemsKey: 'markets',
  });

  await recordPaginated({
    baseUrl,
    path: `/tokenizedYield/positions/${walletAddress}`,
    keyPrefix: 'positions',
    query: { chainIds: DEFAULT_CHAIN_ID },
    itemsKey: 'positions',
  });

  await recordPaginated({
    baseUrl,
    path: `/wallet/balances/${walletAddress}`,
    keyPrefix: 'balances',
    itemsKey: 'balances',
  });

  const usdc = findTokenBySymbol(tokens as Array<{ symbol?: string; tokenUid?: { chainId?: string } }>, 'USDC');
  if (!usdc) {
    throw new Error('Unable to locate USDC token in recorded token list.');
  }

  const planningMarketAddress = await pickPlanningMarket({
    baseUrl,
    walletAddress,
    markets: markets as Array<{
      marketIdentifier?: { address?: string; chainId?: string };
      underlyingToken?: { tokenUid?: { chainId?: string }; decimals?: number; symbol?: string };
    }>,
  });

  const market = markets[planningMarketAddress.index] as {
    marketIdentifier?: { address?: string };
    ptToken?: { tokenUid?: { address?: string } };
    ytToken?: { tokenUid?: { address?: string } };
    underlyingToken?: { tokenUid?: { address?: string } };
  };

  if (!market?.marketIdentifier?.address || !market.ptToken?.tokenUid?.address) {
    throw new Error('Unable to locate a Pendle market to record transaction planning.');
  }

  const underlyingUid = market.underlyingToken?.tokenUid
    ? normalizeTokenUid(market.underlyingToken.tokenUid)
    : undefined;
  if (!underlyingUid) {
    throw new Error('Selected market is missing underlying token metadata.');
  }

  const usdcUid = normalizeTokenUid(
    (usdc as { tokenUid?: { chainId?: string; address?: string } }).tokenUid!,
  );

  await recordEndpoint({
    baseUrl,
    method: 'POST',
    path: '/swap',
    key: `swap-exactin-${usdcUid.address?.toLowerCase() ?? 'unknown'}-${underlyingUid.address?.toLowerCase() ?? 'unknown'}`,
    body: {
      walletAddress,
      amount: '1000000',
      amountType: 'exactIn',
      fromTokenUid: usdcUid,
      toTokenUid: underlyingUid,
      slippageTolerance: '1.0',
    },
  });

  await recordEndpoint({
    baseUrl,
    method: 'POST',
    path: '/tokenizedYield/buyPt',
    key: `buy-pt-${market.marketIdentifier.address.toLowerCase()}`,
    body: {
      walletAddress,
      marketAddress: getAddress(market.marketIdentifier.address),
      inputTokenUid: underlyingUid,
      amount: '1000000',
      slippage: '0.5',
    },
  });

  await recordEndpoint({
    baseUrl,
    method: 'POST',
    path: '/tokenizedYield/sellPt',
    key: `sell-pt-${market.ptToken.tokenUid.address!.toLowerCase()}`,
    body: {
      walletAddress,
      ptTokenUid: normalizeTokenUid(market.ptToken.tokenUid),
      amount: '1000000',
      slippage: '0.5',
    },
  });

  await recordEndpoint({
    baseUrl,
    method: 'POST',
    path: '/tokenizedYield/redeemPt',
    key: `redeem-pt-${market.ptToken.tokenUid.address!.toLowerCase()}`,
    body: {
      walletAddress,
      ptTokenUid: normalizeTokenUid(market.ptToken.tokenUid),
      amount: '1000000',
    },
  });

  await recordEndpoint({
    baseUrl,
    method: 'POST',
    path: '/tokenizedYield/claimRewards',
    key: `claim-rewards-${market.ytToken?.tokenUid?.address?.toLowerCase() ?? 'unknown'}`,
    body: {
      walletAddress,
      ytTokenUid: market.ytToken?.tokenUid ? normalizeTokenUid(market.ytToken.tokenUid) : undefined,
    },
  });

  console.log(`[record] Selected market for planning: ${market.marketIdentifier.address}`);
  console.log('[record] Done.');
};

main().catch((error) => {
  console.error('[record] Failed:', error instanceof Error ? error.message : String(error));
  process.exit(1);
});
