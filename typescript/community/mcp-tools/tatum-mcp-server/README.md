# Tatum MCP Server - Arbitrum Blockchain Data Access

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/typescript-%5E5.0.0-blue)](https://www.typescriptlang.org/)

A Model Context Protocol (MCP) server that provides seamless access to Arbitrum blockchain data through Tatum's high-performance RPC gateway. This server enables AI agents to query real-time blockchain information with human-readable formatted responses.

## Features

- **Multi-transport support**: HTTP SSE, STDIO, and StreamableHTTP
- **High-performance**: Uses Tatum's optimized RPC infrastructure
- **Secure**: Allow-listed RPC methods with rate limiting
- **Human-readable**: Automatic decimal conversions and formatting
- **Comprehensive data**: Blocks, transactions, balances, and event logs
- **Agent-ready**: Pre-integrated with Vibekit agents
- **Developer-friendly**: Full TypeScript support with Zod validation

## Quick Start

### Prerequisites

- Node.js 18+
- pnpm package manager
- Tatum API key ([get one here](https://dashboard.tatum.io/))

### Installation

```bash
# Clone the repository
git clone https://github.com/EmberAGI/arbitrum-vibekit.git
cd arbitrum-vibekit/typescript/community/mcp-tools/tatum-mcp-server

# Install dependencies
pnpm install

# Build the project
pnpm build
```

### Environment Setup

Create a `.env` file in the project root:

```bash
# Tatum API Configuration
TATUM_API_KEY=t-68c0331426bfac180d40e83f-ca6c92bad2e54c24874a8a44

# Chain Configuration (optional, defaults to Arbitrum One Mainnet)
TATUM_CHAIN=arbitrum-one-mainnet

# Server Configuration (optional, defaults to 3010)
PORT=3010
```

### Running the Server

```bash
# Development mode
pnpm dev

# Production mode
pnpm build && pnpm start
```

You should see:
```
Tatum MCP server listening on 3010
```

## Available Tools

The Tatum MCP server exposes 7 core blockchain tools:

### 1. `get_block_number`
Get the latest Arbitrum block number.

**Parameters:** None

**Example:**
```json
{}
```

**Response:**
```json
{
  "hex": "0x168781ab",
  "decimal": "378291755"
}
```

### 2. `get_native_balance`
Get native ETH balance for an address with automatic conversion.

**Parameters:**
- `address` (string): EVM address to query

**Example:**
```json
{
  "address": "0x742d35Cc6074C4532895c05b22629ce5b3c28da4"
}
```

**Response:**
```json
{
  "address": "0x742d35Cc6074C4532895c05b22629ce5b3c28da4",
  "hexWei": "0x189588672da7830",
  "wei": "1135899906590000",
  "ether": "1.13589990659"
}
```

### 3. `get_token_balance`
Get ERC-20 token balance with automatic decimal formatting.

**Parameters:**
- `tokenAddress` (string): ERC-20 token contract address
- `address` (string): Owner address to query

**Example:**
```json
{
  "tokenAddress": "0x912CE59144191C1204E64559FE8253a0e49E6548",
  "address": "0x742d35Cc6074C4532895c05b22629ce5b3c28da4"
}
```

**Response:**
```json
{
  "tokenAddress": "0x912CE59144191C1204E64559FE8253a0e49E6548",
  "address": "0x742d35Cc6074C4532895c05b22629ce5b3c28da4",
  "hex": "0x0000000000000000000000000000000000000000000000000000000010da2569",
  "raw": "45454569",
  "decimals": 18,
  "formatted": "0.045454569"
}
```

### 4. `get_block_by_number`
Get complete block information by number or tag.

**Parameters:**
- `tagOrNumber` (string): Block number (hex/dec) or tag ("latest", "pending", "earliest")
- `full` (boolean, optional): Include full transaction objects (default: false)

**Example:**
```json
{
  "tagOrNumber": "latest",
  "full": true
}
```

**Response:** Complete block object with transactions, headers, and metadata.

### 5. `get_transaction_by_hash`
Get detailed transaction information by hash.

**Parameters:**
- `hash` (string): Transaction hash

**Example:**
```json
{
  "hash": "0xd6a6f4f02be772ae5cc27728ce4e21b9db1ae094a8ee3b591bb0df3f9b4e9380"
}
```

**Response:** Complete transaction object with from/to addresses, value, gas, input data, etc.

### 6. `get_logs`
Query event logs with flexible filtering options.

**Parameters:**
- `fromBlock` (string, optional): Starting block
- `toBlock` (string, optional): Ending block
- `address` (string, optional): Contract address filter
- `topics` (array, optional): Topic filters (up to 4 topics)

**Example:**
```json
{
  "fromBlock": "0x16877f00",
  "toBlock": "latest",
  "address": "0x912CE59144191C1204E64559FE8253a0e49E6548",
  "topics": ["0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef"]
}
```

**Response:** Array of matching log entries.

### 7. `rpc_call`
Allow-listed raw RPC method calls for advanced usage.

**Parameters:**
- `method` (string): RPC method name
- `params` (array): Method parameters

**Supported Methods:**
- `eth_blockNumber`, `eth_getBalance`, `eth_getBlockByNumber`
- `eth_getTransactionByHash`, `eth_getLogs`, `eth_call`
- `eth_chainId`, `eth_gasPrice`, `eth_estimateGas`
- `eth_getCode`, `eth_getTransactionReceipt`

**Example:**
```json
{
  "method": "eth_chainId",
  "params": []
}
```

## Testing with MCP Inspector

The MCP Inspector provides an interactive web interface for testing all Tatum MCP tools:

### Setup

```bash
# Build and launch the inspector
pnpm run inspect:npx
```

This opens:
- **Inspector UI**: http://localhost:6274/
- **Proxy Server**: http://localhost:6277/

### Testing Workflow

1. **Connect**: Select the Tatum MCP server session from the available options
2. **Test Tools**: Click on any tool and provide test parameters
3. **View Results**: See formatted JSON responses in real-time

### Sample Test Cases

**Block Number Test:**
```json
{}
```
→ Returns current block in hex and decimal

**Native Balance Test:**
```json
{
  "address": "0x742d35Cc6074C4532895c05b22629ce5b3c28da4"
}
```
→ ETH balance in multiple formats

**Token Balance Test:**
```json
{
  "tokenAddress": "0x912CE59144191C1204E64559FE8253a0e49E6548",
  "address": "0x742d35Cc6074C4532895c05b22629ce5b3c28da4"
}
```
→ Token balance with decimal formatting

**Block Query Test:**
```json
{
  "tagOrNumber": "0x16877f00",
  "full": false
}
```
→ Block header information

**Transaction Query Test:**
```json
{
  "hash": "0xd6a6f4f02be772ae5cc27728ce4e21b9db1ae094a8ee3b591bb0df3f9b4e9380"
}
```
→ Complete transaction details

**Event Logs Test:**
```json
{
  "fromBlock": "0x16877f00",
  "toBlock": "0x16877f10",
  "address": "0x912CE59144191C1204E64559FE8253a0e49E6548"
}
```
→ Filtered event logs

## Integration with Vibekit Agents

### Agent Integration

Add the Tatum MCP server to your custom agent:

```typescript
// In your agent configuration
export const myAgentConfig = {
  skills: [
    {
      id: 'chain-data',
      name: 'Chain Data',
      description: 'Query Arbitrum blockchain data',
      mcpServers: {
        'tatum-gateway': {
          url: process.env.TATUM_MCP_SERVER_URL || 'http://localhost:3010',
          alwaysAllow: [
            'get_block_number',
            'get_native_balance',
            'get_token_balance',
            'get_block_by_number',
            'get_transaction_by_hash',
            'get_logs',
            'rpc_call'
          ]
        }
      },
      tools: [/* Import Tatum MCP tools */],
    }
  ]
};
```

## Architecture

### Core Components

- **Transport Layer**: HTTP SSE + STDIO for maximum compatibility
- **RPC Client**: Tatum gateway integration with retry logic
- **Tool Registry**: 7 core blockchain tools with Zod validation
- **Response Formatter**: Automatic decimal conversion and pretty-printing
- **Error Handling**: Comprehensive retry logic with rate limit detection

### Security Features

- **Allow-listed Methods**: Only approved RPC methods can be called
- **Rate Limiting**: Built-in retry logic with exponential backoff
- **Input Validation**: Zod schemas ensure type safety
- **Error Sanitization**: Safe error messages without exposing sensitive data

### Performance Optimizations

- **Connection Pooling**: Efficient HTTP connection management
- **Response Caching**: Optional caching for frequently accessed data
- **Batch Processing**: Support for batch RPC requests
- **Compression**: Optimized data transfer

## Configuration Options

| Variable | Default | Description |
|----------|---------|-------------|
| `TATUM_API_KEY` | Required | Your Tatum API key |
| `TATUM_CHAIN` | `arbitrum-one-mainnet` | Target blockchain network |
| `PORT` | `3010` | Server port for HTTP transport |

### Supported Chains

- `arbitrum-one-mainnet` (default)
- `arbitrum-one-sepolia`
- `arb-nova-mainnet`

## Troubleshooting

### Common Issues

**"TATUM_API_KEY is required"**
- Ensure your `.env` file contains the API key
- Verify the key is valid and has proper permissions

**"HTTP 404" errors**
- Check server is running: `lsof -i :3010`
- Verify `TATUM_MCP_SERVER_URL` matches server URL

**"Rate limit exceeded"**
- Server includes automatic retry with backoff
- Consider upgrading Tatum plan for higher limits

**"Method not allowed" in rpc_call**
- Only pre-approved methods are allowed for security
- Use specific tools for common operations

### Debug Mode

Enable detailed logging:

```typescript
// Add to src/index.ts
console.error('Debug:', { method, params, response });
```

### Health Checks

Server exposes health endpoints:
- `GET /` - Server information and available tools
- `GET /.well-known/agent.json` - Agent card for discovery

## Performance Tips

- **Use Specific Tools**: Prefer `get_native_balance` over raw `rpc_call`
- **Filter Logs**: Always specify `address` and `topics` in `get_logs`
- **Batch Requests**: Use `rpc_call` for multiple operations
- **Cache Results**: Implement local caching for static data

## Contributing

1. Fork the repository
2. Create a feature branch
3. Add tests for new functionality
4. Submit a pull request

### Development Setup

```bash
# Install dependencies
pnpm install

# Run tests
pnpm test

# Build for production
pnpm build

# Launch inspector for testing
pnpm run inspect:npx
```

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Links

- [Tatum Documentation](https://docs.tatum.io/)
- [Arbitrum Documentation](https://docs.arbitrum.io/)
- [Model Context Protocol](https://modelcontextprotocol.io/)
- [Vibekit Repository](https://github.com/EmberAGI/arbitrum-vibekit)

---

**Built for the Arbitrum ecosystem**

For questions or support, please open an issue on the [GitHub repository](https://github.com/EmberAGI/arbitrum-vibekit).
