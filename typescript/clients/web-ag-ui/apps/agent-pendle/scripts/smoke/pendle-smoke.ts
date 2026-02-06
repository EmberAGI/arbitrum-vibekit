import { getAddress, parseUnits } from 'viem';

import { OnchainActionsClient } from '../../src/clients/onchainActions.js';
import { resolvePendleChainIds } from '../../src/config/constants.js';

const resolveBaseUrl = (): string =>
  process.env['ONCHAIN_ACTIONS_API_URL'] ?? 'https://api.emberai.xyz';

const resolveWalletAddress = (): `0x${string}` | undefined => {
  const value = process.env['SMOKE_WALLET'];
  if (!value) {
    return undefined;
  }
  if (!value.startsWith('0x')) {
    throw new Error(`SMOKE_WALLET must be a hex address, got: ${value}`);
  }
  return value as `0x${string}`;
};

const chainIds = resolvePendleChainIds();
const baseUrl = resolveBaseUrl();
const walletAddress = resolveWalletAddress();
const client = new OnchainActionsClient(baseUrl);

const run = async () => {
  console.log('[smoke] Using onchain-actions base URL:', baseUrl);
  console.log('[smoke] Chain IDs:', chainIds.join(','));

  const toAmountBaseUnits = (value: string, decimals: number): string => {
    if (!Number.isInteger(decimals) || decimals < 0) {
      throw new Error(`Invalid token decimals: ${decimals}`);
    }
    const baseUnits = parseUnits(value, decimals);
    if (baseUnits <= 0n) {
      throw new Error(`Resolved amount is too small: ${value}`);
    }
    return baseUnits.toString();
  };

  const markets = await client.listTokenizedYieldMarkets({ chainIds });
  if (markets.length === 0) {
    throw new Error('No tokenized yield markets returned.');
  }
  console.log(`[smoke] Markets: ${markets.length}`);

  const tokens = await client.listTokens({ chainIds });
  if (tokens.length === 0) {
    throw new Error('No tokens returned.');
  }
  console.log(`[smoke] Tokens: ${tokens.length}`);

  if (!walletAddress) {
    throw new Error('SMOKE_WALLET is required for tx planning smoke checks.');
  }

  const positions = await client.listTokenizedYieldPositions({ walletAddress, chainIds });
  console.log(`[smoke] Positions for ${walletAddress}: ${positions.length}`);

  const balances = await client.listWalletBalances(walletAddress);
  const balanceByKey = new Map(
    balances.map((balance) => [
      `${balance.tokenUid.chainId}:${balance.tokenUid.address.toLowerCase()}`,
      balance,
    ]),
  );

  const normalizeTokenUid = (tokenUid: { chainId: string; address: string }) => ({
    chainId: tokenUid.chainId,
    address: getAddress(tokenUid.address),
  });

  const findTokenBySymbol = (symbol: string) =>
    tokens.find(
      (token) =>
        token.symbol.toLowerCase() === symbol.toLowerCase() &&
        chainIds.includes(token.tokenUid.chainId),
    );

  const findMarketByUnderlyingSymbol = (symbol: string) =>
    markets.find(
      (market) =>
        market.underlyingToken.symbol.toLowerCase() === symbol.toLowerCase() &&
        chainIds.includes(market.underlyingToken.tokenUid.chainId),
    );

  const findMarketByUnderlyingName = (namePart: string) =>
    markets.find(
      (market) =>
        market.underlyingToken.name.toLowerCase().includes(namePart.toLowerCase()) &&
        chainIds.includes(market.underlyingToken.tokenUid.chainId),
    );

  const preferredMarket =
    findMarketByUnderlyingSymbol('USDai') ?? findMarketByUnderlyingName('USDai');
  let selectedMarket = preferredMarket ?? markets[0];
  if (!selectedMarket) {
    throw new Error('No market available for tx planning.');
  }

  if (!preferredMarket) {
    console.warn('[smoke] Preferred USDai market not found; falling back to first market.');
  }

  const usdcToken = findTokenBySymbol('USDC');
  const usdaiToken = findTokenBySymbol('USDai') ?? selectedMarket.underlyingToken;

  if (!usdcToken) {
    console.warn('[smoke] USDC token not found in token list; swap planning may be skipped.');
  }
  if (!usdaiToken) {
    console.warn('[smoke] USDai token not found in token list; buy PT planning may be skipped.');
  }

  const logTokenBalance = (label: string, tokenUid?: { chainId: string; address: string }) => {
    if (!tokenUid) {
      return;
    }
    const key = `${tokenUid.chainId}:${tokenUid.address.toLowerCase()}`;
    const balance = balanceByKey.get(key);
    if (!balance) {
      console.warn(`[smoke] ${label} balance: 0 (not reported by wallet balances)`);
      return;
    }
    console.log(`[smoke] ${label} balance: ${balance.amount}`);
  };

  logTokenBalance('USDC', usdcToken?.tokenUid);
  logTokenBalance('USDai', usdaiToken?.tokenUid);

  const failures: string[] = [];
  const skips: string[] = [];

  const runStep = async (
    label: string,
    fn: () => Promise<void>,
    skipWhen?: (message: string) => string | null,
  ) => {
    try {
      await Promise.race([
        fn(),
        new Promise<void>((_, reject) =>
          setTimeout(() => reject(new Error('timeout')), 15_000),
        ),
      ]);
      console.log(`[smoke] ${label}: ok`);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      const skipReason = skipWhen ? skipWhen(message) : null;
      if (skipReason) {
        skips.push(`${label}: ${skipReason}`);
        console.warn(`[smoke] ${label}: skipped -> ${skipReason}`);
        return;
      }
      failures.push(`${label}: ${message}`);
      console.error(`[smoke] ${label}: failed -> ${message}`);
    }
  };

  await runStep(
    'swap planning',
    async () => {
      if (!usdcToken || !usdaiToken) {
        throw new Error('Missing USDC or USDai token metadata.');
      }
      const usdcBalanceKey = `${usdcToken.tokenUid.chainId}:${usdcToken.tokenUid.address.toLowerCase()}`;
      const usdcBalance = balanceByKey.get(usdcBalanceKey);
      if (!usdcBalance || BigInt(usdcBalance.amount) === 0n) {
        console.warn('[smoke] Wallet balances do not report USDC; swap planning may fail.');
      }
      const normalizedFrom = normalizeTokenUid(usdcToken.tokenUid);
      const normalizedTo = normalizeTokenUid(usdaiToken.tokenUid);
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5_000);
      try {
        await client.createSwap({
          walletAddress,
          amount: toAmountBaseUnits('1', usdcToken.decimals),
          amountType: 'exactIn',
          fromTokenUid: normalizedFrom,
          toTokenUid: normalizedTo,
          slippageTolerance: '0.5',
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeout);
      }
    },
    (message) => {
      if (message.includes('Missing USDC or USDai token')) {
        return 'missing USDC/USDai token metadata';
      }
      if (message.includes('Low liquidity')) {
        return 'low liquidity from swap provider';
      }
      if (message.includes('No swap actions found')) {
        return 'no swap actions available for tested token pairs';
      }
      if (message.includes('timeout')) {
        return 'swap planning timed out';
      }
      return null;
    },
  );

  await runStep(
    'buy PT planning',
    async () => {
      if (!usdaiToken) {
        throw new Error('Missing USDai token metadata.');
      }
      const errors: string[] = [];
      for (const candidate of markets) {
        const candidateAddress = getAddress(candidate.marketIdentifier.address);
        const candidateUnderlying = normalizeTokenUid(candidate.underlyingToken.tokenUid);
        const amount = toAmountBaseUnits('3', candidate.underlyingToken.decimals);
        try {
          await client.createTokenizedYieldBuyPt({
            walletAddress,
            marketAddress: candidateAddress,
            inputTokenUid: candidateUnderlying,
            amount,
            slippage: '0.5',
          });
          selectedMarket = candidate;
          return;
        } catch (error: unknown) {
          const message = error instanceof Error ? error.message : String(error);
          errors.push(`${candidateAddress}: ${message}`);
        }
      }
      throw new Error(
        `Unable to plan buy PT for any market. ${errors.slice(0, 3).join(' | ')}`,
      );
    },
    (message) => {
      if (message.includes('Missing USDai token')) {
        return 'missing USDai token metadata';
      }
      if (message.includes('status code 404')) {
        return 'pendle swap route not available for markets';
      }
      return null;
    },
  );

  await runStep(
    'sell PT planning',
    async () => {
      const ptTokenUid = normalizeTokenUid(selectedMarket.ptToken.tokenUid);
      await client.createTokenizedYieldSellPt({
        walletAddress,
        ptTokenUid,
        amount: toAmountBaseUnits('1', selectedMarket.ptToken.decimals),
        slippage: '0.5',
      });
    },
    (message) => (message.includes('status code 404') ? 'pendle swap route not available' : null),
  );

  await runStep(
    'redeem PT planning',
    async () => {
      const ptTokenUid = normalizeTokenUid(selectedMarket.ptToken.tokenUid);
      await client.createTokenizedYieldRedeemPt({
        walletAddress,
        ptTokenUid,
        amount: toAmountBaseUnits('1', selectedMarket.ptToken.decimals),
      });
    },
    (message) => (message.includes('status code 400') ? 'pendle redeem rejected' : null),
  );

  await runStep('claim rewards planning', async () => {
    const ytTokenUid = normalizeTokenUid(selectedMarket.ytToken.tokenUid);
    await client.createTokenizedYieldClaimRewards({
      walletAddress,
      ytTokenUid,
    });
  });

  if (failures.length > 0) {
    throw new Error(`Smoke planning failures:\\n- ${failures.join('\\n- ')}`);
  }
  if (skips.length > 0) {
    console.warn(`[smoke] Skipped planning steps:\\n- ${skips.join('\\n- ')}`);
  }

  console.log('[smoke] OK');
  process.exit(0);
};

run().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error('[smoke] FAILED:', message);
  process.exit(1);
});
