# Centrifuge MCP Server

A Model Context Protocol (MCP) server that provides comprehensive tools for interacting with Centrifuge's Real World Asset (RWA) investment platform. This server enables AI agents to discover pools, place investment orders, track performance, and manage RWA portfolios on Centrifuge.

## 🚀 Features

### Core Investment Tools
- **Pool Discovery**: Discover and analyze available Centrifuge investment pools
- **Investment Orders**: Place and cancel investment orders across different tranches
- **Performance Tracking**: Monitor investment performance and returns
- **Portfolio Management**: Rebalance and optimize RWA portfolios

### Advanced Analytics
- **Risk Assessment**: Advanced risk analysis for RWA investments
- **Yield Optimization**: AI-powered yield optimization strategies
- **Transaction History**: Comprehensive transaction tracking and reporting
- **Alert System**: Real-time risk and performance alerts

### Automation Tools
- **Automated Rebalancing**: Execute automated portfolio rebalancing
- **Yield Comparison**: Compare yields across different pools and strategies

## 🛠️ Available Tools

### 1. Pool Discovery (`discover-centrifuge-pools`)
Discover available Centrifuge pools with detailed information about yields, risk profiles, and investment opportunities.

### 2. Investment Status (`get-investment-status`)
Get current status of investments including active positions, pending orders, and portfolio overview.

### 3. Pool Analysis (`analyze-pool-details`)
Analyze detailed information about specific pools including historical performance, risk metrics, and investment terms.

### 4. Place Investment Order (`place-investment-order`)
Place new investment orders in Centrifuge pools with specified amounts, tranche types, and risk parameters.

### 5. Cancel Investment Order (`cancel-investment-order`)
Cancel pending investment orders before execution.

### 6. Portfolio Rebalancing (`portfolio-rebalancing`)
Rebalance existing RWA portfolio across different pools and tranches.

### 7. Yield Optimization (`yield-optimization`)
Optimize portfolio yields based on risk tolerance and investment objectives.

### 8. Transaction History (`transaction-history`)
Retrieve comprehensive transaction history for investment analysis and reporting.

### 9. Performance Tracking (`investment-performance-tracking`)
Track investment performance metrics including returns, risk-adjusted performance, and benchmark comparisons.

### 10. Automated Rebalancing (`automated-rebalancing-execution`)
Execute automated rebalancing strategies based on predefined rules and market conditions.

### 11. Risk Alert System (`risk-alert-system`)
Set up and manage risk alerts for portfolio monitoring and early warning systems.

### 12. Yield Comparison (`yield-comparison-tool`)
Compare yields across different pools, strategies, and time periods.

## 📋 Prerequisites

- Node.js 18+ 
- pnpm package manager
- Access to Centrifuge network (Arbitrum or Ethereum)
- Valid wallet with funds for investments

## 🚀 Quick Start

### 1. Installation

```bash
cd typescript/lib/mcp-tools/centrifuge-mcp-server
pnpm install
```

### 2. Environment Setup

Create a `.env` file with the following variables:

```env
# Centrifuge Configuration
CENTRIFUGE_RPC_URL=https://rpc.arbitrum.io/mainnet
CENTRIFUGE_NETWORK=arbitrum

# Optional: API Keys for enhanced data
CENTRIFUGE_API_KEY=your_api_key_here
```

### 3. Build and Run

```bash
# Build the project
pnpm run build

# Run the MCP server
pnpm start
```

### 4. Test with MCP Inspector

```bash
# Launch MCP Inspector for testing
npx -y @modelcontextprotocol/inspector node ./dist/index.js
```

## 🔧 Configuration

### MCP Inspector Configuration

For testing with MCP Inspector, use this configuration:

```json
{
  "mcpServers": {
    "centrifuge": {
      "command": "node",
      "args": ["./dist/index.js"],
      "cwd": "/path/to/centrifuge-mcp-server"
    }
  }
}
```

### Transport Options

The server supports multiple transport methods:

- **HTTP Transport**: `http://localhost:3001/mcp`
- **STDIO Transport**: Direct process communication
- **StreamableHTTP**: Modern MCP transport with session management

## 📊 Usage Examples

### Basic Pool Discovery

```json
{
  "tool": "discover-centrifuge-pools",
  "parameters": {
    "network": "arbitrum",
    "includeDetails": true
  }
}
```

### Place Investment Order

```json
{
  "tool": "place-investment-order",
  "parameters": {
    "investorAddress": "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
    "poolId": "1",
    "trancheType": "Senior",
    "amount": "1000.00",
    "network": "arbitrum",
    "slippageTolerance": 2
  }
}
```

### Yield Optimization

```json
{
  "tool": "yield-optimization",
  "parameters": {
    "investorAddress": "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
    "riskTolerance": "medium",
    "investmentAmount": "50000",
    "networks": ["arbitrum", "ethereum"]
  }
}
```

## 🧪 Testing

### Run All Tests

```bash
pnpm test
```

### Test Individual Tools

```bash
# Test pool discovery
node dist/test-all-tools.js discover-centrifuge-pools

# Test investment order placement
node dist/test-all-tools.js place-investment-order
```

### Comprehensive Testing

```bash
# Run comprehensive test suite
node dist/test-all-tools-comprehensive.js
```

## 🏗️ Architecture

### Server Structure

```
src/
├── index.ts                 # Main MCP server entry point
├── stdio-server.ts         # STDIO transport implementation
├── tools/                  # Individual tool implementations
│   ├── poolDiscovery.ts
│   ├── placeInvestmentOrder.ts
│   ├── yieldOptimization.ts
│   └── ...
├── types/                  # TypeScript type definitions
│   └── centrifuge.ts
└── utils/                  # Utility functions
    └── sdkClient.ts
```

### Tool Implementation Pattern

Each tool follows a consistent pattern:

1. **Schema Definition**: Zod schemas for parameter validation
2. **Tool Registration**: MCP tool registration with metadata
3. **Execution Logic**: Core business logic implementation
4. **Error Handling**: Comprehensive error handling and logging
5. **Response Formatting**: Standardized response format

## 🔒 Security Considerations

- All transactions require valid wallet signatures
- Input validation using Zod schemas
- Rate limiting for API calls
- Secure handling of private keys and sensitive data
- Network-specific validation for multi-chain support

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Implement your changes with tests
4. Submit a pull request

See [CONTRIBUTIONS.md](../../../../CONTRIBUTIONS.md) for detailed contribution guidelines.

## 📄 License

MIT License - see [LICENSE](../../../../LICENSE) for details.

## 🆘 Support

- **Documentation**: [Vibekit Docs](https://github.com/EmberAGI/arbitrum-vibekit)
- **Issues**: [GitHub Issues](https://github.com/EmberAGI/arbitrum-vibekit/issues)
- **Discord**: [Vibekit Discord](https://discord.com/invite/bgxWQ2fSBR)

## 🔗 Related Projects

- [Centrifuge SDK](https://github.com/centrifuge/centrifuge-sdk)
- [Arbitrum Vibekit Core](https://github.com/EmberAGI/arbitrum-vibekit/tree/main/typescript/lib/arbitrum-vibekit-core)
- [RWA Investment Agent Template](https://github.com/EmberAGI/arbitrum-vibekit/tree/main/typescript/templates/rwa-investment-agent)

