# 🥞 PancakeSwap MCP Server

A comprehensive Model Context Protocol (MCP) server for PancakeSwap DeFi operations, enabling AI agents to interact with PancakeSwap's trading, liquidity, and analytics features.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue.svg)](https://www.typescriptlang.org/)
[![Viem](https://img.shields.io/badge/Viem-2.0+-green.svg)](https://viem.sh/)

## 🚀 Features

- **Token Information** - Get detailed token metadata (symbol, name, decimals)
- **Price Quotes** - Get real-time swap quotes with price impact
- **Token Pricing** - Get current token prices in USD/reference tokens
- **Allowance Management** - Check and manage token allowances
- **Multi-Chain Support** - BSC, Ethereum, Arbitrum, Polygon
- **No API Keys Required** - Direct smart contract interaction
- **Type-Safe** - Full TypeScript support with comprehensive types

## 📋 Prerequisites

- Node.js 18+ or Docker
- No API keys required (uses public RPC endpoints)

## 🛠️ Quickstart

### Docker (Recommended)

```bash
# Clone and build
git clone <repository>
cd typescript/lib/mcp-tools/pancakeswap-mcp-server

# Run with Docker
docker build -t pancakeswap-mcp-server .
docker run -p 3002:3002 -e PANCAKESWAP_CHAIN=bsc pancakeswap-mcp-server
```

### Node.js

```bash
# Install dependencies
pnpm install

# Build the project
pnpm build

# Start the server
pnpm start

# Or run in development
pnpm dev
```

### Environment Configuration

Copy `env.example` to `.env` and configure:

```bash
cp env.example .env
```

```env
# Chain Configuration
PANCAKESWAP_CHAIN=bsc
RPC_URL=https://bsc-dataseed.binance.org/
PORT=3002
```

## 🔌 API Endpoints

Once running, the server exposes:

- `GET /health` - Health check endpoint
- `GET /sse` - SSE connection for MCP communications
- `POST /messages` - Message endpoint for MCP communications

## 🛠️ Available MCP Tools

### 1. `get_token_info`
Get detailed information about a token.

**Parameters:**
- `tokenAddress` (string): Token contract address
- `chain` (string, optional): Chain (bsc, ethereum, arbitrum, polygon)

**Example:**
```json
{
  "method": "tools/call",
  "params": {
    "name": "get_token_info",
    "arguments": {
      "tokenAddress": "0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82",
      "chain": "bsc"
    }
  }
}
```

### 2. `get_price_quote`
Get a price quote for swapping tokens.

**Parameters:**
- `tokenIn` (string): Input token contract address
- `tokenOut` (string): Output token contract address
- `amountIn` (string): Amount of input token to swap
- `decimals` (number, optional): Decimals of input token (default: 18)
- `chain` (string, optional): Chain identifier

**Example:**
```json
{
  "method": "tools/call",
  "params": {
    "name": "get_price_quote",
    "arguments": {
      "tokenIn": "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c",
      "tokenOut": "0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56",
      "amountIn": "1.0",
      "chain": "bsc"
    }
  }
}
```

### 3. `get_token_price`
Get the current price of a token in USD.

**Parameters:**
- `tokenAddress` (string): Token contract address
- `amount` (string, optional): Amount to price (default: 1)
- `chain` (string, optional): Chain identifier

### 4. `check_token_allowance`
Check the allowance of a token for a specific spender.

**Parameters:**
- `tokenAddress` (string): Token contract address
- `owner` (string): Token owner address
- `spender` (string): Spender address (usually router)
- `chain` (string, optional): Chain identifier

### 5. `get_chain_info`
Get information about the configured chain.

**Parameters:**
- `chain` (string, optional): Chain identifier

### 6. `get_common_tokens`
Get a list of common token addresses for the specified chain.

**Parameters:**
- `chain` (string, optional): Chain identifier

## 🌐 Supported Chains

| Chain | Chain ID | Router Address | WETH Address |
|-------|----------|----------------|--------------|
| BSC | 56 | 0x10ED43C718714eb63d5aA57B78B54704E256024E | 0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c |
| Ethereum | 1 | 0xE592427A0AEce92De3Edee1F18E0157C05861564 | 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2 |
| Arbitrum | 42161 | 0xE592427A0AEce92De3Edee1F18E0157C05861564 | 0x82aF49447D8a07e3bd95BD0d56f35241523fBab1 |
| Polygon | 137 | 0xE592427A0AEce92De3Edee1F18E0157C05861564 | 0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270 |

## 🔧 Common Token Addresses (BSC)

| Token | Symbol | Address |
|-------|--------|---------|
| Wrapped BNB | WBNB | 0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c |
| Binance USD | BUSD | 0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56 |
| Tether USD | USDT | 0x55d398326f99059fF775485246999027B3197955 |
| USD Coin | USDC | 0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d |
| PancakeSwap Token | CAKE | 0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82 |
| Ethereum | ETH | 0x2170Ed0880ac9A755fd29B2688956BD959F933F8 |
| Bitcoin BEP2 | BTCB | 0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c |

## 🧪 Testing

```bash
# Run tests
pnpm test

# Test with curl
curl -X POST http://localhost:3002/messages \
  -H "Content-Type: application/json" \
  -d '{
    "method": "tools/call",
    "params": {
      "name": "get_token_info",
      "arguments": {
        "tokenAddress": "0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82",
        "chain": "bsc"
      }
    }
  }'
```

## 🔒 Security Notes

- **No API Keys Required** - Uses public RPC endpoints
- **Read-Only by Default** - Most operations are read-only
- **Private Key Handling** - Only use private keys in secure environments
- **Rate Limiting** - Consider implementing rate limiting for production use

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

## 🆘 Support

- **Issues**: [GitHub Issues](https://github.com/EmberAGI/arbitrum-vibekit/issues)
- **Documentation**: [Vibekit Docs](https://github.com/EmberAGI/arbitrum-vibekit)
- **Community**: [Discord](https://discord.gg/emberai)

---

**Built with ❤️ for the Arbitrum Vibekit ecosystem**
