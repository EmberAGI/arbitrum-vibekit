# HTTP MCP Client Usage Guide

This guide explains how to use the new HTTP MCP client support in Vibekit framework, which allows skills to connect to remote MCP servers over HTTP/HTTPS.

## Overview

The Vibekit framework now supports both local (stdio) and remote (HTTP) MCP servers. This enables agents to connect to cloud-based MCP services like Ember's on-chain tools.

## Configuration

### HTTP MCP Server Configuration

```typescript
import { defineSkill, HttpMcpConfig } from 'arbitrum-vibekit-core';

export const mySkill = defineSkill({
  id: 'my-skill',
  name: 'My Skill',
  description: 'A skill that uses HTTP MCP servers',
  tags: ['example'],
  examples: ['do something with remote tools'],
  inputSchema: z.object({
    action: z.string(),
  }),
  mcpServers: {
    // HTTP MCP server configuration
    'remote-server': {
      url: 'https://api.example.com/mcp',
      headers: {
        Authorization: 'Bearer YOUR_API_KEY',
        'X-Custom-Header': 'value',
      },
      alwaysAllow: ['toolName1', 'toolName2'], // Optional: auto-approve these tools
      disabled: false, // Optional: set to true to disable this server
    } as HttpMcpConfig,
  },
  tools: [
    /* your tools */
  ],
});
```

### Mixed HTTP and Stdio Servers

Skills can use both HTTP and local MCP servers simultaneously:

```typescript
export const hybridSkill = defineSkill({
  id: 'hybrid-skill',
  name: 'Hybrid Skill',
  description: 'Uses both local and remote MCP servers',
  tags: ['hybrid'],
  examples: ['combine local and remote tools'],
  inputSchema: z.object({
    query: z.string(),
  }),
  mcpServers: {
    // HTTP server
    'ember-onchain': {
      url: process.env.EMBER_MCP_SERVER_URL || 'https://api.emberai.xyz/mcp',
    } as HttpMcpConfig,

    // Local stdio server
    'local-tools': {
      command: 'node',
      args: ['./local-mcp-server.js'],
      env: {
        DEBUG: 'true',
      },
    } as StdioMcpConfig,
  },
  tools: [
    /* your tools */
  ],
});
```

## Features

### Authentication Headers

HTTP MCP servers support custom headers for authentication:

```typescript
headers: {
  'Authorization': 'Bearer YOUR_TOKEN',
  'API-Key': 'YOUR_API_KEY',
  'X-Session-ID': 'session123'
}
```

### Tool Auto-Approval

The `alwaysAllow` field lets you pre-approve specific tools to avoid user prompts:

```typescript
alwaysAllow: ['getBalance', 'getTokenInfo', 'estimateGas'];
```

### Server Disabling

Temporarily disable a server without removing its configuration:

```typescript
mcpServers: {
  'test-server': {
    url: 'https://test.example.com/mcp',
    disabled: true // Server won't be connected
  }
}
```

## Environment Variables

Best practice is to use environment variables for sensitive data:

```typescript
mcpServers: {
  'production-server': {
    url: process.env.MCP_SERVER_URL!,
    headers: {
      'Authorization': `Bearer ${process.env.MCP_API_TOKEN!}`
    }
  }
}
```

## Backward Compatibility

The framework maintains full backward compatibility with existing stdio MCP servers:

```typescript
// Legacy format still supported
mcpServers: {
  'legacy-server': {
    command: 'node',
    moduleName: 'my-mcp-tool-server', // Deprecated but still works
    env: { NODE_ENV: 'production' }
  }
}

// New format (recommended)
mcpServers: {
  'modern-server': {
    command: 'node',
    args: ['path/to/server.js', '--port', '3000'],
    env: { NODE_ENV: 'production' }
  }
}
```

## Real-World Example: Ember Integration

```typescript
export const swappingSkill = defineSkill({
  id: 'token-swapping',
  name: 'Token Swapping',
  description: 'Swap tokens on Arbitrum via Camelot DEX',
  tags: ['defi', 'trading', 'camelot'],
  examples: ['swap 100 USDC to ETH', 'exchange WETH for ARB'],
  inputSchema: z.object({
    instruction: z.string(),
    userAddress: z.string(),
  }),
  mcpServers: {
    'ember-onchain': {
      url: process.env.EMBER_MCP_SERVER_URL || 'https://api.emberai.xyz/mcp',
      alwaysAllow: ['getTokens', 'swapTokens'],
    },
  },
  tools: [swapTokensTool],
});
```

## Debugging

The framework logs connection attempts for debugging:

```
Setting up MCP client for skill "token-swapping", server: ember-onchain
Initializing MCP client transport...
Connecting to HTTP MCP server at https://api.emberai.xyz/mcp
HTTP MCP client connected successfully.
```

## Error Handling

Connection failures are logged with details:

```
Failed to initialize MCP client transport or connect: Error: Connection refused
```

Make sure your server URL is correct and accessible from your network.
