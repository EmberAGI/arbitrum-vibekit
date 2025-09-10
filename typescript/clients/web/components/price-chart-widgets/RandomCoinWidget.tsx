import React from 'react';
import { WidgetAppearanceOptions } from './types';

interface RandomCoinWidgetProps {
  appearance: WidgetAppearanceOptions;
  isScriptLoaded: boolean;
}

export function RandomCoinWidget({ 
  appearance, 
  isScriptLoaded 
}: RandomCoinWidgetProps) {
  // Suppress confetti-related console errors (optional visual enhancement)
  React.useEffect(() => {
    const originalConsoleError = console.error;
    const suppressConfettiErrors = (...args: any[]) => {
      const message = args[0]?.toString() || '';
      if (message.includes('confetti') || message.includes('canvas-confetti')) {
        return; // Suppress confetti-related errors
      }
      originalConsoleError.apply(console, args);
    };
    console.error = suppressConfettiErrors;
    
    return () => {
      console.error = originalConsoleError;
    };
  }, []);

  if (!isScriptLoaded) {
    return (
      <div className="flex items-center justify-center h-full border rounded-lg bg-muted/20">
        <div className="text-center text-muted-foreground">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-current mx-auto mb-2"></div>
          <div className="text-sm">Loading random coin...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="border rounded-lg p-4 bg-muted/50 h-full">
      <h4 className="text-sm font-medium mb-2">
        Random Cryptocurrency
      </h4>
      <div className="w-full">
        <gecko-random-coin-widget 
          locale="en" 
          {...(!appearance.lightMode && { 'dark-mode': 'true' })}
          {...(appearance.transparentBackground && { 'transparent-background': 'true' })}
          {...(appearance.outlined && { 'outlined': 'true' })}
          key={`random-coin-${appearance.lightMode}-${appearance.transparentBackground}-${appearance.outlined}`}
        />
      </div>
    </div>
  );
}
