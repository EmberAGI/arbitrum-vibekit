import type { WalletBalance } from '../clients/onchainActions.js';
import type { FundingTokenOption } from '../workflow/context.js';

type FundingTokenCandidate = FundingTokenOption & { valueUsd: number; chainId: string };

const parseBalanceAmount = (amount: string): bigint => {
  try {
    return BigInt(amount);
  } catch {
    return 0n;
  }
};

const choosePreferredCandidate = (
  current: FundingTokenCandidate | undefined,
  next: FundingTokenCandidate,
): FundingTokenCandidate => {
  if (!current) {
    return next;
  }
  if (next.valueUsd !== current.valueUsd) {
    return next.valueUsd > current.valueUsd ? next : current;
  }
  if (next.decimals !== current.decimals) {
    return next.decimals > current.decimals ? next : current;
  }
  return parseBalanceAmount(next.balance) > parseBalanceAmount(current.balance) ? next : current;
};

export function buildFundingTokenOptions(params: {
  balances: readonly WalletBalance[];
  whitelistSymbols: readonly string[];
}): FundingTokenOption[] {
  const whitelist = new Set(params.whitelistSymbols);
  const dedupedCandidates = new Map<string, FundingTokenCandidate>();

  for (const balance of params.balances
    .filter((balance) => Boolean(balance.symbol) && typeof balance.decimals === 'number')
    .filter((balance) => whitelist.has(balance.symbol ?? ''))
    .map((balance) => ({
      chainId: balance.tokenUid.chainId,
      address: balance.tokenUid.address as `0x${string}`,
      symbol: balance.symbol ?? 'UNKNOWN',
      decimals: balance.decimals ?? 0,
      balance: balance.amount,
      valueUsd: balance.valueUsd ?? 0,
    }))) {
    const key = `${balance.chainId}:${balance.address.toLowerCase()}`;
    dedupedCandidates.set(key, choosePreferredCandidate(dedupedCandidates.get(key), balance));
  }

  return Array.from(dedupedCandidates.values())
    .sort((left, right) => {
      if (right.valueUsd !== left.valueUsd) {
        return right.valueUsd - left.valueUsd;
      }
      const symbolOrder = left.symbol.localeCompare(right.symbol);
      if (symbolOrder !== 0) {
        return symbolOrder;
      }
      return left.address.localeCompare(right.address);
    })
    .map((entry) => {
      const { valueUsd, chainId, ...option } = entry;
      void valueUsd;
      void chainId;
      return option;
    });
}
