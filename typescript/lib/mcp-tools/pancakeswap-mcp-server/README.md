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

## 🌊 Phase 1: Liquidity Pool Functions

### 7. `get_pair_address`
Get the PancakeSwap V2 pair address for two tokens.

**Parameters:**
- `tokenA` (string): First token contract address
- `tokenB` (string): Second token contract address
- `chain` (string, optional): Chain identifier

### 8. `get_pair_info`
Get detailed information about a PancakeSwap V2 pair including reserves and tokens.

**Parameters:**
- `pairAddress` (string): Pair contract address
- `chain` (string, optional): Chain identifier

### 9. `get_pair_info_by_tokens`
Get pair information by providing two token addresses.

**Parameters:**
- `tokenA` (string): First token contract address
- `tokenB` (string): Second token contract address
- `chain` (string, optional): Chain identifier

### 10. `get_liquidity_position`
Get a user's liquidity position in a PancakeSwap V2 pair.

**Parameters:**
- `pairAddress` (string): Pair contract address
- `userAddress` (string): User wallet address
- `chain` (string, optional): Chain identifier

### 11. `get_all_pairs_length`
Get the total number of pairs created on PancakeSwap V2.

**Parameters:**
- `chain` (string, optional): Chain identifier

## 🚜 Phase 2: Farming & Staking Functions

### 12. `get_farm_info`
Get information about a PancakeSwap farming pool (yield farming).

**Parameters:**
- `pid` (number): Pool ID in MasterChef contract
- `chain` (string, optional): Chain identifier

### 13. `get_farm_position`
Get a user's farming position and pending rewards in a PancakeSwap farm.

**Parameters:**
- `pid` (number): Pool ID in MasterChef contract
- `userAddress` (string): User wallet address
- `chain` (string, optional): Chain identifier

### 14. `get_farm_pool_length`
Get the total number of farming pools in PancakeSwap MasterChef.

**Parameters:**
- `chain` (string, optional): Chain identifier

### 15. `get_cake_per_block`
Get the CAKE reward rate per block in PancakeSwap farming.

**Parameters:**
- `chain` (string, optional): Chain identifier

### 16. `get_syrup_pool_info`
Get information about PancakeSwap's auto-compounding Syrup Pool.

**Parameters:**
- `chain` (string, optional): Chain identifier

### 17. `get_syrup_position`
Get a user's position in PancakeSwap's auto-compounding Syrup Pool.

**Parameters:**
- `userAddress` (string): User wallet address
- `chain` (string, optional): Chain identifier

## 🎯 Phase 3: Prediction Markets, Lottery & NFT Marketplace

### 18. `get_current_prediction_epoch`
Get the current epoch number for PancakeSwap prediction markets.

**Parameters:**
- `chain` (string, optional): Chain identifier

### 19. `get_prediction_round`
Get information about a specific prediction market round.

**Parameters:**
- `epoch` (number): Epoch number to query
- `chain` (string, optional): Chain identifier

### 20. `get_prediction_position`
Get a user's position in a prediction market round.

**Parameters:**
- `epoch` (number): Epoch number
- `userAddress` (string): User wallet address
- `chain` (string, optional): Chain identifier

### 21. `get_current_lottery_id`
Get the current lottery ID for PancakeSwap lottery.

**Parameters:**
- `chain` (string, optional): Chain identifier

### 22. `get_lottery_info`
Get information about a specific PancakeSwap lottery.

**Parameters:**
- `lotteryId` (number): Lottery ID to query
- `chain` (string, optional): Chain identifier

### 23. `get_user_lottery_info`
Get a user's lottery ticket information and status.

**Parameters:**
- `lotteryId` (number): Lottery ID
- `userAddress` (string): User wallet address
- `chain` (string, optional): Chain identifier

### 24. `get_nft_collections`
Get all NFT collections available on PancakeSwap marketplace.

**Parameters:**
- `chain` (string, optional): Chain identifier

### 25. `get_nft_collection_info`
Get detailed information about a specific NFT collection.

**Parameters:**
- `collectionAddress` (string): NFT collection contract address
- `chain` (string, optional): Chain identifier

### 26. `get_nft_asks_by_collection`
Get all NFT sale offers (asks) for a specific collection.

**Parameters:**
- `collectionAddress` (string): NFT collection contract address
- `chain` (string, optional): Chain identifier

## 📈 Phase 4: Advanced Trading Features

### 27. `find_optimal_route`
Find the optimal swap route with gas optimization for token exchanges.

**Parameters:**
- `tokenIn` (string): Input token contract address
- `tokenOut` (string): Output token contract address
- `amountIn` (string): Amount of input token (in wei)
- `maxHops` (number, optional): Maximum number of hops (default: 3)
- `chain` (string, optional): Chain identifier

### 28. `get_pool_v3_info`
Get detailed information about a PancakeSwap V3 pool.

**Parameters:**
- `tokenA` (string): First token contract address
- `tokenB` (string): Second token contract address
- `fee` (number): Pool fee tier (e.g., 500 for 0.05%, 3000 for 0.3%)
- `chain` (string, optional): Chain identifier

### 29. `get_position_v3_info`
Get information about a user's PancakeSwap V3 liquidity position.

**Parameters:**
- `owner` (string): Position owner address
- `token0` (string): Token0 contract address
- `token1` (string): Token1 contract address
- `fee` (number): Pool fee tier
- `tickLower` (number): Lower tick of the position
- `tickUpper` (number): Upper tick of the position
- `chain` (string, optional): Chain identifier

### 30. `get_trading_volume`
Get 24-hour trading volume and price analytics for a token.

**Parameters:**
- `tokenAddress` (string): Token contract address
- `chain` (string, optional): Chain identifier

### 31. `get_portfolio_summary`
Get a comprehensive summary of a user's entire PancakeSwap portfolio.

**Parameters:**
- `userAddress` (string): User wallet address
- `chain` (string, optional): Chain identifier

### 32. `find_arbitrage_opportunities`
Find potential arbitrage opportunities across different trading pairs.

**Parameters:**
- `tokenIn` (string): Input token contract address
- `tokenOut` (string): Output token contract address
- `amountIn` (string): Amount of input token to arbitrage (in wei)
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
