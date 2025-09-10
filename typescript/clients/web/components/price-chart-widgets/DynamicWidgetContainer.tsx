'use client';

import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CrossSmallIcon, LineChartIcon } from '@/components/icons';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

import { WIDGET_TYPES, DEFAULT_COINS, CoinData, WidgetAppearanceOptions } from './types';
import { PriceChartWidget } from './PriceChartWidget';
import { CoinHeatmapWidget } from './CoinHeatmapWidget';
import { CoinMarqueeWidget } from './CoinMarqueeWidget';
import { CoinListWidget } from './CoinListWidget';
import { CoinConverterWidget } from './CoinConverterWidget';
import { CryptoTickerWidget } from './CryptoTickerWidget';
import { CoinCompareWidget } from './CoinCompareWidget';
import { CoinMarketTickerWidget } from './CoinMarketTickerWidget';
import { RandomCoinWidget } from './RandomCoinWidget';
import { CURRENCIES } from '../currencies';

interface DynamicWidgetContainerProps {
  className?: string;
  sidebarOpen?: boolean;
}

export function DynamicWidgetContainer({ 
  className = '',
  sidebarOpen = false
}: DynamicWidgetContainerProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [selectedWidgetType, setSelectedWidgetType] = useState(WIDGET_TYPES[0].id);
  const [scriptLoaded, setScriptLoaded] = useState<Record<string, boolean>>({});
  
  // Widget configuration state
  const [selectedCoin, setSelectedCoin] = useState<CoinData>(DEFAULT_COINS[0]);
  const [selectedCoins, setSelectedCoins] = useState<CoinData[]>([DEFAULT_COINS[0]]);
  const [selectedCurrency, setSelectedCurrency] = useState('usd');
  const [topCoinsCount, setTopCoinsCount] = useState(50);
  
  // Appearance options
  const [appearance, setAppearance] = useState<WidgetAppearanceOptions>({
    lightMode: false,
    transparentBackground: false,
    outlined: false
  });

  // Search functionality
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<CoinData[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [coinDropdownOpen, setCoinDropdownOpen] = useState(false);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  // Load widget scripts
  useEffect(() => {
    const loadScript = (src: string, widgetId: string) => {
      const existingScript = document.querySelector(`script[src="${src}"]`);
      
      if (!existingScript) {
        const script = document.createElement('script');
        script.src = src;
        script.async = true;
        script.onload = () => {
          setScriptLoaded(prev => ({ ...prev, [widgetId]: true }));
        };
        document.head.appendChild(script);
      } else {
        setScriptLoaded(prev => ({ ...prev, [widgetId]: true }));
      }
    };

    // Load all widget scripts
    WIDGET_TYPES.forEach(widget => {
      loadScript(widget.scriptSrc, widget.id);
    });
  }, []);

  // Search coins API call
  const searchCoins = async (query: string) => {
    if (!query.trim()) {
      setSearchResults([]);
      return;
    }

    setIsSearching(true);
    try {
      const response = await fetch(`/api/search?query=${encodeURIComponent(query)}`);
      if (response.ok) {
        const data = await response.json();
        setSearchResults(data.slice(0, 15));
      }
    } catch (error) {
      console.error('Search error:', error);
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  // Debounced search
  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(() => {
      searchCoins(searchQuery);
    }, 300);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [searchQuery]);

  const toggleWidget = () => {
    setIsVisible(!isVisible);
  };

  const closeWidget = () => {
    setIsVisible(false);
  };

  const selectCoin = (coin: CoinData) => {
    if (['coin-marquee', 'coin-list', 'coin-compare'].includes(selectedWidgetType)) {
      // For marquee, coin list, and coin compare, add coin to selected coins if not already selected
      if (!selectedCoins.some(c => c.id === coin.id)) {
        setSelectedCoins(prev => [...prev, coin]);
      }
    } else {
      // For other widgets (price-chart, coin-converter, crypto-ticker), single selection
      setSelectedCoin(coin);
    }
    setSearchQuery('');
    setCoinDropdownOpen(false);
  };

  const removeCoinFromSelection = (coinId: string) => {
    setSelectedCoins(prev => prev.filter(coin => coin.id !== coinId));
  };

  const coinsToDisplay = searchQuery.trim() ? searchResults : DEFAULT_COINS;
  const currentWidget = WIDGET_TYPES.find(w => w.id === selectedWidgetType);
  const isCurrentScriptLoaded = scriptLoaded[selectedWidgetType] || false;

  const renderWidget = () => {
    switch (selectedWidgetType) {
      case 'price-chart':
        return (
          <PriceChartWidget
            selectedCoin={selectedCoin}
            selectedCurrency={selectedCurrency}
            appearance={appearance}
            isScriptLoaded={isCurrentScriptLoaded}
          />
        );
      case 'coin-heatmap':
        return (
          <CoinHeatmapWidget
            topCoinsCount={topCoinsCount}
            appearance={appearance}
            isScriptLoaded={isCurrentScriptLoaded}
          />
        );
      case 'coin-marquee':
        return (
          <CoinMarqueeWidget
            selectedCoins={selectedCoins}
            selectedCurrency={selectedCurrency}
            appearance={appearance}
            isScriptLoaded={isCurrentScriptLoaded}
          />
        );
      case 'coin-list':
        return (
          <CoinListWidget
            selectedCoins={selectedCoins}
            selectedCurrency={selectedCurrency}
            appearance={appearance}
            isScriptLoaded={isCurrentScriptLoaded}
          />
        );
      case 'coin-converter':
        return (
          <CoinConverterWidget
            selectedCoin={selectedCoin}
            selectedCurrency={selectedCurrency}
            appearance={appearance}
            isScriptLoaded={isCurrentScriptLoaded}
          />
        );
      case 'crypto-ticker':
        return (
          <CryptoTickerWidget
            selectedCoin={selectedCoin}
            selectedCurrency={selectedCurrency}
            appearance={appearance}
            isScriptLoaded={isCurrentScriptLoaded}
          />
        );
      case 'coin-compare':
        return (
          <CoinCompareWidget
            selectedCoins={selectedCoins}
            selectedCurrency={selectedCurrency}
            appearance={appearance}
            isScriptLoaded={isCurrentScriptLoaded}
          />
        );
      case 'coin-market-ticker':
        return (
          <CoinMarketTickerWidget
            selectedCoin={selectedCoin}
            selectedCurrency={selectedCurrency}
            appearance={appearance}
            isScriptLoaded={isCurrentScriptLoaded}
          />
        );
      case 'random-coin':
        return (
          <RandomCoinWidget
            appearance={appearance}
            isScriptLoaded={isCurrentScriptLoaded}
          />
        );
      default:
        return null;
    }
  };

  const needsCoinSelection = ['price-chart', 'coin-marquee', 'coin-list', 'coin-converter', 'crypto-ticker', 'coin-compare', 'coin-market-ticker'].includes(selectedWidgetType);
  const needsCurrencySelection = ['price-chart', 'coin-marquee', 'coin-list', 'coin-converter', 'crypto-ticker', 'coin-compare', 'coin-market-ticker'].includes(selectedWidgetType);

  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="outline"
            className={className}
            onClick={toggleWidget}
          >
            <LineChartIcon />
            <span className="md:sr-only">Crypto Widgets</span>
          </Button>
        </TooltipTrigger>
        <TooltipContent>Crypto Widgets</TooltipContent>
      </Tooltip>

      {isVisible && typeof window !== 'undefined' && createPortal(
        <div className={`price-chart-widget fixed top-20 z-[9999] bg-background border rounded-lg shadow-lg p-6 max-h-[80vh] overflow-y-auto ${sidebarOpen ? 'left-[280px] w-[calc(100vw-320px)]' : 'left-4 w-[calc(100vw-32px)]'} max-w-[1000px]`}>
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-semibold">
              Crypto Widgets
            </h3>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0 hover:bg-muted"
              onClick={closeWidget}
            >
              <CrossSmallIcon size={12} />
            </Button>
          </div>

          <div className="flex gap-6">
            {/* Left side - Input fields */}
            <div className="flex-shrink-0 w-80 space-y-4">
              {/* Widget Type Selection */}
              <div className="space-y-2">
                <Label htmlFor="widget-type">Widget Type</Label>
                <Select value={selectedWidgetType} onValueChange={setSelectedWidgetType}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select widget type" />
                  </SelectTrigger>
                  <SelectContent className="z-[10001]">
                    {WIDGET_TYPES.map((widget) => (
                      <SelectItem key={widget.id} value={widget.id}>
                        <div>
                          <div className="font-medium">{widget.name}</div>
                          <div className="text-xs text-muted-foreground">{widget.description}</div>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Coin Selection - Only for widgets that need it */}
              {needsCoinSelection && (
                <div className="relative space-y-2">
                  <Label htmlFor="coin-search">Coin</Label>
                  
                  <div className="relative">
                    <Input
                      id="coin-search"
                      placeholder={
                        ['coin-marquee', 'coin-list', 'coin-compare'].includes(selectedWidgetType)
                          ? "Search and select one or more coins..."
                          : "Search coins or click to browse..."
                      }
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      onFocus={() => setCoinDropdownOpen(true)}
                      onBlur={() => {
                        setTimeout(() => setCoinDropdownOpen(false), 150);
                      }}
                      className="pr-8"
                    />
                    {isSearching && (
                      <div className="absolute right-2 top-1/2 transform -translate-y-1/2">
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-current" />
                      </div>
                    )}
                  </div>

                  {/* Selected Coins Display */}
                  {['coin-marquee', 'coin-list', 'coin-compare'].includes(selectedWidgetType) ? (
                    <div className="space-y-2">
                      <div className="text-sm text-muted-foreground">
                        Selected Coins ({selectedCoins.length})
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {selectedCoins.map((coin) => (
                          <div key={coin.id} className="flex items-center gap-2 px-3 py-2 border rounded-md bg-muted/50">
                            <img 
                              src={coin.image} 
                              alt={coin.name}
                              className="w-4 h-4"
                              onError={(e) => {
                                (e.target as HTMLImageElement).style.display = 'none';
                              }}
                            />
                            <span className="text-sm font-medium">{coin.symbol}</span>
                            <button
                              onClick={() => removeCoinFromSelection(coin.id)}
                              className={`ml-1 hover:bg-muted-foreground/20 rounded-full p-0.5 ${
                                selectedCoins.length === 1 ? 'opacity-50' : ''
                              }`}
                              disabled={selectedCoins.length === 1}
                            >
                              <CrossSmallIcon size={12} />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 p-3 border rounded-md bg-muted/50">
                      <img 
                        src={selectedCoin.image} 
                        alt={selectedCoin.name}
                        className="w-6 h-6"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = 'none';
                        }}
                      />
                      <span className="font-medium">{selectedCoin.name}</span>
                      <span className="text-muted-foreground">({selectedCoin.symbol})</span>
                    </div>
                  )}

                  {(searchQuery || coinDropdownOpen) && (
                    <div className="absolute z-[10000] mt-1 w-full border rounded-md bg-background shadow-lg max-h-64 overflow-y-auto">
                      {coinsToDisplay.length === 0 && !isSearching ? (
                        <div className="p-3 text-center text-muted-foreground">No coins found.</div>
                      ) : (
                        <div>
                          {coinsToDisplay.map((coin) => {
                            const isSelected = ['coin-marquee', 'coin-list', 'coin-compare'].includes(selectedWidgetType)
                              ? selectedCoins.some(c => c.id === coin.id)
                              : selectedCoin.id === coin.id;
                            
                            return (
                              <button
                                key={coin.id}
                                onClick={() => selectCoin(coin)}
                                disabled={isSelected && !['coin-marquee', 'coin-list', 'coin-compare'].includes(selectedWidgetType)}
                                className={`w-full flex items-center gap-2 px-3 py-2 hover:bg-muted cursor-pointer border-b last:border-b-0 ${
                                  isSelected ? 'bg-muted/50' : ''
                                } ${
                                  isSelected && !['coin-marquee', 'coin-list', 'coin-compare'].includes(selectedWidgetType) ? 'opacity-50 cursor-not-allowed' : ''
                                }`}
                              >
                                <img 
                                  src={coin.image} 
                                  alt={coin.name}
                                  className="w-6 h-6 flex-shrink-0"
                                  onError={(e) => {
                                    (e.target as HTMLImageElement).style.display = 'none';
                                  }}
                                />
                                <div className="flex-1 min-w-0 text-left">
                                  <div className="font-medium text-sm">{coin.name}</div>
                                  <div className="text-xs text-muted-foreground">{coin.symbol}</div>
                                </div>
                                {isSelected && (
                                  <div className="text-xs text-primary font-medium">
                                    {['coin-marquee', 'coin-list', 'coin-compare'].includes(selectedWidgetType) ? 'Added' : 'Selected'}
                                  </div>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Currency Selection - Only for widgets that need it */}
              {needsCurrencySelection && (
                <div className="space-y-2">
                  <Label htmlFor="currency">Currency</Label>
                  <Select value={selectedCurrency} onValueChange={setSelectedCurrency}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select currency" />
                    </SelectTrigger>
                    <SelectContent className="z-[10001]">
                      {CURRENCIES.map((currency) => (
                        <SelectItem key={currency.value} value={currency.value}>
                          {currency.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Top Coins Count - Only for heatmap */}
              {selectedWidgetType === 'coin-heatmap' && (
                <div className="space-y-2">
                  <Label htmlFor="top-coins">Number of Coins (1-100)</Label>
                  <Input
                    id="top-coins"
                    type="number"
                    min="1"
                    max="100"
                    value={topCoinsCount}
                    onChange={(e) => setTopCoinsCount(Math.max(1, Math.min(100, parseInt(e.target.value) || 1)))}
                    className="w-full"
                  />
                  <div className="text-xs text-muted-foreground">
                    Enter number of coins to show, up to 100. Coins are sorted by highest market cap first.
                  </div>
                </div>
              )}

              {/* Appearance Options */}
              <div className="space-y-2">
                <Label>Appearance Options</Label>
                <div className="space-y-2">
                  <div className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      id="light-mode"
                      checked={appearance.lightMode}
                      onChange={(e) => setAppearance(prev => ({ ...prev, lightMode: e.target.checked }))}
                      className="h-4 w-4 rounded border border-input bg-background text-primary focus:ring-2 focus:ring-ring focus:ring-offset-2"
                    />
                    <Label htmlFor="light-mode" className="text-sm font-normal cursor-pointer">
                      Light Mode
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      id="transparent-bg"
                      checked={appearance.transparentBackground}
                      onChange={(e) => setAppearance(prev => ({ ...prev, transparentBackground: e.target.checked }))}
                      className="h-4 w-4 rounded border border-input bg-background text-primary focus:ring-2 focus:ring-ring focus:ring-offset-2"
                    />
                    <Label htmlFor="transparent-bg" className="text-sm font-normal cursor-pointer">
                      Transparent Background
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      id="outlined"
                      checked={appearance.outlined}
                      onChange={(e) => setAppearance(prev => ({ ...prev, outlined: e.target.checked }))}
                      className="h-4 w-4 rounded border border-input bg-background text-primary focus:ring-2 focus:ring-ring focus:ring-offset-2"
                    />
                    <Label htmlFor="outlined" className="text-sm font-normal cursor-pointer">
                      Outlined
                    </Label>
                  </div>
                </div>
              </div>
            </div>

            {/* Right side - Widget Display */}
            <div className="flex-1 max-w-[600px]">
              {renderWidget()}
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
