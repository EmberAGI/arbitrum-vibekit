# Camelot v3 LP Rebalancing Agent

An automated liquidity position rebalancing agent for Camelot v3 concentrated liquidity pools. This agent dynamically adjusts liquidity ranges using quantitative algorithms and supports both **Active Mode** (auto-execution) and **Passive Mode** (alert-only).

## 🎯 Features

- **Automated Rebalancing**: Dynamically adjusts LP ranges based on market conditions
- **Auto-Discovery**: Automatically fetches and monitors all active LP positions from wallet
- **Multi-Chain Support**: Monitor positions across multiple chains (Arbitrum, Ethereum, etc.)
- **Risk Management**: User-selectable risk profiles (low, medium, high)
- **Dual Operating Modes**:
  - **Passive Mode**: Monitors positions and sends alerts via Telegram
  - **Active Mode**: Automatically executes rebalances on-chain
- **Flexible Discovery Modes**:
  - **Auto-Discover**: Monitor all wallet positions across specified chains
  - **Single-Pool**: Focus on a specific pool address
- **Real-time Monitoring**: Configurable check intervals (default: 1 hour)
- **Comprehensive Analytics**: APR tracking, fee calculations, and position health scoring
- **AI-Powered Analysis**: LLM-based position analysis with intelligent recommendations
- **Telegram Integration**: Rich notifications for alerts and confirmations
- **Production Ready**: Docker support, health endpoints, and structured logging

## 🏗 Architecture

### Core Components

1. **A2A Tasks**: Scheduled tasks for passive/active monitoring
2. **MCP Tools**: Blockchain interaction tools via Ember API
3. **Strategy Engine**: Volatility calculation and range optimization
4. **Notification System**: Telegram bot integration
5. **Skills**: High-level capabilities exposed via the v2 framework

### Skills Available

- **LP Rebalancing**: Analyze and rebalance concentrated liquidity positions with 10 comprehensive tools
- **Monitoring Control**: Start, stop, and check status of automated monitoring

### Available Tools

The agent provides 10 powerful tools for comprehensive LP management:

1. **fetchWalletPositions** - Auto-discover all active LP positions across chains
2. **getWalletLiquidityPositions** - Get detailed position information for specific pools
3. **getLiquidityPools** - Fetch pool data and configuration
4. **getTokenMarketData** - Get real-time token prices and market data
5. **withdrawLiquidity** - Withdraw liquidity from positions
6. **supplyLiquidity** - Supply liquidity to pools with optimal ranges
7. **swapTokens** - Swap tokens for rebalancing (placeholder for future implementation)
8. **getWalletBalances** - Check wallet token balances
9. **calculatePoolKPIs** - Calculate comprehensive pool performance metrics
10. **analyzePositionWithLLM** - AI-powered position analysis and recommendations

## 🚀 Quick Start

### Prerequisites

- Node.js 20+
- pnpm
- At least one AI provider API key (OpenAI, Anthropic, XAI, Hyperbolic, or OpenRouter)
- Wallet private key for transaction signing
- (Optional) Telegram bot for notifications

### Installation

1. **Clone and navigate to the template**:

   ```bash
   cd typescript/templates/alloc8-camelot-v3-rebalancer
   ```

2. **Install dependencies**:

   ```bash
   pnpm install
   ```

3. **Configure environment**:

   ```bash
   cp env.example .env
   # Edit .env with your configuration
   ```

4. **Build the agent**:

   ```bash
   pnpm build
   ```

5. **Start the agent**:
   ```bash
   pnpm start
   ```

## ⚙️ Configuration

### Position Discovery Modes

The agent supports two discovery modes:

#### 1. Auto-Discovery Mode (Recommended)

Automatically fetches and monitors **all active LP positions** from your wallet across multiple chains:

```bash
# Discovery Configuration
DISCOVERY_MODE=auto-discover
CHAIN_IDS=42161,1              # Arbitrum and Ethereum

# AI Provider (at least one required)
OPENAI_API_KEY=your_openai_api_key_here

# Wallet
WALLET_PRIVATE_KEY=your_wallet_private_key_here
```

**Benefits:**

- No need to manually specify pool addresses
- Monitors all your positions automatically
- Multi-chain support
- Scales with your portfolio

#### 2. Single-Pool Mode

Focus monitoring on a specific pool:

```bash
# Discovery Configuration
DISCOVERY_MODE=single-pool
POOL_ID=0x...                  # Specific Camelot v3 pool address
TOKEN_0=ETH                    # First token symbol
TOKEN_1=USDC                   # Second token symbol

# AI Provider (at least one required)
OPENAI_API_KEY=your_openai_api_key_here

# Wallet
WALLET_PRIVATE_KEY=your_wallet_private_key_here
```

### Required Environment Variables

```bash
# AI Provider (at least one required)
OPENAI_API_KEY=your_openai_api_key_here
OPENROUTER_API_KEY=your_openrouter_api_key_here
ANTHROPIC_API_KEY=your_anthropic_api_key_here
XAI_API_KEY=your_xai_api_key_here
HYPERBOLIC_API_KEY=your_hyperbolic_api_key_here

# Preferred AI provider and model
AI_PROVIDER=openai
AI_MODEL=gpt-4

# Wallet
WALLET_PRIVATE_KEY=your_wallet_private_key_here

# Subgraph Configuration (required)
SUBRAPH_API_KEY=your_subgraph_api_key_here

# Discovery Mode
DISCOVERY_MODE=auto-discover    # or single-pool
```

### Optional Configuration

```bash
# Operating Mode
REBALANCER_MODE=passive  # passive or active
RISK_PROFILE=medium      # low, medium, or high
CHECK_INTERVAL=3600000   # 1 hour in milliseconds

# Telegram Notifications
TELEGRAM_BOT_TOKEN=your_bot_token
TELEGRAM_CHAT_ID=your_chat_id

# Thresholds
PRICE_DEVIATION_THRESHOLD=0.05    # 5%
UTILIZATION_THRESHOLD=0.8         # 80%

# Subgraph API Key (required)
# Get your API key from: https://thegraph.com/studio/
SUBRAPH_API_KEY=your_subgraph_api_key_here
```

### Risk Profiles

| Profile    | Range Width | Rebalance Threshold | Max Slippage | Min Position |
| ---------- | ----------- | ------------------- | ------------ | ------------ |
| **Low**    | 2.0x        | 15%                 | 0.5%         | $1,000       |
| **Medium** | 1.5x        | 10%                 | 1.0%         | $500         |
| **High**   | 1.0x        | 5%                  | 2.0%         | $100         |

## 📖 Usage

### Starting Monitoring

Once the agent is running, you can interact with it via MCP calls:

```json
{
  "method": "tools/call",
  "params": {
    "name": "startMonitoring",
    "arguments": {
      "action": "start",
      "mode": "passive"
    }
  }
}
```

### Checking Status

```json
{
  "method": "tools/call",
  "params": {
    "name": "getMonitoringStatus",
    "arguments": {
      "action": "status"
    }
  }
}
```

### Manual Rebalancing

```json
{
  "method": "tools/call",
  "params": {
    "name": "getWalletLiquidityPositions",
    "arguments": {
      "walletAddress": "0x...",
      "poolAddress": "0x..."
    }
  }
}
```

#### Auto-Discovery Tool

Use the new `fetchWalletPositions` tool to automatically discover all active positions:

```json
{
  "method": "tools/call",
  "params": {
    "name": "fetchWalletPositions",
    "arguments": {
      "chainIds": [42161, 1],
      "activeOnly": true
    }
  }
}
```

#### AI-Powered Analysis

Use the `analyzePositionWithLLM` tool for intelligent position analysis:

```json
{
  "method": "tools/call",
  "params": {
    "name": "analyzePositionWithLLM",
    "arguments": {
      "positionId": "123",
      "poolAddress": "0x...",
      "currentRange": {
        "lower": -276320,
        "upper": -276300
      },
      "currentPrice": 2000.5,
      "token0Decimals": 18,
      "token1Decimals": 6,
      "tickSpacing": 1,
      "kpis": {...},
      "riskProfile": "medium"
    }
  }
}
```

**Response includes:**

- Position details with enhanced metadata
- Token symbols and decimals
- Current price and price ranges
- Position utilization rates
- Summary statistics across all chains
- AI-powered analysis and recommendations

## 🤖 A2A Tasks

### Passive Mode Task

- Monitors LP positions every hour (configurable)
- Evaluates rebalance needs using quantitative algorithms
- Uses AI-powered analysis for intelligent recommendations
- Sends Telegram alerts when rebalancing is recommended
- Provides detailed analysis and APR improvement estimates

### Active Mode Task

- Performs same monitoring as Passive Mode
- Automatically executes rebalances when triggered
- Handles multi-step workflows:
  1. Withdraw current liquidity
  2. Swap tokens if needed for optimal ratio
  3. Supply liquidity at new optimal range
- Uses AI analysis to determine optimal ranges and risk levels
- Sends confirmation notifications with transaction hashes

## 🧮 Strategy Algorithm

### AI-Powered Analysis

The agent uses LLM analysis to provide intelligent recommendations:

1. **Position Health Assessment**: Evaluates current position performance
2. **Market Condition Analysis**: Assesses market volatility and trends
3. **Risk Level Evaluation**: Determines appropriate risk level based on market conditions
4. **Optimal Range Calculation**: AI recommends optimal range width and center positioning
5. **Expected Outcomes**: Predicts fee earnings potential and impermanent loss risk

### Volatility Calculation

1. **Historical Volatility**: Based on 24h price changes
2. **Implied Volatility**: Derived from pool volume/TVL ratio
3. **Combined Volatility**: Weighted average with confidence scoring

### Range Optimization

1. Calculate optimal range width based on volatility and risk profile
2. Convert price ranges to tick ranges (Uniswap v3 compatible)
3. Apply tick spacing constraints for Camelot v3
4. AI-driven center positioning and skew adjustments

### Rebalance Triggers

- Position out of range
- Price deviation exceeds threshold
- Low liquidity utilization (<30%)
- AI-recommended rebalancing based on market conditions
- Configurable thresholds per risk profile

## 🤖 AI Capabilities

### LLM-Powered Analysis

The agent leverages multiple AI providers for intelligent position analysis:

- **OpenAI GPT-4**: Advanced reasoning and market analysis
- **Anthropic Claude**: Comprehensive DeFi strategy evaluation
- **XAI Grok**: Real-time market sentiment analysis
- **Hyperbolic**: Specialized DeFi optimization
- **OpenRouter**: Access to multiple models via unified API

### Analysis Features

- **Position Health Scoring**: Evaluates current position performance
- **Market Condition Assessment**: Analyzes volatility and trends
- **Risk Level Determination**: Adjusts strategy based on market conditions
- **Optimal Range Recommendations**: AI-driven range width and positioning
- **Expected Outcome Predictions**: Fee earnings and impermanent loss estimates
- **Monitoring Suggestions**: Customized check frequencies and triggers

### Example AI Analysis Output

```json
{
  "analysis": {
    "position_health": "good",
    "market_conditions": "favorable",
    "risk_level": "medium",
    "key_insights": [
      "Position is well-positioned for current market conditions",
      "Volatility suggests optimal range width of 2.5%",
      "Consider slight upward skew due to bullish sentiment"
    ]
  },
  "recommendation": {
    "action": "rebalance",
    "confidence": 0.85,
    "reasoning": "Current range is too narrow for market volatility",
    "risk_level": "medium",
    "half_width_pct": 2.5,
    "center_skew_pct": 0.5,
    "expected_outcomes": {
      "fee_earnings_potential": "high",
      "impermanent_loss_risk": "medium",
      "liquidity_utilization": "high"
    }
  }
}
```

## 🔔 Telegram Integration

### Setup Telegram Bot

1. Create a bot with [@BotFather](https://t.me/BotFather)
2. Get your bot token
3. Get your chat ID (message the bot, then visit: `https://api.telegram.org/bot<TOKEN>/getUpdates`)
4. Add to your `.env`:
   ```bash
   TELEGRAM_BOT_TOKEN=your_bot_token
   TELEGRAM_CHAT_ID=your_chat_id
   ```

### Notification Types

- **Rebalance Alerts** (Passive Mode) - AI analysis and recommendations
- **Rebalance Confirmations** (Active Mode) - Transaction details and results
- **Error Notifications** - System errors and transaction failures
- **System Status Updates** - Monitoring status and health checks
- **Position Analysis** - Detailed AI-powered position insights

## 🐳 Docker Deployment

### Development

```bash
docker build -t camelot-rebalancer .
docker run --env-file .env -p 3001:3001 camelot-rebalancer
```

### Production

```bash
docker build -f Dockerfile.prod -t camelot-rebalancer:prod .
docker run --env-file .env -p 3001:3001 camelot-rebalancer:prod
```

## 🧪 Testing

```bash
# Run tests
pnpm test

# Run tests in watch mode
pnpm test:watch

# Run with coverage
pnpm test --coverage
```

## 📊 Monitoring & Observability

### Health Endpoints

- `GET /health` - Basic health check
- `GET /.well-known/agent.json` - Agent card with capabilities

### Logging

Structured logging with different levels:

- **Info**: Normal operations, rebalance decisions
- **Warn**: Configuration issues, fallback actions
- **Error**: Failed transactions, API errors

### Metrics

The agent tracks:

- Rebalance frequency and success rate
- APR improvements achieved
- Gas costs and slippage
- Position health scores over time

## 🔒 Security Considerations

### Private Key Management

- Store private keys securely in environment variables
- Consider using hardware wallets or MPC solutions for production
- Never commit private keys to version control

### Risk Management

- Start with Passive Mode to understand behavior
- Use appropriate risk profiles for your risk tolerance
- Monitor gas costs and slippage limits
- Set reasonable position size limits

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](../../LICENSE) file for details.

## 🆘 Support

For issues and questions:

1. Check the [troubleshooting guide](#troubleshooting)
2. Review existing [GitHub issues](https://github.com/your-repo/issues)
3. Create a new issue with detailed information

## 🔧 Troubleshooting

### Common Issues

**Agent won't start**

- Check all required environment variables are set
- Verify at least one AI provider API key is valid
- Ensure wallet private key format is correct
- Check that the preferred AI provider is available

**No positions found**

- Verify `POOL_ID` matches your actual LP positions (single-pool mode)
- Check wallet address derivation from private key
- Confirm you have positions in the specified pool
- Try auto-discovery mode to find all positions automatically

**AI analysis fails**

- Verify AI provider API key is valid and has sufficient credits
- Check that the preferred AI model is available
- Ensure position data is complete and valid
- Try switching to a different AI provider

**Telegram notifications not working**

- Verify bot token and chat ID are correct
- Ensure the bot can send messages to your chat
- Check bot permissions and chat settings

**Rebalancing fails**

- Check wallet has sufficient balance for gas
- Verify token approvals are in place
- Review slippage settings and market conditions
- Ensure position data is valid and complete

### Debug Mode

Enable detailed logging:

```bash
DEBUG=* pnpm start
```

### MCP Inspector

Inspect the agent's MCP interface:

```bash
pnpm run inspect:npx
```

## 🗺 Roadmap

- [x] AI-powered position analysis and recommendations
- [x] Auto-discovery of wallet positions across chains
- [x] Comprehensive tool suite for LP management
- [x] A2A Tasks for automated monitoring and execution
- [ ] Multi-pool monitoring support
- [ ] Advanced ML-based strategies
- [ ] Cross-chain rebalancing
- [ ] Portfolio-level optimization
- [ ] Web dashboard for monitoring
- [ ] Smart contract wallet integration
- [ ] Historical performance analytics
- [ ] Enhanced swap functionality for token rebalancing
