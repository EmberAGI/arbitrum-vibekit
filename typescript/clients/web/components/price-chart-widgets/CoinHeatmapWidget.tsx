import React from 'react';
import { WidgetAppearanceOptions } from './types';

interface CoinHeatmapWidgetProps {
  topCoinsCount: number;
  appearance: WidgetAppearanceOptions;
  isScriptLoaded: boolean;
}

export function CoinHeatmapWidget({ 
  topCoinsCount, 
  appearance, 
  isScriptLoaded 
}: CoinHeatmapWidgetProps) {
  if (!isScriptLoaded) {
    return (
      <div className="flex items-center justify-center h-full border rounded-lg bg-muted/20">
        <div className="text-center text-muted-foreground">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-current mx-auto mb-2"></div>
          <div className="text-sm">Loading heatmap...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="border rounded-lg p-4 bg-muted/50 h-full">
      <h4 className="text-sm font-medium mb-2">
        Top {topCoinsCount} Coins by Market Cap
      </h4>
      <div className="w-full">
        <gecko-coin-heatmap-widget 
          locale="en" 
          top={topCoinsCount.toString()}
          {...(!appearance.lightMode && { 'dark-mode': 'true' })}
          {...(appearance.transparentBackground && { 'transparent-background': 'true' })}
          {...(appearance.outlined && { 'outlined': 'true' })}
          key={`heatmap-${topCoinsCount}-${appearance.lightMode}-${appearance.transparentBackground}-${appearance.outlined}`}
        />
      </div>
    </div>
  );
}
