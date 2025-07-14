# Liquidation Prevention Agent

An intelligent AI agent that monitors Aave positions and automatically prevents liquidations through strategic interventions. Built on the Arbitrum Vibekit framework.

## Overview

The Liquidation Prevention Agent continuously monitors user positions on Aave, tracks health factors, and executes preventive strategies when liquidation risk is detected. The agent uses three intelligent strategies based on user wallet balances and position analysis.

## Features

- **🛡️ Continuous Monitoring**: Real-time health factor tracking with configurable thresholds
- **🎯 Three Prevention Strategies**: 
  - Strategy 1: Supply more collateral
  - Strategy 2: Repay debt  
  - Strategy 3: Combined approach (supply + repay)
- **🧠 Intelligent Selection**: Wallet balance analysis for optimal strategy selection
- **⚡ Autonomous Operation**: Local execution with private key management
- **🔗 MCP Integration**: Direct integration with Ember AI's MCP tools for Aave operations

## Architecture

### Skills-Based Design (Quickstart-Agent Pattern)

The agent follows the focused skills architecture:

```
liquidation-prevention-agent/
├── src/
│   ├── skills/
│   │   ├── healthMonitoring.ts        # Monitor health factors
│   │   ├── liquidationPrevention.ts   # Execute strategies 1,2,3
│   │   └── riskAssessment.ts          # Strategy selection logic
│   ├── tools/
│   │   ├── getUserPositions.ts        # Health factor monitoring
│   │   ├── getWalletBalances.ts       # Balance analysis  
│   │   ├── strategy1Supply.ts         # Strategy 1 implementation
│   │   ├── strategy2Repay.ts          # Strategy 2 implementation
│   │   └── strategy3Combined.ts       # Strategy 3 implementation
│   ├── context/
│   │   ├── provider.ts                # Load configuration & token maps
│   │   └── types.ts                   # Context types
│   └── index.ts                       # Agent entry point
```

### Prevention Strategies

1. **Strategy 1 - Supply More Collateral**: Adds additional assets to improve health factor when user has sufficient token balances

2. **Strategy 2 - Repay Debt**: Reduces borrowed amounts to lower liquidation risk when user has tokens for repayment

3. **Strategy 3 - Combined Approach**: Executes both supply and repay operations when user has diverse token holdings

**Strategy Selection Logic**: The agent analyzes wallet balances via `getWalletBalances` MCP tool and automatically selects the optimal strategy.

## Quick Start

### Prerequisites

- Node.js 18+
- Docker Desktop (for containerized deployment)
- OpenRouter API key
- Ember AI MCP access

### Installation

1. **Navigate to the agent directory**:
   ```bash
   cd typescript/templates/liquidation-prevention-agent
   ```

2. **Configure environment**:
   ```bash
   cp .env.example .env
   # Edit .env and add your API keys
   ```

3. **Install dependencies** (from typescript root):
   ```bash
   cd ../../
   pnpm install
   ```

4. **Build the agent**:
   ```bash
   pnpm --filter liquidation-prevention-agent build
   ```

### Configuration

Edit `.env` file with your configuration:

```env
# Required
OPENROUTER_API_KEY=your_openrouter_api_key_here
EMBER_ENDPOINT=grpc.api.emberai.xyz:50051

# Optional - Agent Configuration
PORT=3010
HEALTH_FACTOR_WARNING=1.5
HEALTH_FACTOR_DANGER=1.2
HEALTH_FACTOR_CRITICAL=1.05

# Private Keys (Required for autonomous operation)
# PRIVATE_KEY=your_private_key_here
```

### Running the Agent

#### Development Mode

```bash
pnpm dev
```

#### Docker Deployment

1. **Enable in Docker Compose** (from typescript root):

   Uncomment the liquidation-prevention-agent service in `compose.yml`:

   ```yaml
   liquidation-prevention-agent:
     build:
       context: ./
       dockerfile: templates/liquidation-prevention-agent/Dockerfile
     container_name: vibekit-liquidation-prevention-agent
     # ... rest of configuration
   ```

2. **Start with Docker Compose**:
   ```bash
   docker compose up liquidation-prevention-agent
   ```

#### Frontend Integration

The agent is pre-configured for frontend integration:

- **Agent Config**: Already added to `typescript/clients/web/agents-config.ts`
- **Server URL**: `http://liquidation-prevention-agent:3010/sse`
- **Suggested Actions**: Monitor positions, check risks, set up prevention

## Usage

### Agent Endpoints

- **Base URL**: `http://localhost:3010`
- **Agent Card**: `http://localhost:3010/.well-known/agent.json`
- **MCP SSE**: `http://localhost:3010/sse`

### Example Interactions

```bash
# Monitor positions
curl -X POST http://localhost:3010/invoke \
  -H "Content-Type: application/json" \
  -d '{
    "skillId": "health-monitoring",
    "input": {
      "walletAddress": "0x...",
      "instruction": "Monitor my Aave positions and health factor"
    }
  }'

# Check liquidation risk
curl -X POST http://localhost:3010/invoke \
  -H "Content-Type: application/json" \
  -d '{
    "skillId": "risk-assessment", 
    "input": {
      "walletAddress": "0x...",
      "instruction": "Check my liquidation risk"
    }
  }'

# Set up automatic prevention
curl -X POST http://localhost:3010/invoke \
  -H "Content-Type: application/json" \
  -d '{
    "skillId": "liquidation-prevention",
    "input": {
      "walletAddress": "0x...",
      "instruction": "Set up automatic liquidation prevention"
    }
  }'
```

## Configuration

### Health Factor Thresholds

- **Warning**: 1.5 (default) - Start monitoring more closely
- **Danger**: 1.2 (default) - Prepare for intervention
- **Critical**: 1.05 (default) - Execute prevention strategy immediately

### Strategy Selection

The agent automatically selects strategies based on:

- Available token balances for collateral supply
- Available tokens for debt repayment
- Overall portfolio composition and risk distribution
- Minimum balance thresholds (configurable)

## Development Status

### ✅ Completed (Task 1-4.3)

- [x] Project setup with quickstart-agent pattern
- [x] Package.json configuration
- [x] TypeScript configuration
- [x] Dockerfile for containerization
- [x] Docker Compose integration
- [x] Frontend agent configuration
- [x] Environment configuration (.env.example)
- [x] Context provider with MCP integration
- [x] Basic agent entry point

### ✅ Task 2: Core Monitoring (COMPLETED)

- [x] Health monitoring skill implementation
- [x] getUserPositions tool for position tracking
- [x] getWalletBalances tool for balance analysis
- [x] monitorHealth tool for continuous monitoring
- [x] MCP tool integrations with Ember server

### ✅ Task 3: Liquidation Prevention Strategies (COMPLETED)

- [x] Liquidation prevention skill implementation
- [x] Strategy 1: Supply collateral tool
- [x] Strategy 2: Repay debt tool
- [x] Strategy 3: Intelligent automatic strategy selection
- [x] Real transaction execution with user's private key
- [x] TransactionExecutor utility for on-chain operations

### ✅ Task 4.1-4.3: Configuration & Safety Features (COMPLETED)

- [x] **Task 4.1**: Configurable health factor thresholds (default: 1.1)
- [x] **Task 4.2**: Configurable monitoring intervals (default: 15 minutes)
- [x] **Task 4.3**: User preference parsing from initial instructions
- [x] UserPreferences utility for natural language parsing
- [x] Preference merging with default configuration
- [x] Enhanced input schemas with instruction field
- [x] Updated examples with preference-based instructions

### 🚧 Future Tasks

- [ ] Advanced gas optimization features
- [ ] Emergency stop functionality
- [ ] Multi-chain support
- [ ] Advanced analytics and reporting

## Environment Variables

### Required Configuration
| Variable | Description | Required | Default |
|----------|-------------|----------|---------|
| `OPENROUTER_API_KEY` | OpenRouter API key for LLM | Yes | - |
| `EMBER_ENDPOINT` | Ember MCP endpoint | Yes | `grpc.api.emberai.xyz:50051` |
| `USER_PRIVATE_KEY` | User's private key for transaction execution | Yes | - |
| `QUICKNODE_SUBDOMAIN` | QuickNode subdomain for RPC access | Yes | - |
| `QUICKNODE_API_KEY` | QuickNode API key for RPC access | Yes | - |

### Task 4.1: Health Factor Thresholds
| Variable | Description | Required | Default |
|----------|-------------|----------|---------|
| `HEALTH_FACTOR_WARNING` | Warning threshold | No | `1.5` |
| `HEALTH_FACTOR_DANGER` | Danger threshold | No | `1.2` |
| `HEALTH_FACTOR_CRITICAL` | Critical threshold | No | `1.05` |

### Task 4.2: Monitoring Configuration
| Variable | Description | Required | Default |
|----------|-------------|----------|---------|
| `MONITORING_INTERVAL` | Check interval (ms) | No | `60000` |
| `MAX_RETRY_ATTEMPTS` | Maximum retry attempts | No | `3` |
| `GAS_PRICE_MULTIPLIER` | Gas price multiplier | No | `1.5` |

### Task 4.3: Strategy & User Preferences
| Variable | Description | Required | Default |
|----------|-------------|----------|---------|
| `DEFAULT_STRATEGY` | Strategy preference | No | `auto` |
| `MIN_SUPPLY_BALANCE_USD` | Minimum USD for supply | No | `100` |
| `MIN_REPAY_BALANCE_USD` | Minimum USD for repay | No | `50` |
| `MAX_TRANSACTION_USD` | Maximum USD per transaction | No | `10000` |

### Optional Configuration
| Variable | Description | Required | Default |
|----------|-------------|----------|---------|
| `PORT` | Agent server port | No | `3010` |
| `ENABLE_WEBHOOKS` | Enable webhook notifications | No | `false` |
| `WEBHOOK_URL` | Webhook URL for notifications | No | - |
| `RATE_LIMIT_RPM` | Rate limit requests per minute | No | `60` |
| `DEBUG_MODE` | Enable debug logging | No | `false` |

### User Preference Examples (Task 4.3)
The agent can parse user preferences from natural language instructions:

```bash
# Health factor preferences
"Monitor with health factor 1.3, warning at 1.5"

# Monitoring intervals
"Check every 30 minutes, continuous monitoring"

# Strategy preferences  
"Use conservative strategy, max $500 transactions"

# Risk tolerance
"Apply aggressive approach with gas optimization"

# Combined preferences
"Prevent liquidation with health factor 1.2, monitor every 15 minutes, conservative approach, max $1000"
```

See `.env.example` for complete configuration options.

## Security

- **Private Key Storage**: Store private keys securely in `.env` file
- **Local Execution**: Agent runs locally with your private keys
- **No External Storage**: No private data sent to external services
- **Configurable Limits**: Set maximum transaction amounts and rate limits

## Support

- **Framework**: [Arbitrum Vibekit Documentation](https://docs.emberai.xyz/vibekit/introduction)
- **Discord**: [Ember AI Support](https://discord.com/invite/bgxWQ2fSBR)
- **Repository**: [GitHub Issues](https://github.com/EmberAGI/arbitrum-vibekit/issues)

## License

[Add license information] 
