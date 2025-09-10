# CoinGecko MCP Server Integration Example

This document shows how to integrate the CoinGecko MCP server with the existing Arbitrum VibeKit web client.

## 1. Building the MCP Server

First, build the CoinGecko MCP server:

```bash
cd arbitrum-vibekit/typescript/lib/mcp-tools/coingecko-mcp-server
pnpm install
pnpm build
```

## 2. Running the MCP Server

Start the CoinGecko MCP server:

```bash
# Development mode
pnpm dev

# Or production mode
pnpm start
```

The server will start on port 3011 and also provide stdio transport.

## 3. Integration with Web Client

### Option A: Using HTTP/SSE Transport

Update the web client's MCP configuration to include the CoinGecko server:

```typescript
// In your MCP client configuration
const mcpServers = [
  {
    name: 'coingecko',
    url: 'http://localhost:3011/sse',
    tools: ['generate_chart', 'get_supported_tokens']
  }
];
```

### Option B: Using stdio Transport

For direct integration, you can modify the web client to use the stdio transport:

```typescript
// Example: Direct stdio integration
import { spawn } from 'child_process';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const coingeckoProcess = spawn('node', [
  'path/to/coingecko-mcp-server/dist/index.js'
]);

const transport = new StdioClientTransport(coingeckoProcess);
await mcpClient.connect(transport);
```

## 4. Updating the Web Client

### Modify the Tool Agents

Update `arbitrum-vibekit/typescript/clients/web/lib/ai/tools/tool-agents.ts` to include the CoinGecko MCP server:

```typescript
// Add CoinGecko MCP server to the list of servers
const mcpServers = [
  // ... existing servers
  {
    name: 'coingecko',
    url: 'http://localhost:3011/sse',
    description: 'Cryptocurrency price data from CoinGecko'
  }
];
```

### Update Message Renderer

The existing `PriceChart` component should work with the MCP server response. The MCP server returns data in the same format as the original tool:

```typescript
// In message.renderer.tsx, the existing code should work:
if (toolName.endsWith('generate_chart')) {
  // Parse the MCP response
  const mcpResult = JSON.parse(result?.result?.content?.[0]?.text || '{}');
  return <PriceChart data={mcpResult} />;
}
```

## 5. Testing the Integration

### Test with Chat Interface

1. Start the CoinGecko MCP server
2. Start the web client
3. Send a message like: "Generate a price chart for BTC over 30 days"

### Expected Response

The MCP server will return data in this format:

```json
{
  "prices": [[1703980800000, 42000], [1703984400000, 42100], ...],
  "token": "BTC",
  "tokenId": "bitcoin",
  "days": 30,
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

## 6. Environment Configuration

Create a `.env` file in the CoinGecko MCP server directory:

```env
PORT=3011
NODE_ENV=development
```

## 7. Docker Integration (Optional)

Create a `Dockerfile` for the CoinGecko MCP server:

```dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build

EXPOSE 3011

CMD ["npm", "start"]
```

## 8. Production Deployment

For production, you can:

1. Build the MCP server as a Docker container
2. Deploy it alongside your web client
3. Configure the web client to connect to the deployed MCP server

## 9. Monitoring and Logging

The MCP server includes console logging for debugging:

```bash
# Watch the server logs
tail -f coingecko-mcp-server.log

# Or use the built-in logging
pnpm dev 2>&1 | tee server.log
```

## 10. Error Handling

The integration handles various error scenarios:

- **MCP Server Unavailable**: Graceful fallback to local tools
- **API Rate Limiting**: Automatic retry with exponential backoff
- **Invalid Tokens**: Clear error messages
- **Network Issues**: Timeout handling and retry logic

## 11. Performance Considerations

- The MCP server caches responses for better performance
- Rate limiting prevents API abuse
- Retry logic handles temporary failures
- SSE transport provides real-time communication

## 12. Security

- No API keys required for CoinGecko (public API)
- HTTP/SSE transport can be secured with HTTPS
- Input validation prevents injection attacks
- Rate limiting prevents abuse

This integration provides a seamless way to use the CoinGecko MCP server with your existing web client while maintaining the same user experience. 