# Hyperliquid Vault Agent

A natural language trading agent that executes trading signals on Hyperliquid vaults. Users can provide trading signals in plain English, and the agent will parse the instructions and execute trades via the Hyperliquid Python API.

## Features

- 🎯 **Natural Language Processing**: Parse trading signals from plain English instructions
- 📈 **Automatic Trade Execution**: Execute buy/sell orders with take profit and stop loss levels
- 🔄 **Position Monitoring**: Automatically monitor positions for TP/SL conditions
- 💰 **Vault Integration**: Trade directly through Hyperliquid vaults
- 🛡️ **Risk Management**: Built-in position sizing and risk management
- 📊 **Status Monitoring**: Real-time vault balance and position tracking

## How It Works

1. **Signal Input**: User provides a natural language trading signal
2. **Parsing**: Agent extracts token, direction (buy/sell), TP levels, SL, and exit time
3. **Execution**: Signal is sent to Python API which executes the trade
4. **Monitoring**: Position is automatically monitored for TP/SL conditions

## Example Usage

### Trading Signal Examples

```
"Buy BTC with TP1 at 100k, TP2 at 105k, and SL at 95k"
"Sell ETH, take profit at 3500 and 3200, stop loss at 4200, exit in 6 hours"
"Go long SOL with targets 200 and 250, stop at 180"
"Short VIRTUAL, TP1 15, TP2 12, SL 18, exit in 2 days"
```

### MCP Tools Available

1. **askHyperliquidVaultAgent**: Execute trading signals
2. **getHyperliquidVaultStatus**: Check vault status and active positions

## Prerequisites

### Python API Server

This agent requires the Hyperliquid Python API server to be running. The Python server handles:
- Hyperliquid vault connections
- Order execution
- Position monitoring
- TP/SL management

Make sure to have the Python API running on the configured URL (default: http://127.0.0.1:5000).

### Environment Variables

Create a `.env` file in this directory with:

```env
# Port for the MCP server (default: 3012)
PORT=3012

# URL of the Python Hyperliquid API server
HYPERLIQUID_API_URL=http://127.0.0.1:5000
```

## Installation & Setup

### 1. Install Dependencies

From the `typescript/` directory:

```bash
pnpm install
```

### 2. Build the Agent

```bash
pnpm build
```

### 3. Start in Development

```bash
pnpm --filter hyperliquid-vault-agent dev
```

### 4. Start in Production

```bash
pnpm --filter hyperliquid-vault-agent start
```

## Docker Usage

### Build and Run with Docker Compose

From the `typescript/` directory:

```bash
# Build the agent
docker-compose build hyperliquid-vault-agent

# Run the agent
docker-compose up hyperliquid-vault-agent
```

The agent will be available at:
- **MCP SSE Endpoint**: http://localhost:3012/sse
- **Health Check**: http://localhost:3012/

## Signal Parsing

### Supported Tokens

The agent recognizes major cryptocurrency symbols including:
- **Major**: BTC, ETH, SOL, ADA, DOT, AVAX, LINK, UNI
- **DeFi**: AAVE, COMP, SUSHI, SNX, MKR, YFI, CRV
- **Meme/AI**: VIRTUAL, AI16Z, GOAT, FARTCOIN, ZEREBRO
- **And many more...**

### Direction Detection

- **Buy signals**: "buy", "long", "bullish"
- **Sell signals**: "sell", "short", "bearish"

### Price Extraction

The agent automatically extracts numeric values from instructions:
- Supports "k" notation: "100k" = 100000
- Automatically assigns prices to TP1, TP2, SL based on signal direction
- For buy signals: Lowest price = SL, Middle = TP1, Highest = TP2
- For sell signals: Highest price = SL, Middle = TP1, Lowest = TP2

### Time Extraction

Exit time can be specified or defaults to 24 hours:
- "exit in 6 hours"
- "2 days"
- "1 week"
- Default: 24 hours from now

## API Endpoints

### GET /
Server information and available tools

### GET /sse
Server-Sent Events endpoint for MCP connection

### POST /messages
MCP message handling endpoint

## Error Handling

The agent provides clear error messages for:
- Missing or invalid tokens
- Insufficient price levels
- Python API connection issues
- Invalid trading parameters

## Integration with MCP Clients

This agent can be used with any MCP-compatible client:

1. **Claude Desktop**: Add to your MCP configuration
2. **Custom Applications**: Connect via SSE endpoint
3. **Other MCP Clients**: Use the standard MCP protocol

### Example MCP Configuration

```json
{
  "mcpServers": {
    "hyperliquid-vault-agent": {
      "command": "node",
      "args": ["dist/index.js"],
      "cwd": "/path/to/hyperliquid-vault-agent",
      "env": {
        "PORT": "3012",
        "HYPERLIQUID_API_URL": "http://127.0.0.1:5000"
      }
    }
  }
}
```

## Risk Management

### Position Sizing
- Default: 10% of vault balance per trade
- Configurable via Python API environment variables
- Automatic minimum size validation

### Stop Loss Protection
- All trades include stop loss levels
- Automatic position monitoring
- Quick market order execution on SL trigger

### Time-based Exit
- Maximum position holding time
- Automatic exit if TP/SL not hit
- Configurable exit timeframes

## Monitoring & Logging

### Real-time Monitoring
- Active position count
- Vault balance tracking
- Position P&L updates

### Comprehensive Logging
- Signal parsing details
- API communication logs
- Error tracking and recovery

## Troubleshooting

### Common Issues

1. **"Could not connect to Hyperliquid API"**
   - Ensure Python API server is running
   - Check HYPERLIQUID_API_URL configuration
   - Verify network connectivity

2. **"Could not identify token/symbol"**
   - Use standard crypto symbols (BTC, ETH, SOL, etc.)
   - Check supported token list above

3. **"Please provide at least 3 price levels"**
   - Include TP1, TP2, and SL prices in your signal
   - Example: "Buy BTC 95000 100000 105000"

4. **Position not executing**
   - Check vault balance and available funds
   - Verify Python API configuration
   - Review minimum position size requirements

### Debug Mode

Enable debug logging by setting:
```env
LOG_LEVEL=debug
```

## Architecture

```
User Input → Agent Parser → Python API → Hyperliquid Vault
     ↓            ↓            ↓             ↓
Natural Language → Trading Signal → Order Execution → Position Monitoring
```

## Security Considerations

- Agent doesn't store private keys
- All trading operations go through Python API
- Environment-based configuration
- Non-root Docker execution

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

This project is part of the Arbitrum Vibekit framework.

## Support

For issues and questions:
1. Check the troubleshooting section above
2. Review Python API logs
3. Check MCP connection status
4. Open an issue with detailed error information 