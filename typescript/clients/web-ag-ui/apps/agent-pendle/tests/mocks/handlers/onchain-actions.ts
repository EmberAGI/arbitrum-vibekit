import { http } from 'msw';

import { loadFullMockData } from '../utils/mock-loader.js';

const decodeBody = (rawBody: string): Uint8Array => Buffer.from(rawBody, 'base64');

const respondWithMock = async (key: string): Promise<Response> => {
  const mock = await loadFullMockData('onchain-actions', key);
  if (!mock) {
    return new Response(JSON.stringify({ error: `Missing mock: ${key}` }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const headers = new Headers();
  if (mock.response.headers) {
    Object.entries(mock.response.headers).forEach(([name, value]) => {
      const normalized = name.toLowerCase();
      if (normalized === 'content-encoding' || normalized === 'content-length') {
        return;
      }
      headers.set(name, value);
    });
  }

  return new Response(decodeBody(mock.response.rawBody), {
    status: mock.response.status,
    headers,
  });
};

const keyForPage = (prefix: string, page?: string | null) => `${prefix}-page-${page ?? '1'}`;

const keyForSwap = (body: { fromTokenUid?: { address?: string }; toTokenUid?: { address?: string } }) => {
  const from = body.fromTokenUid?.address?.toLowerCase() ?? 'unknown';
  const to = body.toTokenUid?.address?.toLowerCase() ?? 'unknown';
  return `swap-exactin-${from}-${to}`;
};

const keyForBuyPt = (body: { marketAddress?: string }) =>
  `buy-pt-${body.marketAddress?.toLowerCase() ?? 'unknown'}`;

const keyForSellPt = (body: { ptTokenUid?: { address?: string } }) =>
  `sell-pt-${body.ptTokenUid?.address?.toLowerCase() ?? 'unknown'}`;

const keyForRedeemPt = (body: { ptTokenUid?: { address?: string } }) =>
  `redeem-pt-${body.ptTokenUid?.address?.toLowerCase() ?? 'unknown'}`;

const keyForClaimRewards = (body: { ytTokenUid?: { address?: string } }) =>
  `claim-rewards-${body.ytTokenUid?.address?.toLowerCase() ?? 'unknown'}`;

export const onchainActionsHandlers = [
  http.get('*/tokens', async ({ request }) => {
    const url = new URL(request.url);
    return respondWithMock(keyForPage('tokens', url.searchParams.get('page')));
  }),
  http.get('*/tokenizedYield/markets', async ({ request }) => {
    const url = new URL(request.url);
    return respondWithMock(keyForPage('markets', url.searchParams.get('page')));
  }),
  http.get('*/tokenizedYield/positions/:walletAddress', async ({ request }) => {
    const url = new URL(request.url);
    return respondWithMock(keyForPage('positions', url.searchParams.get('page')));
  }),
  http.get('*/wallet/balances/:walletAddress', async ({ request }) => {
    const url = new URL(request.url);
    return respondWithMock(keyForPage('balances', url.searchParams.get('page')));
  }),
  http.post('*/swap', async ({ request }) => {
    const body = (await request.json().catch(() => ({}))) as {
      fromTokenUid?: { address?: string };
      toTokenUid?: { address?: string };
    };
    return respondWithMock(keyForSwap(body));
  }),
  http.post('*/tokenizedYield/buyPt', async ({ request }) => {
    const body = (await request.json().catch(() => ({}))) as { marketAddress?: string };
    return respondWithMock(keyForBuyPt(body));
  }),
  http.post('*/tokenizedYield/sellPt', async ({ request }) => {
    const body = (await request.json().catch(() => ({}))) as { ptTokenUid?: { address?: string } };
    return respondWithMock(keyForSellPt(body));
  }),
  http.post('*/tokenizedYield/redeemPt', async ({ request }) => {
    const body = (await request.json().catch(() => ({}))) as { ptTokenUid?: { address?: string } };
    return respondWithMock(keyForRedeemPt(body));
  }),
  http.post('*/tokenizedYield/claimRewards', async ({ request }) => {
    const body = (await request.json().catch(() => ({}))) as { ytTokenUid?: { address?: string } };
    return respondWithMock(keyForClaimRewards(body));
  }),
];
