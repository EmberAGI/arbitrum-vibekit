import { formatUnits } from 'viem';

import type { TokenizedYieldPosition, WalletBalance } from '../clients/onchainActions.js';
import type { ResolvedPendleConfig } from '../domain/types.js';

import { normalizeHexAddress } from './context.js';
import type { PendleLatestSnapshot } from './context.js';

const PT_DECIMALS_FALLBACK = 18;
const YT_DECIMALS_FALLBACK = 18;

function computeNetPnlPct(netPnlUsd: number, baseContributionUsd: number): number | undefined {
  if (!Number.isFinite(baseContributionUsd) || baseContributionUsd <= 0) {
    return undefined;
  }
  return (netPnlUsd / baseContributionUsd) * 100;
}

function normalizeAddress(address: string): string {
  return address.toLowerCase();
}

function findWalletBalanceUsd(
  balances: readonly WalletBalance[],
  tokenAddress: string,
): number | undefined {
  const target = normalizeAddress(tokenAddress);
  const match = balances.find((balance) => normalizeAddress(balance.tokenUid.address) === target);
  return match?.valueUsd;
}

function findWalletBalance(
  balances: readonly WalletBalance[],
  tokenAddress: string,
): WalletBalance | undefined {
  const target = normalizeAddress(tokenAddress);
  return balances.find((balance) => normalizeAddress(balance.tokenUid.address) === target);
}

function safeFormatUnits(amountBaseUnits: string | undefined, decimals: number): number | undefined {
  if (!amountBaseUnits) {
    return undefined;
  }
  try {
    return Number(formatUnits(BigInt(amountBaseUnits), decimals));
  } catch {
    return undefined;
  }
}

function computeTokenValueUsd(params: {
  walletBalance?: WalletBalance;
  tokenDecimals: number;
  positionAmountBaseUnits?: string;
}): number | undefined {
  const { walletBalance, tokenDecimals, positionAmountBaseUnits } = params;
  if (!walletBalance || walletBalance.valueUsd === undefined) {
    return undefined;
  }

  // If we cannot parse amounts, fall back to the wallet-level USD value.
  const walletTokenAmount = safeFormatUnits(walletBalance.amount, tokenDecimals);
  const positionTokenAmount = safeFormatUnits(positionAmountBaseUnits, tokenDecimals);
  if (!walletTokenAmount || walletTokenAmount <= 0 || !positionTokenAmount) {
    return walletBalance.valueUsd;
  }

  const unitPriceUsd = walletBalance.valueUsd / walletTokenAmount;
  if (!Number.isFinite(unitPriceUsd)) {
    return walletBalance.valueUsd;
  }
  return unitPriceUsd * positionTokenAmount;
}

export function buildPendleLatestSnapshot(params: {
  operatorConfig: ResolvedPendleConfig;
  totalUsd?: number;
  timestamp: string;
  positionOpenedAt: string;
}): PendleLatestSnapshot {
  const market = params.operatorConfig.targetYieldToken;
  const baseContributionUsd = params.operatorConfig.baseContributionUsd;
  const totalUsd =
    params.totalUsd ?? (Number.isFinite(baseContributionUsd) ? baseContributionUsd : undefined);
  const netPnlUsd =
    totalUsd !== undefined && Number.isFinite(baseContributionUsd)
      ? totalUsd - baseContributionUsd
      : undefined;
  const netPnlPct =
    netPnlUsd !== undefined ? computeNetPnlPct(netPnlUsd, baseContributionUsd) : undefined;

  return {
    poolAddress: market.marketAddress,
    totalUsd,
    timestamp: params.timestamp,
    positionOpenedAt: params.positionOpenedAt,
    positionTokens: [
      {
        address: market.ptAddress,
        symbol: market.ptSymbol,
        decimals: PT_DECIMALS_FALLBACK,
      },
      {
        address: market.ytAddress,
        symbol: market.ytSymbol,
        decimals: YT_DECIMALS_FALLBACK,
      },
    ],
    pendle: {
      marketAddress: market.marketAddress,
      ptSymbol: market.ptSymbol,
      ytSymbol: market.ytSymbol,
      underlyingSymbol: market.underlyingSymbol,
      maturity: market.maturity,
      impliedApyPct: market.impliedApyPct ?? market.apy,
      underlyingApyPct: market.underlyingApyPct,
      pendleApyPct: market.pendleApyPct,
      aggregatedApyPct: market.aggregatedApyPct,
      swapFeeApyPct: market.swapFeeApyPct,
      ytFloatingApyPct: market.ytFloatingApyPct,
      maxBoostedApyPct: market.maxBoostedApyPct,
      netPnlUsd,
      netPnlPct,
    },
  };
}

export function buildPendleLatestSnapshotFromOnchain(params: {
  operatorConfig: ResolvedPendleConfig;
  position?: TokenizedYieldPosition;
  walletBalances?: WalletBalance[];
  timestamp: string;
  positionOpenedAt: string;
}): PendleLatestSnapshot {
  const market = params.operatorConfig.targetYieldToken;
  const baseContributionUsd = params.operatorConfig.baseContributionUsd;

  const balances = params.walletBalances ?? [];
  const positionTokens: PendleLatestSnapshot['positionTokens'] = [];
  const position = params.position;
  let totalUsd: number | undefined;

  if (position) {
    const ptBalance = balances.length > 0 ? findWalletBalance(balances, position.pt.token.tokenUid.address) : undefined;
    const ptUsd =
      balances.length > 0
        ? computeTokenValueUsd({
            walletBalance: ptBalance,
            tokenDecimals: position.pt.token.decimals,
            positionAmountBaseUnits: position.pt.exactAmount,
          })
        : undefined;
    positionTokens.push({
      address: normalizeHexAddress(position.pt.token.tokenUid.address, 'position PT token address'),
      symbol: position.pt.token.symbol,
      decimals: position.pt.token.decimals,
      amountBaseUnits: position.pt.exactAmount,
      valueUsd: ptUsd,
    });

    const ytBalance = balances.length > 0 ? findWalletBalance(balances, position.yt.token.tokenUid.address) : undefined;
    const ytUsd =
      balances.length > 0
        ? computeTokenValueUsd({
            walletBalance: ytBalance,
            tokenDecimals: position.yt.token.decimals,
            positionAmountBaseUnits: position.yt.exactAmount,
          })
        : undefined;
    positionTokens.push({
      address: normalizeHexAddress(position.yt.token.tokenUid.address, 'position YT token address'),
      symbol: position.yt.token.symbol,
      decimals: position.yt.token.decimals,
      amountBaseUnits: position.yt.exactAmount,
      valueUsd: ytUsd,
    });

    for (const reward of position.yt.claimableRewards) {
      const rewardBalance = balances.length > 0 ? findWalletBalance(balances, reward.token.tokenUid.address) : undefined;
      const rewardUsd =
        balances.length > 0
          ? computeTokenValueUsd({
              walletBalance: rewardBalance,
              tokenDecimals: reward.token.decimals,
              positionAmountBaseUnits: reward.exactAmount,
            })
          : undefined;
      positionTokens.push({
        address: normalizeHexAddress(reward.token.tokenUid.address, 'reward token address'),
        symbol: reward.token.symbol,
        decimals: reward.token.decimals,
        amountBaseUnits: reward.exactAmount,
        valueUsd: rewardUsd,
      });
    }

    const computedTotal = positionTokens.reduce<number>((sum, token) => {
      if (token.valueUsd === undefined) {
        return sum;
      }
      return sum + token.valueUsd;
    }, 0);
    totalUsd = computedTotal > 0 ? computedTotal : undefined;
  } else {
    const ptBalance = balances.length > 0 ? findWalletBalance(balances, market.ptAddress) : undefined;
    const ytBalance = balances.length > 0 ? findWalletBalance(balances, market.ytAddress) : undefined;

    positionTokens.push({
      address: market.ptAddress,
      symbol: market.ptSymbol,
      decimals: ptBalance?.decimals ?? PT_DECIMALS_FALLBACK,
      amountBaseUnits: ptBalance?.amount,
      valueUsd: ptBalance?.valueUsd,
    });
    positionTokens.push({
      address: market.ytAddress,
      symbol: market.ytSymbol,
      decimals: ytBalance?.decimals ?? YT_DECIMALS_FALLBACK,
      amountBaseUnits: ytBalance?.amount,
      valueUsd: ytBalance?.valueUsd,
    });

    const computedTotal = positionTokens.reduce<number>((sum, token) => {
      if (token.valueUsd === undefined) {
        return sum;
      }
      return sum + token.valueUsd;
    }, 0);
    totalUsd = computedTotal > 0 ? computedTotal : undefined;

    // Back-compat: older wallet-balance payloads might not provide per-token valueUsd.
    if (totalUsd === undefined) {
      totalUsd = balances.length > 0 ? findWalletBalanceUsd(balances, market.ptAddress) : undefined;
    }
  }

  const netPnlUsd = totalUsd !== undefined ? totalUsd - baseContributionUsd : undefined;
  const netPnlPct =
    netPnlUsd !== undefined ? computeNetPnlPct(netPnlUsd, baseContributionUsd) : undefined;

  return {
    poolAddress: market.marketAddress,
    totalUsd,
    timestamp: params.timestamp,
    positionOpenedAt: params.positionOpenedAt,
    positionTokens,
    pendle: {
      marketAddress: market.marketAddress,
      ptSymbol: market.ptSymbol,
      ytSymbol: market.ytSymbol,
      underlyingSymbol: market.underlyingSymbol,
      maturity: market.maturity,
      impliedApyPct: market.impliedApyPct ?? market.apy,
      underlyingApyPct: market.underlyingApyPct,
      pendleApyPct: market.pendleApyPct,
      aggregatedApyPct: market.aggregatedApyPct,
      swapFeeApyPct: market.swapFeeApyPct,
      ytFloatingApyPct: market.ytFloatingApyPct,
      maxBoostedApyPct: market.maxBoostedApyPct,
      netPnlUsd,
      netPnlPct,
    },
  };
}
