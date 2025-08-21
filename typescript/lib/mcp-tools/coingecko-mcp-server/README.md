# CoinGecko MCP Server

A Model Context Protocol (MCP) server that provides cryptocurrency price data and chart generation using the CoinGecko API.

## 🚀 Features

- **Price Chart Generation**: Create interactive price charts for supported cryptocurrencies
- **Multi-timeframe Support**: Historical data from 1-365 days
- **Token Discovery**: Get list of supported cryptocurrency tokens
- **Rate Limit Handling**: Built-in retry mechanism with exponential backoff
- **Dual Transport**: HTTP endpoints + stdio transport support

## 🛠 Architecture

### Transport Layer
- **StreamableHTTP**: Modern HTTP transport with session management
- **Stdio**: Command-line interface support
- **Endpoints**: `/mcp` (POST/GET/DELETE)

### Tools Available

#### 1. `generate_chart`
Generate price charts for cryptocurrencies using CoinGecko API.

**Parameters:**
- `token` (string): Token symbol (BTC, ETH, USDC, etc.)
- `days` (number): Historical data range (1-365 days)

**Response:**
```json
{
  "prices": [[timestamp, price], ...],
  "token": "BTC",
  "tokenId": "bitcoin",
  "days": 7,
  "timestamp": "2025-01-01T12:00:00.000Z"
}
```

#### 2. `get_supported_tokens`
Get list of all supported cryptocurrency tokens.

**Parameters:** None

**Response:**
```json
{
  "supportedTokens": [
    {"symbol": "BTC", "id": "bitcoin", "name": "Bitcoin"},
    {"symbol": "ETH", "id": "ethereum", "name": "Ethereum"}
  ],
  "count": 10
}
```

## 💰 Supported Tokens

| Symbol | CoinGecko ID | Name |
|--------|--------------|------|
| BTC | bitcoin | Bitcoin |
| ETH | ethereum | Ethereum |
| USDC | usd-coin | USD Coin |
| USDT | tether | Tether |
| DAI | dai | Dai |
| WBTC | wrapped-bitcoin | Wrapped Bitcoin |
| WETH | weth | Wrapped Ether |
| ARB | arbitrum | Arbitrum |
| BASE | base | Base |
| MATIC | matic-network | Polygon |
| OP | optimism | Optimism |

## 🔧 Configuration

### Environment Variables
- `PORT`: Server port (default: 3011)

### Endpoints
- **HTTP**: `http://localhost:3011/mcp` (POST/GET/DELETE)
- **Health**: Server logs indicate ready state

## 📊 Frontend Integration

### Message Renderer Integration
The frontend automatically detects chart generation tools:

```typescript
// Detects these tool patterns:
- toolName.endsWith('generate_chart')
- toolName === 'coingecko-generate_chart'

// Renders with PriceChart component
<PriceChart data={chartData} />
```

### Chart Component Features
- **Interactive tooltips** with price and timestamp
- **Responsive design** with hover effects
- **SVG-based rendering** for crisp visuals
- **Gradient styling** with professional appearance

## 🏗 Development

### Installation
```bash
cd arbitrum-vibekit/typescript/lib/mcp-tools/coingecko-mcp-server
pnpm install
pnpm build
```

### Build Commands
```bash
# Build TypeScript
pnpm build

# Development mode
pnpm dev

# Production mode
pnpm start

# Watch mode
pnpm watch
```

### File Structure
```
src/
├── mcp.ts           # MCP server core & tools
├── index.ts         # Main entry point (HTTP + stdio)
├── http-server.ts   # HTTP-only server
└── package.json     # Dependencies & scripts
```

## 🔄 Recent Updates

### v2.0 - StreamableHTTP Migration
- **Migrated from SSE to StreamableHTTP** transport
- **Added session management** for better reliability
- **Enhanced error handling** with JSON-RPC responses
- **Improved rate limiting** with p-retry integration

### Transport Changes
- **Before**: `/sse` endpoint with SSEServerTransport
- **After**: `/mcp` endpoint with StreamableHTTPServerTransport
- **Benefits**: Better session handling, resumability, unified endpoints

## 🔌 Client Integration

### Frontend Configuration
```typescript
// agents-config.ts
['coingecko', 'http://coingecko-mcp-server:3011/mcp']

// tool-agents.ts
const transport = new StreamableHTTPClientTransport(
  new URL(serverUrl),
  {} // headers
);
```

### Usage Examples

**Generate BTC Chart:**
```
User: "Generate a BTC price chart for 7 days"
AI: Calls coingecko-generate_chart(token="BTC", days=7)
Frontend: Renders interactive price chart
```

**List Supported Tokens:**
```
User: "What cryptocurrency tokens are supported?"
AI: Calls coingecko-get_supported_tokens()
Response: List of 11 supported tokens
```

## 🚨 Error Handling

### Rate Limiting
- **Automatic retry** with exponential backoff
- **Max retries**: 5 attempts
- **Backoff**: 1s → 2s → 4s → 8s → 16s

### Common Errors
- **Unsupported token**: Returns available token list
- **API failure**: JSON error response with details
- **Invalid timeframe**: Validates 1-365 day range

## 📈 Performance

### API Efficiency
- **Direct CoinGecko integration** (no intermediary)
- **Minimal data transformation** 
- **Efficient JSON parsing** and response formatting

### Resource Usage
- **Memory**: Low footprint, stateless design
- **Network**: Only outbound CoinGecko API calls
- **CPU**: Light JSON processing overhead

## 🔍 Monitoring & Debugging

### Server Logs
```bash
# Connection logs
CoinGecko MCP Server is running on port 3011
MCP endpoint available at http://localhost:3011/mcp

# Tool execution logs  
🔍 [MCP] Fetching chart data for BTC (bitcoin) over 7 days
🔍 [MCP] Chart data received: 168 data points
```

### Frontend Debugging
```bash
# Browser console
🔍 [MCP Chart] Parsed chart data: {prices: Array(168), token: "BTC"}
```

## 🚀 Deployment

### Docker Integration
```yaml
# compose.yml
coingecko-mcp-server:
  build: ./lib/mcp-tools/coingecko-mcp-server
  ports:
    - "3011:3011"
  environment:
    - PORT=3011
```


## 🔧 Adding New Tokens

To add support for new tokens, update the `tokenMap` in `src/mcp.ts`:

```typescript
const tokenMap: Record<string, string> = {
  // ... existing tokens
  NEW_TOKEN: 'new-token-coingecko-id', // Add new token here
};
```

## 🧪 Testing

### Using with Claude Desktop
Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "coingecko": {
      "command": "node",
      "args": ["/path/to/coingecko-mcp-server/dist/index.js"],
      "env": {}
    }
  }
}
```

### Direct HTTP Testing
```bash
# Test tool discovery
curl -X POST http://localhost:3011/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc": "2.0", "method": "tools/list", "id": 1}'

# Test chart generation
curl -X POST http://localhost:3011/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0", 
    "method": "tools/call",
    "params": {
      "name": "generate_chart",
      "arguments": {"token": "BTC", "days": 7}
    },
    "id": 2
  }'
```

---

*This server provides reliable cryptocurrency data integration for the Arbitrum Vibekit ecosystem.*