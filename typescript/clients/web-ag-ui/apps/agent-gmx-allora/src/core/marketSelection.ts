import type { PerpetualMarket } from '../clients/onchainActions.js';

type MarketSelectionParams = {
  markets: PerpetualMarket[];
  baseSymbol: string;
  quoteSymbol: string;
};

export function selectGmxPerpetualMarket(params: MarketSelectionParams): PerpetualMarket | undefined {
  const base = params.baseSymbol.toUpperCase();
  const quote = params.quoteSymbol.toUpperCase();

  return params.markets.find((market) => {
    const name = market.name.toUpperCase();
    const index = market.indexToken.symbol.toUpperCase();
    const longToken = market.longToken.symbol.toUpperCase();
    const shortToken = market.shortToken.symbol.toUpperCase();
    const matchesSymbols = index === base && (longToken === quote || shortToken === quote);
    const isGmx = name.includes('GMX');
    return matchesSymbols && isGmx;
  });
}
