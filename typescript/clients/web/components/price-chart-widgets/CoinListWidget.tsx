import React from 'react';
import { CoinData, WidgetAppearanceOptions } from './types';

interface CoinListWidgetProps {
  selectedCoins: CoinData[];
  selectedCurrency: string;
  appearance: WidgetAppearanceOptions;
  isScriptLoaded: boolean;
}

export function CoinListWidget({ 
  selectedCoins, 
  selectedCurrency, 
  appearance, 
  isScriptLoaded 
}: CoinListWidgetProps) {
  if (!isScriptLoaded) {
    return (
      <div className="flex items-center justify-center h-full border rounded-lg bg-muted/20">
        <div className="text-center text-muted-foreground">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-current mx-auto mb-2"></div>
          <div className="text-sm">Loading coin list...</div>
        </div>
      </div>
    );
  }

  const coinIds = selectedCoins.map(coin => coin.id).join(',');
  const coinNames = selectedCoins.length > 1 
    ? `${selectedCoins.length} Coins`
    : selectedCoins[0]?.name || 'No Coins';

  return (
    <div className="border rounded-lg p-4 bg-muted/50 h-full">
      <h4 className="text-sm font-medium mb-2">
        {coinNames} List ({selectedCurrency.toUpperCase()})
      </h4>
      <div className="w-full">
        <gecko-coin-list-widget 
          locale="en" 
          coin-ids={coinIds}
          initial-currency={selectedCurrency}
          {...(!appearance.lightMode && { 'dark-mode': 'true' })}
          {...(appearance.transparentBackground && { 'transparent-background': 'true' })}
          {...(appearance.outlined && { 'outlined': 'true' })}
          key={`coin-list-${coinIds}-${selectedCurrency}-${appearance.lightMode}-${appearance.transparentBackground}-${appearance.outlined}`}
        />
      </div>
    </div>
  );
}
