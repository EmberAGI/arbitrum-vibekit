import { z } from 'zod';

import { resolveE2EProfile } from '../config/constants.js';

type PositionSide = 'long' | 'short';

type ScenarioPosition = {
  walletAddress: `0x${string}`;
  marketAddress: `0x${string}`;
  positionSide: PositionSide;
  contractKey: `0x${string}`;
};

type ScenarioState = {
  alloraCallsByTopic: Map<string, number>;
  positionsByWallet: Map<string, ScenarioPosition>;
  txCounter: number;
};

const HexAddressSchema = z.string().regex(/^0x[a-fA-F0-9]{40}$/u);

const IncreasePlanRequestSchema = z.object({
  walletAddress: HexAddressSchema,
  marketAddress: HexAddressSchema,
  side: z.enum(['long', 'short']),
});

const DecreasePlanRequestSchema = z.object({
  walletAddress: HexAddressSchema,
  marketAddress: HexAddressSchema,
  side: z.enum(['long', 'short']),
  decrease: z.discriminatedUnion('mode', [
    z.object({
      mode: z.literal('full'),
      slippageBps: z.string(),
    }),
    z.object({
      mode: z.literal('partial'),
      sizeDeltaUsd: z.string(),
      slippageBps: z.string(),
    }),
  ]),
});

const USDC_ADDRESS = '0x1111111111111111111111111111111111111111' as const;
const BTC_MARKET_ADDRESS = '0x0000000000000000000000000000000000000001' as const;
const CHAIN_ID = '42161' as const;

const ALLORA_TOPIC_SEQUENCE: Record<string, readonly string[]> = {
  '14': ['47000', '47000', '43000', '42000'],
  '2': ['3200', '3200', '2900', '2800'],
};

const createState = (): ScenarioState => ({
  alloraCallsByTopic: new Map<string, number>(),
  positionsByWallet: new Map<string, ScenarioPosition>(),
  txCounter: 0,
});

const normalizeWalletAddress = (value: string): `0x${string}` => value.toLowerCase() as `0x${string}`;

const nextTopicValue = (state: ScenarioState, topicId: string): string => {
  const current = (state.alloraCallsByTopic.get(topicId) ?? 0) + 1;
  state.alloraCallsByTopic.set(topicId, current);
  const sequence = ALLORA_TOPIC_SEQUENCE[topicId];
  if (!sequence || sequence.length === 0) {
    return '100';
  }
  return sequence[Math.min(current - 1, sequence.length - 1)] ?? '100';
};

const nextContractKey = (state: ScenarioState): `0x${string}` => {
  state.txCounter += 1;
  const hex = state.txCounter.toString(16).padStart(64, '0');
  return `0x${hex}`;
};

const buildToken = (address: `0x${string}`, symbol: string, name: string, decimals: number) => ({
  tokenUid: { chainId: CHAIN_ID, address },
  name,
  symbol,
  isNative: false,
  decimals,
  iconUri: null,
  isVetted: true,
});

const buildMarketsPayload = () => ({
  cursor: null,
  currentPage: 1,
  totalPages: 1,
  totalItems: 1,
  markets: [
    {
      marketToken: { chainId: CHAIN_ID, address: BTC_MARKET_ADDRESS },
      longFundingFee: '0',
      shortFundingFee: '0',
      longBorrowingFee: '0',
      shortBorrowingFee: '0',
      chainId: CHAIN_ID,
      name: 'GMX BTC/USD',
      indexToken: buildToken('0x2222222222222222222222222222222222222222', 'BTC', 'Bitcoin', 8),
      longToken: buildToken(USDC_ADDRESS, 'USDC', 'USD Coin', 6),
      shortToken: buildToken(USDC_ADDRESS, 'USDC', 'USD Coin', 6),
    },
  ],
});

const buildWalletBalancesPayload = (walletAddress: `0x${string}`) => ({
  cursor: null,
  currentPage: 1,
  totalPages: 1,
  totalItems: 1,
  balances: [
    {
      tokenUid: { chainId: CHAIN_ID, address: USDC_ADDRESS },
      amount: '1000000000',
      symbol: 'USDC',
      valueUsd: 1000,
      decimals: 6,
      walletAddress,
    },
  ],
});

const buildPositionsPayload = (position?: ScenarioPosition) => ({
  cursor: null,
  currentPage: 1,
  totalPages: 1,
  totalItems: position ? 1 : 0,
  positions: position
    ? [
        {
          chainId: CHAIN_ID,
          key: position.contractKey,
          contractKey: position.contractKey,
          account: position.walletAddress,
          marketAddress: position.marketAddress,
          sizeInUsd: '2000000000000000000000000000000',
          sizeInTokens: '1',
          collateralAmount: '200000000',
          pendingBorrowingFeesUsd: '0',
          increasedAtTime: '0',
          decreasedAtTime: '0',
          positionSide: position.positionSide,
          isLong: position.positionSide === 'long',
          fundingFeeAmount: '0',
          claimableLongTokenAmount: '0',
          claimableShortTokenAmount: '0',
          isOpening: false,
          pnl: '0',
          positionFeeAmount: '0',
          traderDiscountAmount: '0',
          uiFeeAmount: '0',
          collateralToken: buildToken(USDC_ADDRESS, 'USDC', 'USD Coin', 6),
        },
      ]
    : [],
});

const buildTransactionResponse = () => ({
  transactions: [
    {
      type: 'transaction',
      to: '0x3333333333333333333333333333333333333333',
      data: '0xdeadbeef',
      value: '0',
      chainId: CHAIN_ID,
    },
  ],
});

let setupPromise: Promise<void> | null = null;

export async function setupAgentLocalE2EMocksIfNeeded(): Promise<void> {
  if (resolveE2EProfile() !== 'mocked') {
    return;
  }

  if (setupPromise) {
    await setupPromise;
    return;
  }

  setupPromise = (async () => {
    const [{ setupServer }, { http, HttpResponse }] = await Promise.all([
      import('msw/node'),
      import('msw'),
    ]);

    const state = createState();

    const server = setupServer(
      http.get('*/v2/allora/consumer/:chainId', ({ request }) => {
        const url = new URL(request.url);
        const topicId = url.searchParams.get('allora_topic_id') ?? '0';
        const combined = nextTopicValue(state, topicId);
        return HttpResponse.json({
          status: true,
          data: {
            inference_data: {
              topic_id: topicId,
              network_inference_normalized: combined,
            },
          },
        });
      }),
      http.get('*/perpetuals/markets', () => {
        return HttpResponse.json(buildMarketsPayload());
      }),
      http.get('*/perpetuals/positions/:walletAddress', ({ params }) => {
        const walletAddress = normalizeWalletAddress(String(params['walletAddress'] ?? ''));
        const position = state.positionsByWallet.get(walletAddress);
        return HttpResponse.json(buildPositionsPayload(position));
      }),
      http.get('*/wallet/balances/:walletAddress', ({ params }) => {
        const walletAddress = normalizeWalletAddress(String(params['walletAddress'] ?? ''));
        return HttpResponse.json(buildWalletBalancesPayload(walletAddress));
      }),
      http.post('*/perpetuals/increase/plan', async ({ request }) => {
        const parsed = IncreasePlanRequestSchema.parse(await request.json());
        const walletAddress = normalizeWalletAddress(parsed.walletAddress);
        const marketAddress = normalizeWalletAddress(parsed.marketAddress);
        state.positionsByWallet.set(walletAddress, {
          walletAddress,
          marketAddress,
          positionSide: parsed.side,
          contractKey: nextContractKey(state),
        });
        return HttpResponse.json(buildTransactionResponse());
      }),
      http.post('*/perpetuals/decrease/plan', async ({ request }) => {
        const parsed = DecreasePlanRequestSchema.parse(await request.json());
        const walletAddress = normalizeWalletAddress(parsed.walletAddress);
        const marketAddress = normalizeWalletAddress(parsed.marketAddress);
        const existing = state.positionsByWallet.get(walletAddress);
        if (
          existing &&
          existing.marketAddress === marketAddress &&
          existing.positionSide === parsed.side &&
          parsed.decrease.mode === 'full'
        ) {
          state.positionsByWallet.delete(walletAddress);
        }
        return HttpResponse.json(buildTransactionResponse());
      }),
    );

    server.listen({ onUnhandledRequest: 'bypass' });
    console.info('[gmx-allora] E2E mocked profile enabled with agent-local MSW handlers');
  })();

  await setupPromise;
}
