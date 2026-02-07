import type { PerpetualMarket } from '../clients/onchainActions.js';

type MarketSelectionParams = {
  markets: PerpetualMarket[];
  baseSymbol: string;
  quoteSymbol: string;
};

export function selectGmxPerpetualMarket(
  params: MarketSelectionParams,
): PerpetualMarket | undefined {
  const base = params.baseSymbol.toUpperCase();
  const quote = params.quoteSymbol.toUpperCase();

  return params.markets.find((market) => {
    const index = market.indexToken.symbol.toUpperCase();
    const longToken = market.longToken.symbol.toUpperCase();
    const shortToken = market.shortToken.symbol.toUpperCase();
    const matchesSymbols = index === base && (longToken === quote || shortToken === quote);
    // onchain-actions aggregates markets across plugins; GMX market names are not guaranteed
    // to include "GMX" (GMX SDK typically returns names like "BTC/USD").
    return matchesSymbols;
  });
}
