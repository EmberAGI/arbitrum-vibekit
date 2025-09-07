# Dynamic Price Chart Widget - Usage Guide

## Overview
The enhanced `DynamicPriceChartWidget` allows users to search and select any cryptocurrency from CoinGecko's database, choose a currency, and generate dynamic price charts with embeddable code.

## Features

### 🔍 **Dynamic Coin Search**
- **Default Display**: Shows 15 popular coins by default
- **Real-time Search**: API calls triggered on every character typed
- **Search Results**: Displays up to 15 matching results
- **Visual Display**: Shows coin image, name, and symbol

### 💱 **Currency Selection**
- **10 Major Currencies**: USD, EUR, GBP, JPY, CAD, AUD, CHF, CNY, INR, KRW
- **Easy Selection**: Dropdown menu with currency symbols
- **Extensible**: Easy to add more currencies

### 📊 **Dynamic Chart Generation**
- **Live Updates**: Chart updates when "Update Chart" is clicked
- **Embed Code Generation**: Automatically generates HTML embed code
- **Copy to Clipboard**: One-click copy functionality

## Usage

### Import the Component
```typescript
import { DynamicPriceChartWidget } from '@/components/price-chart-widget';
```

### Basic Usage
```tsx
// Simple usage with default styling
<DynamicPriceChartWidget />

// With custom className
<DynamicPriceChartWidget className="my-custom-class" />
```

### Component Structure

#### 1. **Coin Selection Field**
- Click to open dropdown with default coins
- Type to search for any cryptocurrency
- Results show: coin image, name (symbol)
- Click to select

#### 2. **Currency Selection Field**
- Dropdown with predefined currencies
- Shows currency name and symbol
- Easy to modify in the `CURRENCIES` constant

#### 3. **Update Chart Button**
- Generates the chart with selected coin and currency
- Creates embed code for the configuration
- Updates the widget display

#### 4. **Chart Display**
- Shows the CoinGecko widget with selected parameters
- Responsive design with proper styling
- Dark mode enabled by default

#### 5. **Embed Code Section**
- Auto-generated HTML code
- Ready to copy and paste
- Uses selected coin-id and initial-currency

## API Configuration

### CoinGecko Search Endpoint
The component uses our local API server running on port 3001:
```typescript
const response = await fetch(`http://localhost:3001/search?query=${encodeURIComponent(query)}`);
```

**To change the API endpoint**, modify the `searchCoins` function:
```typescript
// Change this line to use your API endpoint
const response = await fetch(`YOUR_API_ENDPOINT/search?query=${encodeURIComponent(query)}`);
```

### Default Coins Configuration
To modify the default coins shown in the dropdown:
```typescript
const DEFAULT_COINS: CoinData[] = [
  { id: 'your-coin-id', name: 'Coin Name', symbol: 'SYMBOL', image: 'image-url' },
  // Add more coins...
];
```

### Currency Configuration
To add or modify currencies:
```typescript
const CURRENCIES = [
  { value: 'currency-code', label: 'Currency Name (Symbol)' },
  // Add more currencies...
];
```

## Widget Parameters

The generated embed code includes these parameters:
- `coin-id`: Selected cryptocurrency ID
- `initial-currency`: Selected currency code
- `locale`: Set to "en" (English)
- `dark-mode`: Set to "true"
- `outlined`: Set to "true"

## Example Generated Embed Code
```html
<script src="https://widgets.coingecko.com/gecko-coin-price-chart-widget.js"></script>
<gecko-coin-price-chart-widget 
  locale="en" 
  dark-mode="true" 
  outlined="true" 
  coin-id="bitcoin" 
  initial-currency="usd"
></gecko-coin-price-chart-widget>
```

## Migration from Static Widget

### Before (Static)
```tsx
<PriceChartWidget coinId="bitcoin" currency="usd" />
```

### After (Dynamic)
```tsx
<DynamicPriceChartWidget />
```

The original `PriceChartWidget` is still available for backward compatibility.

## Styling and Customization

### Default Styling
- Fixed position (top-right corner)
- Width: 384px (w-96)
- Max height: 80vh with scroll
- Modern design with shadows and borders

### Custom Styling
Pass additional classes through the `className` prop:
```tsx
<DynamicPriceChartWidget className="my-custom-styles" />
```

## Error Handling

The component handles:
- **API Errors**: Shows empty results on API failure
- **Image Load Errors**: Hides broken coin images
- **Network Issues**: Displays appropriate error states
- **Script Loading**: Shows loading spinner while CoinGecko script loads

## Performance Features

- **Debounced Search**: 300ms delay to prevent excessive API calls
- **Search Result Limiting**: Maximum 15 results to maintain performance
- **Script Caching**: CoinGecko widget script is loaded only once
- **Efficient Re-renders**: Uses keys to force widget updates when needed

## Browser Support

- Modern browsers with ES6+ support
- Requires JavaScript enabled for CoinGecko widgets
- Responsive design works on all screen sizes

## Dependencies

The component requires these UI components:
- `Button`, `Input`, `Label`, `Select`
- `Command`, `Popover`, `Tooltip`
- Icon components: `CrossSmallIcon`, `LineChartIcon`, `ChevronDownIcon`, `SearchIcon`

Make sure these are available in your project.
