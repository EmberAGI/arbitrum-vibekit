# Liquidation Prevention Agent

An intelligent AI agent that monitors Aave positions and automatically prevents liquidations through strategic interventions. Built on the Arbitrum Vibekit framework.

## Overview

The Liquidation Prevention Agent continuously monitors user positions on Aave, tracks health factors, and executes AI-powered preventive strategies when liquidation risk is detected. The agent uses intelligent strategy selection combining wallet analysis, position data, and large language models to determine optimal prevention approaches.

## Features

- **🛡️ Continuous Monitoring**: Real-time health factor tracking with configurable thresholds
- **🎯 Intelligent Prevention Strategies**: 
  - **Supply Collateral**: Add more assets to improve health factor
  - **Repay Debt**: Reduce borrowed amounts to lower risk  
  - **Hybrid Approach**: Combined supply + repay for optimal results
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
│   │   ├── healthMonitoring.ts        # Health factor monitoring & alerts  
│   │   ├── liquidationPrevention.ts   # Intelligent prevention strategies
│   │   └── positionStatus.ts          # Position status & health checks
│   ├── tools/
│   │   ├── getUserPositions.ts        # Position data retrieval
│   │   ├── getWalletBalances.ts       # Token balance analysis
│   │   ├── monitorHealth.ts           # Continuous monitoring
│   │   ├── supplyCollateral.ts        # Supply collateral operations
│   │   ├── repayDebt.ts               # Debt repayment operations
│   │   └── intelligentPreventionStrategy.ts # AI-powered strategy selection
│   ├── context/
│   │   ├── provider.ts                # Context & configuration provider
│   │   └── types.ts                   # TypeScript interfaces
│   ├── utils/
│   │   ├── liquidationData.ts         # Data aggregation utilities
│   │   ├── tokenResolver.ts           # Token address resolution
│   │   ├── transactionExecutor.ts     # On-chain transaction execution
│   │   └── userPreferences.ts         # Natural language parsing
│   ├── schemas/
│   │   └── prevention.ts              # Zod validation schemas
│   ├── config.ts                      # Agent configuration
│   ├── tokenMap.ts                    # Token mapping loader
│   └── index.ts                       # Agent entry point
```

### Intelligent Prevention System

The agent uses **AI-powered strategy selection** through the `intelligentPreventionStrategy` tool, which:

1. **Analyzes Position Risk**: Evaluates current health factor vs target threshold
2. **Assesses Available Resources**: Reviews wallet balances and available tokens
3. **LLM Strategy Selection**: Uses large language model to determine optimal approach:
   - **SUPPLY**: Add collateral when user has available tokens
   - **REPAY**: Reduce debt when user has tokens matching borrowed assets  
   - **HYBRID**: Multi-step approach combining both supply and repay operations

**Automatic Execution**: Once strategy is selected, the agent executes the corresponding tools (`supplyCollateral`, `repayDebt`) with real on-chain transactions.

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
EMBER_ENDPOINT=https://api.emberai.xyz/mcp
USER_PRIVATE_KEY=your_private_key_here
QUICKNODE_SUBDOMAIN=your_quicknode_subdomain  
QUICKNODE_API_KEY=your_quicknode_api_key

# Optional - Agent Configuration
PORT=3010
HEALTH_FACTOR_WARNING=1.5
HEALTH_FACTOR_DANGER=1.1
HEALTH_FACTOR_CRITICAL=1.03
MONITORING_INTERVAL=900000
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
# Check position status and health factor
curl -X POST http://localhost:3010/invoke \
  -H "Content-Type: application/json" \
  -d '{
    "skillId": "position-status",
    "input": {
      "userAddress": "0x...",
      "instruction": "Check my current Aave position and health factor"
    }
  }'

# Start continuous health monitoring with automatic prevention
curl -X POST http://localhost:3010/invoke \
  -H "Content-Type: application/json" \
  -d '{
    "skillId": "health-monitoring", 
    "input": {
      "userAddress": "0x...",
      "instruction": "Monitor my health factor every 15 minutes and prevent liquidation if it drops below 1.2"
    }
  }'

# Execute intelligent liquidation prevention strategy
curl -X POST http://localhost:3010/invoke \
  -H "Content-Type: application/json" \
  -d '{
    "skillId": "liquidation-prevention",
    "input": {
      "userAddress": "0x...",
      "instruction": "Analyze my position and execute the best prevention strategy"
    }
  }'
```

## Configuration

### Health Factor Thresholds

- **Warning**: 1.5 (default) - Start monitoring more closely
- **Danger**: 1.1 (default) - Prepare for intervention
- **Critical**: 1.03 (default) - Execute prevention strategy immediately

### Strategy Selection

The agent automatically selects strategies based on:

- Available token balances for collateral supply
- Available tokens for debt repayment
- Overall portfolio composition and risk distribution
- Minimum balance thresholds (configurable)

## Key Capabilities

### ✅ Production Ready Features

- **🛡️ Continuous Health Factor Monitoring**: Real-time position tracking with configurable intervals
- **⚡ Intelligent Prevention Strategies**: Automatic supply/repay/hybrid approaches based on wallet analysis
- **🎯 Natural Language Configuration**: Parse user preferences from conversational instructions
- **🔗 MCP Integration**: Direct integration with Ember AI's blockchain tools
- **🏗️ Transaction Execution**: Real on-chain operations with user's private key
- **📊 Risk Assessment**: Multi-threshold alerting (warning/danger/critical)
- **🔧 Configurable Parameters**: Customizable health factor thresholds and monitoring intervals

## Environment Variables

### Required Configuration
| Variable | Description | Required | Default |
|----------|-------------|----------|---------|
| `OPENROUTER_API_KEY` | OpenRouter API key for LLM | Yes | - |
| `EMBER_ENDPOINT` | Ember MCP endpoint | Yes | `https://api.emberai.xyz/mcp` |
| `USER_PRIVATE_KEY` | User's private key for transaction execution | Yes | - |
| `QUICKNODE_SUBDOMAIN` | QuickNode subdomain for RPC access | Yes | - |
| `QUICKNODE_API_KEY` | QuickNode API key for RPC access | Yes | - |

### Optional Configuration
| Variable | Description | Required | Default |
|----------|-------------|----------|---------|
| `HEALTH_FACTOR_WARNING` | Warning threshold | No | `1.5` |
| `HEALTH_FACTOR_DANGER` | Danger threshold | No | `1.1` |
| `HEALTH_FACTOR_CRITICAL` | Critical threshold | No | `1.03` |
| `MONITORING_INTERVAL` | Check interval (ms) | No | `900000` |
| `MAX_RETRY_ATTEMPTS` | Maximum retry attempts | No | `3` |
| `GAS_PRICE_MULTIPLIER` | Gas price multiplier | No | `1.5` |
| `LLM_MODEL` | AI model to use | No | `deepseek/deepseek-chat-v3-0324:free` |
| `PORT` | Agent server port | No | `3010` |
| `DEBUG_MODE` | Enable debug logging | No | `false` |

### User Preference Examples
The agent can parse user preferences from natural language instructions:

```bash
# Health factor preferences
"Monitor with health factor 1.3, warning at 1.5"

# Monitoring intervals
"Check every 15 minutes, continuous monitoring"

# Combined preferences
"Prevent liquidation with health factor 1.2, monitor every 15 minutes"
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
