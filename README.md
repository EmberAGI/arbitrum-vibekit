#  Arbitrum Bridge MCP Server

**The most advanced cross-chain bridge tooling for AI agents** - featuring intent-based bridging, multi-protocol intelligence, and production-grade security.

##  Breakthrough Features

###  Intent-Based Bridging
- **Natural Language Interface**: "Bridge 100 USDC to Ethereum with low fees"
- **Smart Protocol Selection**: AI compares Across vs Stargate routes automatically
- **Execution Planning**: Complete transaction workflows with optimal parameters

###  Multi-Protocol Intelligence
- **Across Protocol**: Fast, secure bridging with UMA optimistic oracle
- **Stargate V2**: Credit-based bridging across 6+ chains
- **Unified Interface**: One API for multiple bridge protocols

###  Advanced Security
- **Oracle Validation**: Chainlink price feeds verify destination amounts
- **Permit Integration**: EIP-2612 & Permit2 for gasless approvals
- **Slippage Protection**: Dynamic slippage calculation with deadline enforcement
- **MEV Protection**: Built-in safeguards against front-running

##  Production Metrics

- ✅ **18+ Production-Ready Tools**
- ✅ **1,547 lines of TypeScript**
- ✅ **Comprehensive Testing Suite**
- ✅ **Professional Documentation**
- ✅ **Multiple Demo Interfaces**

##  Quick Start

### Prerequisites
- Node.js 18+
- pnpm or npm
- Arbitrum RPC access

### Installation

```bash
# Clone the repository
git clone https://github.com/WuodOdhis/arbitrum-bridge-mcp-server.git
cd arbitrum-bridge-mcp-server

# Install dependencies
npm install

# Set up environment
cp .env.example .env
# Edit .env with your RPC URLs

# Build the project
npm run build

# Run the comprehensive demo
node showcase.js
```

### MCP Inspector Integration

```bash
# Start MCP server with Inspector
npm run inspect:npx
```

##  Core Tools

### Bridge Operations
- `list_routes` - Discover available bridge routes
- `estimate_bridge_quote` - Get bridge quotes with fees
- `build_bridge_tx` - Create unsigned bridge transactions

### Stargate V2 Integration
- `list_stargate_pools` - Available liquidity pools
- `get_stargate_credit` - Check available bridge credits
- `get_stargate_quote` - Get Stargate-specific quotes
- `build_stargate_bridge_tx` - Create Stargate transactions

### Intent-Based Bridging
- `process_bridge_intent` - Natural language → Optimized transactions

### Security & Validation
- `get_oracle_price` - Chainlink oracle prices
- `validate_dest_quote_against_oracle` - Price validation
- `compute_min_destination_amount` - Slippage protection
- `compute_deadline` - Transaction deadline calculation

### Approval Management
- `build_approval_tx` - Standard ERC-20 approvals
- `build_eip2612_permit` - Gasless permit signatures
- `build_permit2_permit` - Uniswap Permit2 integration

##  Testing & Demo

### CLI Showcase (Recommended)
```bash
node showcase.js
```
**Best for reviewers** - Comprehensive demonstration of all features.

### Interactive Web Demo
```bash
./start-web-demo.sh
```
Opens `http://localhost:3002` with click-to-test interface.

### MCP Inspector
```bash
npm run inspect:npx
```
Professional MCP client for detailed tool inspection.

##  Architecture

### Transport Layer
- **STDIO**: Direct MCP client integration
- **HTTP SSE**: Web-based MCP clients
- **Dual Mode**: Both transports simultaneously

### Security-First Design
- **Zod Validation**: Strict input/output schemas
- **Oracle Integration**: Real-time price validation  
- **Permit Support**: Gasless approval workflows
- **No Signing**: Only unsigned transaction artifacts

### Multi-Protocol Support
- **Across Protocol**: Optimistic oracle bridging
- **Stargate V2**: LayerZero-based credit system
- **Extensible**: Easy to add new protocols

##  Supported Networks

- **Arbitrum One** (Primary): Chain ID 42161
- **Ethereum Mainnet**: Chain ID 1
- **Extensible**: Framework supports additional chains

##  Example Workflows

### Intent-Based Bridge
```typescript
// Natural language input
{
  "intent": "Bridge 100 USDC to Ethereum with low fees and high speed",
  "userAddress": "0x...",
  "priority": "speed"
}

// AI processes and returns optimized execution plan
{
  "recommendedProtocol": "across",
  "executionPlan": [...],
  "estimatedTime": "2-3 minutes",
  "totalFees": "$0.85"
}
```

### Multi-Protocol Comparison
```typescript
// Get quotes from both protocols
const acrossQuote = await getAcrossQuote({...});
const stargateQuote = await getStargateQuote({...});

// AI compares and recommends best option
const recommendation = await compareProtocols({
  across: acrossQuote,
  stargate: stargateQuote,
  priority: "cost" // or "speed"
});
```

##  Arbitrum Trailblazer Fund 2.0

This project represents a significant advancement in DeFi tooling:

- **First Intent-Based Bridge Interface** in the ecosystem
- **Multi-Protocol Intelligence** for optimal routing
- **Production-Ready Security** with oracle validation
- **Comprehensive Documentation** and testing
- **Extensible Architecture** for future protocols

##  License

MIT License - See [LICENSE](LICENSE) file for details.

##  Contributing

Contributions welcome! Please read our contributing guidelines and submit pull requests.

---

**Built for the Arbitrum Ecosystem**  **Powered by AI Intelligence**  **Secured by Oracles** 
