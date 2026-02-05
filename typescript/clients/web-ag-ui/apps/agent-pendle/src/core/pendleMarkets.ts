import type { Token, TokenizedYieldMarket } from '../clients/onchainActions.js';
import type { PendleYieldToken } from '../domain/types.js';

import { rankYieldTokens } from './pendleDecision.js';

const normalizeHex = (value: string): string => value.toLowerCase();

const tokenKey = (token: Token): string =>
  `${token.tokenUid.chainId}:${normalizeHex(token.tokenUid.address)}`;

const readNumeric = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const resolveApy = (market: TokenizedYieldMarket): number => {
  const details = market.details;
  const keys = [
    'aggregatedApy',
    'pendleApy',
    'impliedApy',
    'underlyingApy',
    'ytFloatingApy',
    'apy',
  ];
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(details, key)) {
      const value = readNumeric(details[key]);
      if (value !== null) {
        return value;
      }
    }
  }
  return 0;
};

const toYieldToken = (market: TokenizedYieldMarket): PendleYieldToken => ({
  marketAddress: normalizeHex(market.marketIdentifier.address) as `0x${string}`,
  ytSymbol: market.ytToken.symbol,
  underlyingSymbol: market.underlyingToken.symbol,
  apy: resolveApy(market),
  maturity: market.expiry,
});

export function buildEligibleYieldTokens(params: {
  markets: readonly TokenizedYieldMarket[];
  supportedTokens: readonly Token[];
  whitelistSymbols: readonly string[];
}): PendleYieldToken[] {
  const supportedTokenKeys = new Set(params.supportedTokens.map(tokenKey));

  const eligible = params.markets.filter((market) => {
    if (!params.whitelistSymbols.includes(market.underlyingToken.symbol)) {
      return false;
    }
    return supportedTokenKeys.has(tokenKey(market.underlyingToken));
  });

  return rankYieldTokens(eligible.map(toYieldToken));
}
