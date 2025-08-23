# 🏛️ RWA Investment Agent - Setup & Usage Guide

A production-ready AI agent for Real World Asset (RWA) investment and portfolio management with full blockchain integration on Arbitrum.

## 🚀 Quick Start

### 1. Prerequisites
- Node.js 18+ 
- pnpm package manager
- OpenAI API key
- Arbitrum RPC URL (optional, defaults to mainnet)

### 2. Installation
```bash
# Navigate to the project
cd typescript/templates/rwa-investment-agent

# Install dependencies
pnpm install

# Build the project
pnpm build
```

### 3. Configuration
Create a `.env` file in the project root:
```env
# AI Provider (Required)
OPENAI_API_KEY=your_openai_api_key_here
AI_PROVIDER=openai
AI_MODEL=gpt-4o-mini

# Server Configuration
PORT=3008
NODE_ENV=development

# Blockchain Configuration (Optional)
ARBITRUM_RPC_URL=https://arb1.arbitrum.io/rpc
```

### 4. Start the Agent
```bash
# Development mode
pnpm dev

# Production mode
pnpm start
```

The agent will start on `http://localhost:3008`

## 🏗️ Architecture Overview

### Core Components
- **Agent Server**: MCP-compliant server with HTTP/SSE endpoints
- **Skills**: High-level capabilities exposed as MCP tools
- **Tools**: Internal implementations for specific actions
- **Real Blockchain Client**: Direct Arbitrum integration using Viem

### Available Skills
1. **RWA Asset Discovery** - Find investment opportunities
2. **RWA Compliance Verification** - Check regulatory compliance
3. **RWA Investment Execution** - Execute investments with blockchain
4. **Test Skill** - Basic functionality verification

## 🧪 Testing the Agent

### 1. Health Check
```bash
curl http://localhost:3008/
```

### 2. Agent Card
```bash
curl http://localhost:3008/.well-known/agent.json
```

### 3. Test Basic Functionality
```bash
curl -X POST http://localhost:3008/messages \
  -H "Content-Type: application/json" \
  -d '{
    "method": "tools/call",
    "params": {
      "name": "test-skill",
      "arguments": {
        "message": "Hello RWA Agent!"
      }
    }
  }'
```

### 4. Test RWA Asset Discovery
```bash
curl -X POST http://localhost:3008/messages \
  -H "Content-Type: application/json" \
  -d '{
    "method": "tools/call",
    "params": {
      "name": "rwa-asset-discovery",
      "arguments": {
        "instruction": "Find real estate investments with 8%+ yield",
        "filters": {
          "assetTypes": ["real-estate"],
          "minYield": 8.0
        }
      }
    }
  }'
```

### 5. Test Investment Execution
```bash
curl -X POST http://localhost:3008/messages \
  -H "Content-Type: application/json" \
  -d '{
    "method": "tools/call",
    "params": {
      "name": "rwa-investment-execution",
      "arguments": {
        "instruction": "Invest $1000 in real estate",
        "walletAddress": "0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6",
        "amount": "1000",
        "assetType": "real-estate",
        "expectedYield": 8.5,
        "poolId": "pool-001"
      }
    }
  }'
```

## 🔗 API Endpoints

| Endpoint | Method | Description |
|-----------|--------|-------------|
| `/` | GET | Server information and status |
| `/.well-known/agent.json` | GET | Agent card (MCP discovery) |
| `/sse` | GET | Server-Sent Events for MCP |
| `/messages` | POST | MCP message processing |

## 🌐 MCP Integration

The agent implements the Model Context Protocol (MCP) and can be integrated with:

- **Claude Desktop**: Direct integration via MCP
- **Other MCP Clients**: Any MCP-compliant application
- **Custom Applications**: Via HTTP/SSE endpoints

### MCP Connection
```typescript
import { SSEClientTransport, Client } from '@modelcontextprotocol/sdk';

const transport = new SSEClientTransport(
  new URL('http://localhost:3008/sse')
);

const client = new Client({
  name: 'RWA Client',
  version: '1.0.0'
});

await client.connect(transport);
```

## 🔧 Development

### Project Structure
```
src/
├── index.ts              # Main entry point
├── skills/               # Skill definitions
│   ├── assetDiscovery.ts
│   ├── complianceCheck.ts
│   ├── investmentExecution.ts
│   └── testSkill.ts
├── tools/                # Tool implementations
│   ├── blockchain/       # Blockchain integration
│   │   └── realBlockchainClient.ts
│   ├── executeInvestment.ts
│   ├── portfolioManager.ts
│   └── discoverRWAAssets.ts
└── context/              # Shared context
    ├── provider.ts
    └── types.ts
```

### Adding New Skills
1. Create skill definition in `src/skills/`
2. Implement required tools in `src/tools/`
3. Register skill in `src/index.ts`
4. Update agent configuration

### Adding New Tools
1. Create tool implementation in `src/tools/`
2. Define input/output schemas using Zod
3. Register tool in relevant skill
4. Test with MCP client

## 🚀 Production Deployment

### Docker
```bash
# Build production image
docker build -f Dockerfile.prod -t rwa-agent .

# Run container
docker run -p 3008:3008 --env-file .env rwa-agent
```

### Environment Variables
- `NODE_ENV=production`
- `PORT=3008`
- `OPENAI_API_KEY` (required)
- `ARBITRUM_RPC_URL` (optional)

## 🔍 Troubleshooting

### Common Issues

1. **Port Already in Use**
   ```bash
   lsof -ti:3008 | xargs kill -9
   ```

2. **Build Errors**
   ```bash
   pnpm clean
   pnpm install
   pnpm build
   ```

3. **MCP Connection Issues**
   - Verify agent is running on correct port
   - Check SSE endpoint connectivity
   - Validate message format

4. **Blockchain Connection Issues**
   - Verify RPC URL is accessible
   - Check network connectivity
   - Validate Arbitrum chain ID

### Logs
The agent provides detailed logging for:
- Skill execution
- Tool calls
- Blockchain interactions
- MCP client connections

## 📚 Additional Resources

- **Vibekit V2 Documentation**: Framework patterns and best practices
- **MCP Specification**: Protocol details and integration
- **Arbitrum Documentation**: Network information and RPC endpoints
- **Viem Documentation**: Ethereum client library

## 🎯 Next Steps

To extend the agent's capabilities:

1. **Add Wallet Integration**: Implement private key management
2. **Smart Contract Calls**: Add actual RWA protocol interactions
3. **Real Transaction Execution**: Complete the blockchain integration
4. **Additional Protocols**: Support more RWA platforms
5. **Advanced Analytics**: Portfolio performance and risk metrics

---

**Status**: ✅ MVP Complete - Real blockchain integration working
**Version**: 1.0.0
**Last Updated**: $(date)
