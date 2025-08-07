# CoinGecko MCP Server

A Model Context Protocol (MCP) server that provides cryptocurrency price data using the CoinGecko API.

## Features

- **Generate Price Charts**: Get historical price data for supported cryptocurrencies
- **Supported Tokens**: List of popular cryptocurrencies including BTC, ETH, USDC, USDT, DAI, WBTC, WETH, ARB, BASE, MATIC, OP
- **Rate Limiting**: Built-in retry logic with exponential backoff for API rate limits
- **Multiple Transports**: Support for both HTTP/SSE and stdio transports

## Installation

```bash
cd arbitrum-vibekit/typescript/lib/mcp-tools/coingecko-mcp-server
pnpm install
pnpm build
```

## Usage

### Running the Server

#### Development Mode
```bash
pnpm dev
```

#### Production Mode
```bash
pnpm start
```

#### Watch Mode
```bash
pnpm watch
```

### Available Tools

#### 1. `generate_chart`

Generate a price chart for a cryptocurrency over a specified number of days.

**Parameters:**
- `token` (string): The symbol of the token (e.g., "BTC", "ETH")
- `days` (number): Number of days of historical data (1-365)

**Example:**
```json
{
  "token": "BTC",
  "days": 30
}
```

**Response:**
```json
{
  "prices": [[timestamp, price], ...],
  "token": "BTC",
  "tokenId": "bitcoin",
  "days": 30,
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

#### 2. `get_supported_tokens`

Get a list of all supported cryptocurrency tokens.

**Parameters:** None

**Response:**
```json
{
  "supportedTokens": [
    {
      "symbol": "BTC",
      "id": "bitcoin",
      "name": "Bitcoin"
    },
    ...
  ],
  "count": 11,
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

## Supported Tokens

| Symbol | Name | CoinGecko ID |
|--------|------|--------------|
| BTC | Bitcoin | bitcoin |
| ETH | Ethereum | ethereum |
| USDC | USD Coin | usd-coin |
| USDT | Tether | tether |
| DAI | Dai | dai |
| WBTC | Wrapped Bitcoin | wrapped-bitcoin |
| WETH | WETH | weth |
| ARB | Arbitrum | arbitrum |
| BASE | Base | base |
| MATIC | Polygon | matic-network |
| OP | Optimism | optimism |

## Configuration

The server runs on port 3002 by default. You can change this by setting the `PORT` environment variable:

```bash
PORT=3003 pnpm start
```

## Error Handling

The server includes robust error handling:

- **Rate Limiting**: Automatic retry with exponential backoff for 429 errors
- **Server Errors**: Retry logic for 5xx errors
- **Invalid Tokens**: Clear error messages for unsupported tokens
- **API Failures**: Graceful handling of CoinGecko API failures

## Integration with AI Clients

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

### Using with Other MCP Clients

The server supports both stdio and HTTP/SSE transports, making it compatible with any MCP client.

## Development

### Project Structure

```
coingecko-mcp-server/
├── src/
│   ├── index.ts      # Main entry point
│   └── mcp.ts        # MCP server implementation
├── package.json      # Dependencies and scripts
├── tsconfig.json     # TypeScript configuration
└── README.md         # This file
```

### Adding New Tokens

To add support for new tokens, update the `tokenMap` in `src/mcp.ts`:

```typescript
const tokenMap: Record<string, string> = {
  // ... existing tokens
  NEW_TOKEN: 'new-token-id', // Add new token here
};
```

### Testing

The server can be tested using any MCP client or by making direct HTTP requests to the endpoints:

- `GET /sse` - SSE connection endpoint
- `POST /messages` - Message handling endpoint

## License

ISC 