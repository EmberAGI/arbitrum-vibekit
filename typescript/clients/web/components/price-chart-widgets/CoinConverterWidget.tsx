import React from 'react';
import { CoinData, WidgetAppearanceOptions } from './types';

interface CoinConverterWidgetProps {
  selectedCoin: CoinData;
  selectedCurrency: string;
  appearance: WidgetAppearanceOptions;
  isScriptLoaded: boolean;
}

export function CoinConverterWidget({ 
  selectedCoin, 
  selectedCurrency, 
  appearance, 
  isScriptLoaded 
}: CoinConverterWidgetProps) {
  if (!isScriptLoaded) {
    return (
      <div className="flex items-center justify-center h-full border rounded-lg bg-muted/20">
        <div className="text-center text-muted-foreground">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-current mx-auto mb-2"></div>
          <div className="text-sm">Loading converter...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="border rounded-lg p-4 bg-muted/50 h-full">
      <h4 className="text-sm font-medium mb-2">
        {selectedCoin.name} Converter ({selectedCurrency.toUpperCase()})
      </h4>
      <div className="w-full">
        <gecko-coin-converter-widget 
          locale="en" 
          coin-id={selectedCoin.id}
          initial-currency={selectedCurrency}
          {...(!appearance.lightMode && { 'dark-mode': 'true' })}
          {...(appearance.transparentBackground && { 'transparent-background': 'true' })}
          {...(appearance.outlined && { 'outlined': 'true' })}
          key={`converter-${selectedCoin.id}-${selectedCurrency}-${appearance.lightMode}-${appearance.transparentBackground}-${appearance.outlined}`}
        />
      </div>
    </div>
  );
}
