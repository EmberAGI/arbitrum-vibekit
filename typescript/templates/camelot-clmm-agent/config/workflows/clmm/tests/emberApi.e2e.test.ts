import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ARBITRUM_CHAIN_ID,
  DEFAULT_REBALANCE_THRESHOLD_PCT,
  DEFAULT_TICK_BANDWIDTH_BPS,
  MAX_GAS_SPEND_ETH,
  SAFETY_NET_MAX_IDLE_CYCLES,
  resolveEthUsdPrice,
} from '../src/constants.js';
import { deriveMidPrice, evaluateDecision, normalizePosition } from '../src/decision-engine.js';
import {
  EmberCamelotClient,
  fetchPoolSnapshot,
  normalizePool,
  type ClmmRebalanceRequest,
  type ClmmWithdrawRequest,
} from '../src/emberApi.js';
const BASE_URL = process.env['EMBER_API_BASE_URL']?.replace(/\/$/, '') ?? 'https://api.emberai.xyz';
const LIVE_TEST_TIMEOUT_MS = Number(process.env['EMBER_E2E_TIMEOUT_MS'] ?? 45_000);
const EMPTY_WALLET: `0x${string}` = (process.env['CLMM_E2E_EMPTY_WALLET'] ??
  '0x0000000000000000000000000000000000000001') as `0x${string}`;
const LIVE_LP_WALLET: `0x${string}` = (process.env['CLMM_E2E_LIVE_WALLET'] ??
  '0x2d2c313ec7650995b193a34e16be5b86eede872d') as `0x${string}`;

type RequestLogEntry = {
  url: string;
  method: string;
  body?: string;
};

const requestLog: RequestLogEntry[] = [];
const client = new EmberCamelotClient(BASE_URL);
const realFetch = globalThis.fetch.bind(globalThis);
type ExecutionResult<T> = { data: T; error?: undefined } | { data?: undefined; error: Error };

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

async function execute<T>(run: () => Promise<T>): Promise<ExecutionResult<T>> {
  try {
    const data = await run();
    return { data };
  } catch (error) {
    const failure =
      error instanceof Error
        ? error
        : new Error(typeof error === 'string' ? error : 'Unknown error');
    return { error: failure };
  }
}

async function discoverLiveWalletContext() {
  const [pools, positions] = await Promise.all([
    client.listCamelotPools(ARBITRUM_CHAIN_ID),
    client.getWalletPositions(LIVE_LP_WALLET, ARBITRUM_CHAIN_ID),
  ]);
  if (positions.length === 0) {
    console.warn('Live LP wallet has no active Camelot positions');
    return null;
  }
  const livePosition = positions[0];
  const pool = pools.find(
    (candidate) => candidate.address.toLowerCase() === livePosition.poolAddress.toLowerCase(),
  );
  if (!pool) {
    console.warn('Unable to match live wallet position to Camelot pool list');
    return null;
  }
  return { pool, position: livePosition };
}

async function fetchLivePoolIdentifier() {
  type WalletPositionsResponse = {
    positions?: Array<{
      poolIdentifier?: {
        chainId: string;
        address: string;
      };
    }>;
  };
  const response = await realFetch(
    `${BASE_URL}/liquidity/positions/${LIVE_LP_WALLET}?chainId=${ARBITRUM_CHAIN_ID}`,
  );
  if (!response.ok) {
    throw new Error(`Unable to load raw wallet positions (${response.status})`);
  }
  const payload = (await response.json()) as WalletPositionsResponse;
  const identifier = payload.positions?.[0]?.poolIdentifier;
  if (!identifier) {
    console.warn('Live wallet returned no pool identifier');
    return null;
  }
  return {
    chainId: identifier.chainId,
    address: identifier.address as `0x${string}`,
  };
}

describe('EmberCamelotClient (e2e)', () => {
  let restoreFetch: (() => void) | undefined;

  beforeAll(() => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (...args) => {
      const [input, init] = args;
      logRequest(input, init);
      return realFetch(...args);
    });
    restoreFetch = () => {
      fetchSpy.mockRestore();
    };
  });

  afterAll(() => {
    restoreFetch?.();
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
      const outcome = await execute(() =>
        client.getWalletPositions(EMPTY_WALLET, ARBITRUM_CHAIN_ID),
      );
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
    'loads wallet positions for the delegated live LP wallet',
    async () => {
      // Given the funded LP wallet supplied in the PRD
      const positions = await client.getWalletPositions(LIVE_LP_WALLET, ARBITRUM_CHAIN_ID);

      // When we fetch its Camelot positions through the API client
      // Then the response should expose normalized ticks for at least one pool
      if (positions.length === 0) {
        console.warn('CLMM_E2E_LIVE_WALLET currently has no Camelot LP positions.');
        return;
      }
      const sample = positions[0];
      expect(sample.poolAddress).toMatch(/^0x/);
      expect(sample.tickUpper).toBeGreaterThanOrEqual(sample.tickLower);
    },
    LIVE_TEST_TIMEOUT_MS,
  );

  it(
    'requests a rebalance plan using the live wallet pool metadata',
    async () => {
      // Given the live wallet and its active pool
      const context = await discoverLiveWalletContext();
      if (!context) {
        console.warn('Skipping live rebalance plan test: no wallet context available.');
        return;
      }
      const { pool } = context;
      const chainIdString = ARBITRUM_CHAIN_ID.toString();
      const midPrice = deriveMidPrice(pool);
      const payload: ClmmRebalanceRequest = {
        walletAddress: LIVE_LP_WALLET,
        supplyChain: chainIdString,
        poolIdentifier: {
          chainId: chainIdString,
          address: pool.address,
        },
        range: {
          type: 'limited',
          minPrice: (midPrice * 0.99).toString(),
          maxPrice: (midPrice * 1.01).toString(),
        },
        payableTokens: [
          {
            tokenUid: {
              chainId: chainIdString,
              address: pool.token0.address,
            },
            amount: '0',
          },
          {
            tokenUid: {
              chainId: chainIdString,
              address: pool.token1.address,
            },
            amount: '0',
          },
        ],
      };

      // When we request a plan from Ember
      const outcome = await execute(() => client.requestRebalance(payload));

      // Then the API should return a structured transaction list
      expect(outcome.error).toBeUndefined();
      expect(Array.isArray(outcome.data?.transactions)).toBe(true);
    },
    LIVE_TEST_TIMEOUT_MS,
  );

  it(
    'attempts a withdrawal plan using the live wallet poolTokenUid',
    async () => {
      // Given the raw Camelot pool identifier captured from the wallet’s position
      const poolTokenUid = await fetchLivePoolIdentifier();
      if (!poolTokenUid) {
        console.warn('Skipping live withdrawal test: wallet has no poolTokenUid data.');
        return;
      }
      const payload: ClmmWithdrawRequest = {
        walletAddress: LIVE_LP_WALLET,
        poolTokenUid,
      };

      // When we request a withdrawal/compound plan
      const plan = await client.requestWithdrawal(payload);

      // Then the API should respond with a transaction plan instead of schema errors
      expect(Array.isArray(plan.transactions)).toBe(true);
    },
    LIVE_TEST_TIMEOUT_MS,
  );

  it(
    'runs a decision-engine smoke test with live pool + wallet data',
    async () => {
      // Given the live pool snapshot and wallet position
      const context = await discoverLiveWalletContext();
      if (!context) {
        console.warn('Skipping decision-engine live test: no wallet context available.');
        return;
      }
      const { pool, position } = context;
      const normalizedPosition = normalizePosition(position);

      // When we feed the data into the decision engine
      const decision = evaluateDecision({
        pool,
        position: normalizedPosition,
        midPrice: deriveMidPrice(pool),
        volatilityPct: 0,
        cyclesSinceRebalance: 0,
        tickBandwidthBps: DEFAULT_TICK_BANDWIDTH_BPS,
        rebalanceThresholdPct: DEFAULT_REBALANCE_THRESHOLD_PCT,
        maxIdleCycles: SAFETY_NET_MAX_IDLE_CYCLES,
        autoCompoundFees: true,
        estimatedGasCostUsd: MAX_GAS_SPEND_ETH * resolveEthUsdPrice(),
        estimatedFeeValueUsd: undefined,
      });

      // Then it should yield a valid CLMM action with a non-empty rationale
      expect(['enter-range', 'adjust-range', 'hold', 'exit-range', 'compound-fees']).toContain(
        decision.kind,
      );
      expect(decision.reason).toMatch(/\w+/);
    },
    LIVE_TEST_TIMEOUT_MS,
  );

  it(
    'fetchPoolSnapshot locates pools case-insensitively via live API',
    async () => {
      // Given a real Camelot pool address from Ember
      const pools = await client.listCamelotPools(ARBITRUM_CHAIN_ID);
      expect(pools.length).toBeGreaterThan(0);
      const targetPool = pools[0];

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
    LIVE_TEST_TIMEOUT_MS * 2,
  );

  it(
    'normalizePool surfaces numeric ticks and bigint liquidity for live pools',
    async () => {
      // Given a live pool from Ember
      const pools = await client.listCamelotPools(ARBITRUM_CHAIN_ID);
      expect(pools.length).toBeGreaterThan(0);

      // When we normalize it for workflow consumption
      const normalized = normalizePool(pools[0]);

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
