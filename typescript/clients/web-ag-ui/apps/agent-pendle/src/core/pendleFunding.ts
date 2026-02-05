import type { WalletBalance } from '../clients/onchainActions.js';
import type { FundingTokenOption } from '../workflow/context.js';

export function buildFundingTokenOptions(params: {
  balances: readonly WalletBalance[];
  whitelistSymbols: readonly string[];
}): FundingTokenOption[] {
  const whitelist = new Set(params.whitelistSymbols);
  return params.balances
    .filter((balance) => Boolean(balance.symbol) && typeof balance.decimals === 'number')
    .filter((balance) => whitelist.has(balance.symbol ?? ''))
    .map((balance) => ({
      address: balance.tokenUid.address as `0x${string}`,
      symbol: balance.symbol ?? 'UNKNOWN',
      decimals: balance.decimals ?? 0,
      balance: balance.amount,
      valueUsd: balance.valueUsd ?? 0,
    }))
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
      const { valueUsd, ...option } = entry;
      void valueUsd;
      return option;
    });
}
