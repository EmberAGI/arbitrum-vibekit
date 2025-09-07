# Cryptocurrency Widgets Feature

This feature adds comprehensive cryptocurrency widget functionality to the Arbitrum Vibekit application, allowing users to display various types of real-time crypto data using CoinGecko's embeddable widgets.

## 🚀 Features

### Widget Types
The application now supports 9 different types of cryptocurrency widgets:

1. **Price Chart Widget** - Interactive price charts for individual cryptocurrencies
2. **Coin Heatmap Widget** - Visual heatmap of top cryptocurrencies by market cap
3. **Coin Price Marquee Widget** - Scrolling ticker with multiple coin prices
4. **Coin List Widget** - Detailed list view of selected cryptocurrencies
5. **Coin Converter Widget** - Currency conversion tool for cryptocurrencies
6. **Crypto Ticker Widget** - Compact ticker for individual cryptocurrencies
7. **Coin Compare Chart Widget** - Side-by-side comparison charts
8. **Coin Market Ticker Widget** - Market ticker with trading information
9. **Random Coin Widget** - Displays information for a randomly selected cryptocurrency

### Key Features
- **Dynamic Widget Selection**: Choose from 9 different widget types via dropdown
- **Coin Search**: Real-time search functionality using CoinGecko API
- **Multi-coin Support**: Select multiple coins for compatible widgets
- **Currency Selection**: Support for major fiat currencies (USD, EUR, GBP, etc.)
- **Appearance Customization**: 
  - Light/Dark mode toggle
  - Transparent background option
  - Outlined styling option
- **Responsive Design**: Adapts to different screen sizes and sidebar states
- **Real-time Data**: All widgets display live cryptocurrency data

## 🎯 User Interface

### Access Point
- **Location**: Header toolbar (chart icon)
- **Position**: Located to the right of the "New Chat" button when sidebar is closed
- **Tooltip**: "Crypto Widgets"

### Widget Configuration Panel
The widget panel provides:
- **Widget Type Selection**: Dropdown to choose widget type
- **Coin Selection**: 
  - Search and select from 1000+ cryptocurrencies
  - Support for single or multiple coin selection based on widget type
  - Visual chips showing selected coins with removal option
- **Currency Selection**: Choose display currency (USD, EUR, GBP, etc.)
- **Appearance Options**: Checkboxes for styling preferences
- **Live Preview**: Real-time preview of configured widget

## 🛠️ Technical Implementation

### Architecture
```
components/price-chart-widgets/
├── DynamicWidgetContainer.tsx    # Main container component
├── types.ts                      # TypeScript definitions
├── PriceChartWidget.tsx         # Individual widget components
├── CoinHeatmapWidget.tsx
├── CoinMarqueeWidget.tsx
├── CoinListWidget.tsx
├── CoinConverterWidget.tsx
├── CryptoTickerWidget.tsx
├── CoinCompareWidget.tsx
├── CoinMarketTickerWidget.tsx
├── RandomCoinWidget.tsx
└── index.ts                     # Export definitions
```

### API Integration
- **CoinGecko Search API**: `/api/search` endpoint for coin search functionality
- **Widget Scripts**: Dynamic loading of CoinGecko widget scripts
- **Real-time Data**: Widgets automatically refresh with live market data

### TypeScript Support
- **Custom JSX Elements**: Proper TypeScript definitions for all CoinGecko widget elements
- **Type Safety**: Full type coverage for component props and API responses
- **Intellisense**: Complete IDE support for widget attributes

## 🔧 Setup & Configuration

### Environment Variables
The application requires access to CoinGecko's API. Ensure you have proper API access configured.

### Dependencies
- **CoinGecko Widget Scripts**: Automatically loaded from CoinGecko CDN
- **React Portal**: For modal-style widget display
- **Tailwind CSS**: For responsive styling

### Browser Compatibility
- Modern browsers with JavaScript enabled
- Support for ES6+ features
- WebComponent support for CoinGecko widgets

## 📱 Responsive Behavior

### Desktop
- Full widget panel with side-by-side configuration and preview
- Responsive positioning based on sidebar state
- Maximum width constraints for optimal viewing

### Mobile
- Adapted layout for smaller screens
- Touch-friendly interface elements
- Optimized widget sizing

### Sidebar Integration
- **Sidebar Open**: Widget icon positioned after sidebar toggle
- **Sidebar Closed**: Widget icon positioned after "New Chat" button
- **Dynamic Positioning**: Automatic adjustment based on sidebar state

## 🎨 Styling & Themes

### Theme Support
- **Dark Mode**: Automatically respects application theme
- **Light Mode Override**: Per-widget light mode option
- **Custom Styling**: Transparent background and outline options

### Visual Design
- **Consistent UI**: Matches application design system
- **Loading States**: Animated loading indicators
- **Error Handling**: Graceful fallbacks for API failures

## 🚦 Usage Examples

### Basic Price Chart
1. Click the chart icon in the header
2. Select "Price Chart" from widget type dropdown
3. Search and select a cryptocurrency (e.g., "Bitcoin")
4. Choose display currency (e.g., "USD")
5. Customize appearance as needed
6. View live price chart

### Multi-coin Marquee
1. Select "Coin Price Marquee" widget type
2. Search and add multiple coins (Bitcoin, Ethereum, etc.)
3. Selected coins appear as removable chips
4. Configure currency and appearance
5. View scrolling price ticker

### Market Comparison
1. Choose "Coin Compare Chart" widget type
2. Add 2 or more coins for comparison
3. Select base currency
4. View side-by-side comparison charts

## 🐛 Troubleshooting

### Common Issues
- **Widget Not Loading**: Check network connection and CoinGecko API availability
- **Search Not Working**: Verify API endpoint is accessible
- **Styling Issues**: Clear browser cache and refresh

### Debug Information
- Check browser console for script loading errors
- Verify CoinGecko widget scripts are loaded
- Ensure proper API response format

## 🔄 Future Enhancements

### Planned Features
- **Portfolio Tracking**: Save favorite coin selections
- **Custom Themes**: More appearance customization options
- **Export Functionality**: Save widget configurations
- **Performance Optimization**: Lazy loading and caching improvements

### Integration Opportunities
- **Chat Integration**: Reference crypto data in chat conversations
- **Alert System**: Price alerts and notifications
- **Historical Data**: Extended chart timeframes and analysis tools

## 📄 License & Attribution

This feature integrates with CoinGecko's embeddable widgets. Please refer to CoinGecko's terms of service and attribution requirements when using their widgets in production environments.

---

**Note**: This feature requires an active internet connection to load real-time cryptocurrency data from CoinGecko's services.
