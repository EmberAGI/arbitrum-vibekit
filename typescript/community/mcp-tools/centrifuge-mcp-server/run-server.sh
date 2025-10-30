#!/bin/bash

# Simple wrapper script to run the centrifuge MCP server
# This ensures the correct PATH and working directory are used

export PATH="/opt/homebrew/bin:/opt/homebrew/sbin:$PATH"
cd /Users/griffinsoduol/Desktop/OtherProjects/arbitrum-vibekit/typescript/lib/mcp-tools/centrifuge-mcp-server

echo "🚀 Starting Centrifuge MCP Server..."
echo "📁 Working directory: $(pwd)"
echo "🔧 Node path: $(which node)"
echo "📋 Node version: $(node --version)"

/opt/homebrew/bin/node dist/index.js
