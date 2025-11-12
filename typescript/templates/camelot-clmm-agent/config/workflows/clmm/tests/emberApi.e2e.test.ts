import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { ARBITRUM_CHAIN_ID } from '../src/constants.js';
import {
  EmberCamelotClient,
  fetchPoolSnapshot,
  normalizePool,
  type ClmmRebalanceRequest,
  type ClmmWithdrawRequest,
} from '../src/emberApi.js';
const BASE_URL =
  process.env['EMBER_API_BASE_URL']?.replace(/\/$/, '') ?? 'https://api.emberai.xyz';
const LIVE_TEST_TIMEOUT_MS = Number(process.env['EMBER_E2E_TIMEOUT_MS'] ?? 45_000);
const EMPTY_WALLET: `0x${string}` =
  (process.env['CLMM_E2E_EMPTY_WALLET'] ?? '0x0000000000000000000000000000000000000001') as `0x${string}`;

type RequestLogEntry = {
  url: string;
  method: string;
  body?: string;
};

const requestLog: RequestLogEntry[] = [];
const client = new EmberCamelotClient(BASE_URL);
const realFetch = globalThis.fetch.bind(globalThis);

function extractUrl(input: Parameters<typeof globalThis.fetch>[0]): string {
  if (typeof input === 'string') {
    return input;
  }

  if (input instanceof URL) {
    return input.toString();
  }

  if (typeof input === 'object' && input && 'url' in input) {
    const candidate = (input as { url?: unknown }).url;
    if (typeof candidate === 'string') {
      return candidate;
    }
  }

  throw new Error('Unsupported fetch input payload');
}

function extractMethod(
  input: Parameters<typeof globalThis.fetch>[0],
  init?: Parameters<typeof globalThis.fetch>[1],
): string {
  if (init?.method) {
    return init.method.toUpperCase();
  }

  if (typeof input === 'object' && input && 'method' in input) {
    const candidate = (input as { method?: unknown }).method;
    if (typeof candidate === 'string') {
      return candidate.toUpperCase();
    }
  }

  return 'GET';
}

function logRequest(
  input: Parameters<typeof globalThis.fetch>[0],
  init?: Parameters<typeof globalThis.fetch>[1],
) {
  requestLog.push({
    url: extractUrl(input),
    method: extractMethod(input, init),
    body: typeof init?.body === 'string' ? init.body : undefined,
  });
}

function lastRequestContaining(pathFragment: string) {
  return [...requestLog].reverse().find((entry) => entry.url.includes(pathFragment));
}

async function execute<T>(run: () => Promise<T>) {
  try {
    const data = await run();
    return { data };
  } catch (error) {
    return { error };
  }
}

describe('EmberCamelotClient (e2e)', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn> | undefined;

  beforeAll(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (...args) => {
      const [input, init] = args as Parameters<typeof globalThis.fetch>;
      logRequest(input, init);
      return realFetch(...args);
    });
  });

  afterAll(() => {
    fetchSpy?.mockRestore();
  });

  beforeEach(() => {
    requestLog.length = 0;
  });
  it(
    'targets GET /liquidity/pools as documented by Onchain Actions API',
    async () => {
      // Given the Swagger doc advertises GET /liquidity/pools for pool discovery
      const outcome = await execute(() => client.listCamelotPools(ARBITRUM_CHAIN_ID));
      const request = lastRequestContaining('/liquidity/');

      // Then the client must call the documented endpoint
      expect(request?.url).toContain('/liquidity/pools');
      expect(request?.method).toBe('GET');

      // And the call should succeed once the endpoint matches the docs
      expect(outcome.error).toBeUndefined();
      expect(outcome.data).toBeDefined();
      expect(Array.isArray(outcome.data)).toBe(true);
    },
    LIVE_TEST_TIMEOUT_MS,
  );

  it(
    'queries GET /liquidity/positions/{walletAddress} for wallet balances',
    async () => {
      // Given the docs expose wallet-specific positions at /liquidity/positions/{walletAddress}
      const outcome = await execute(() => client.getWalletPositions(EMPTY_WALLET, ARBITRUM_CHAIN_ID));
      const request = lastRequestContaining('/liquidity/');

      // Then the request path should include the wallet-aware endpoint
      expect(request?.url).toContain(`/liquidity/positions/${EMPTY_WALLET}`);
      expect(request?.method).toBe('GET');

      // And the API should respond with a well-formed list once wired correctly
      expect(outcome.error).toBeUndefined();
      expect(outcome.data).toBeDefined();
      expect(Array.isArray(outcome.data)).toBe(true);
    },
    LIVE_TEST_TIMEOUT_MS,
  );

  it(
    'posts CLMM plans to POST /liquidity/supply',
    async () => {
      // Given the supply endpoint creates concentrated liquidity plans according to the docs
      const chainIdString = ARBITRUM_CHAIN_ID.toString();
      const payload: ClmmRebalanceRequest = {
        walletAddress: EMPTY_WALLET,
        supplyChain: chainIdString,
        poolIdentifier: {
          chainId: chainIdString,
          address: '0xd845f7D4f4DeB9Ff5bCf09D140Ef13718F6f6C71',
        },
        range: {
          type: 'limited',
          minPrice: '1',
          maxPrice: '2',
        },
        payableTokens: [
          {
            tokenUid: {
              chainId: chainIdString,
              address: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
            },
            amount: '0',
          },
          {
            tokenUid: {
              chainId: chainIdString,
              address: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
            },
            amount: '0',
          },
        ],
      };

      const outcome = await execute(() => client.requestRebalance(payload));
      const request = lastRequestContaining('/liquidity/');

      // Then the client should post to /liquidity/supply per the API documentation
      expect(request?.url).toContain('/liquidity/supply');
      expect(request?.method).toBe('POST');

      // And once implemented, the request should yield a transaction plan
      expect(outcome.error).toBeUndefined();
      expect(outcome.data).toBeDefined();
      expect(Array.isArray(outcome.data?.transactions)).toBe(true);
    },
    LIVE_TEST_TIMEOUT_MS,
  );

  it(
    'routes exit/compound flows through POST /liquidity/withdraw',
    async () => {
      // Given the withdrawal endpoint automatically claims fees while removing liquidity
      const chainIdString = ARBITRUM_CHAIN_ID.toString();
      const payload: ClmmWithdrawRequest = {
        walletAddress: EMPTY_WALLET,
        poolTokenUid: {
          chainId: chainIdString,
          address: '0xd845f7D4f4DeB9Ff5bCf09D140Ef13718F6f6C71',
        },
      };

      const outcome = await execute(() => client.requestWithdrawal(payload));
      const request = lastRequestContaining('/liquidity/');

      // Then the client should post to /liquidity/withdraw per the published docs
      expect(request?.url).toContain('/liquidity/withdraw');
      expect(request?.method).toBe('POST');

      // And the current API behavior should surface the LP-token validation failure
      expect(outcome.error).toBeInstanceOf(Error);
      expect((outcome.error as Error).message).toContain('Token ID not found');
    },
    LIVE_TEST_TIMEOUT_MS,
  );
  it(
    'fetchPoolSnapshot locates pools case-insensitively via live API',
    async () => {
      // Given a real Camelot pool address from Ember
      const pools = await client.listCamelotPools(ARBITRUM_CHAIN_ID);
      expect(pools.length).toBeGreaterThan(0);
      const targetPool = pools[0]!;

      // When we request a snapshot using a differently cased address
      const snapshot = await fetchPoolSnapshot(
        client,
        targetPool.address.toUpperCase() as `0x${string}`,
        ARBITRUM_CHAIN_ID,
      );

      // Then the helper should still resolve the same pool details
      expect(snapshot?.address.toLowerCase()).toBe(targetPool.address.toLowerCase());
      expect(snapshot?.token0.address).toBeDefined();
    },
    LIVE_TEST_TIMEOUT_MS,
  );

  it(
    'normalizePool surfaces numeric ticks and bigint liquidity for live pools',
    async () => {
      // Given a live pool from Ember
      const pools = await client.listCamelotPools(ARBITRUM_CHAIN_ID);
      expect(pools.length).toBeGreaterThan(0);

      // When we normalize it for workflow consumption
      const normalized = normalizePool(pools[0]!);

      // Then tick data should be numeric and liquidity converted to bigint
      expect(typeof normalized.tick).toBe('number');
      expect(typeof normalized.tickSpacing).toBe('number');
      expect(typeof normalized.liquidity).toBe('bigint');
      expect(typeof normalized.token0Usd).toBe('number');
      expect(typeof normalized.token1Usd).toBe('number');
    },
    LIVE_TEST_TIMEOUT_MS,
  );
});
