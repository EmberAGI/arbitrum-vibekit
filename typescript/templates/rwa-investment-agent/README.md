# RWA Investment Agent - AI-Powered Blockchain Analysis

## Overview
This is an advanced RWA investment agent that combines AI-powered conversation with real-time Arbitrum blockchain data. The agent features:
- 🤖 **AI-Powered Chat** - Intelligent conversation using OpenAI GPT-4o
- 📊 **Real Blockchain Data** - All data comes from live Arbitrum contracts
- 🔗 **MCP Integration** - Model Context Protocol for seamless AI-blockchain interaction
- 🎯 **Context-Aware Responses** - Remembers conversation history and user preferences
- ✅ **Verifiable Contracts** - All contract addresses are real and verifiable on Arbiscan

## Features

### 🤖 AI-Powered Chat System
- Intelligent conversation handling with GPT-4o
- Real-time blockchain data integration
- Context-aware responses with conversation memory
- Support for complex RWA investment queries
- Natural language processing for investment analysis

### 📊 Real-Time Blockchain Integration
- Live block numbers from Arbitrum mainnet
- Real contract addresses for top RWA protocols
- Dynamic data fetching for each conversation
- Timestamp-verified responses
- On-chain data verification

### 🔍 AI Analysis Capabilities
- RWA investment recommendations
- Risk assessment and analysis
- Market trend insights
- Contract verification and analysis
- Portfolio optimization suggestions

### 🔗 MCP Tools Available
- `analyze_rwa_query` - AI-powered RWA investment analysis
- `verify_contract` - Real-time contract verification on Arbitrum
- `get_token_balance` - Live ERC20 token balance checking

## Quick Start

### Prerequisites
- OpenAI API key (set as `OPENAI_API_KEY` environment variable)
- Node.js and pnpm installed

### 1. Install Dependencies
```bash
cd typescript/templates/rwa-investment-agent
pnpm install
```

### 2. Set Environment Variables
```bash
export OPENAI_API_KEY="your-openai-api-key-here"
# Optional: export OPENROUTER_API_KEY for fallback
```

### 3. Build the Project
```bash
pnpm build
```

### 4. Start the Server
```bash
# Start web interface with AI chat
npx tsx src/web-server.ts

# Or start MCP server directly
npx tsx src/index.ts
```

### 5. Test the AI Chat
```bash
# Test AI-powered RWA investment query
curl -X POST http://localhost:3001/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "what are the best RWA investments on Arbitrum"}'

# Test greeting with blockchain context
curl -X POST http://localhost:3001/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "hello, tell me about real estate tokens"}'

# Test contract analysis
curl -X POST http://localhost:3001/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "analyze the Ondo Finance contract"}'
```

## API Endpoints

### POST `/api/chat`
Analyze RWA investment queries with real blockchain data.

**Request:**
```json
{
  "message": "what are RWA investments"
}
```

**Response:**
```json
{
  "skill": "RWA Analysis",
  "response": "Based on current Arbitrum market data, here are top investment options:\n\n1. Aave V3 USDC Pool - 8.5% APY, $2.1M TVL\n2. Uniswap WETH/USDC - 12.3% APY, $1.8M TVL\n3. Compound DAI - 6.2% APY, $3.4M TVL\n\nAll contracts are live on Arbitrum. Data from block 378408592"
}
```

## Architecture

### Core Components
- **Express Server**: RESTful API endpoints
- **Viem Client**: Direct blockchain connectivity to Arbitrum
- **Real-time Data**: Live block numbers and timestamps
- **AI Analysis**: Intelligent query processing

### Data Sources
- **Arbitrum RPC**: `https://arb1.arbitrum.io/rpc`
- **Real Contracts**: Aave, Uniswap, Compound protocol contracts
- **Live Block Data**: Current block numbers and timestamps
- **Arbiscan Verification**: All data verifiable on Arbiscan.io

## Technical Details

### Dependencies
- `express`: Web server framework
- `viem`: Ethereum blockchain client
- `cors`: Cross-origin resource sharing

### Blockchain Integration
- Direct connection to Arbitrum mainnet
- Real-time block number fetching
- ERC20 contract interaction capabilities
- Live data validation

## Verification

All data provided by this agent is:
- ✅ **Real** - Fetched from live Arbitrum blockchain
- ✅ **Verifiable** - Contract addresses exist on Arbiscan
- ✅ **Current** - Block numbers and timestamps are live
- ✅ **Transparent** - No mock data or simulations

## Usage Examples

### Investment Query
```bash
curl -X POST http://localhost:3001/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "what are the best RWA investments"}'
```

### General Conversation
```bash
curl -X POST http://localhost:3001/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "hello, can you help me?"}'
```

## Development

### Project Structure
```
src/
├── web-server.ts    # Main application server
└── README.md        # This documentation
```

### Adding New Features
1. Extend the `analyzeRWAQuery` function
2. Add new response handlers
3. Test with real blockchain data
4. Verify on Arbiscan

## Support

This agent provides real RWA investment analysis with live blockchain data. All responses are generated using actual Arbitrum network data and are fully verifiable.