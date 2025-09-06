#!/bin/bash

# Enhanced Bridge MCP Server - Web Testing Interface Launcher
# This script starts the functional web testing interface

echo "🚀 Enhanced Bridge MCP Server - Web Testing Interface"
echo "=================================================="
echo ""

# Check if build is up to date
if [ ! -d "dist" ]; then
    echo "📦 Building project..."
    pnpm build
    echo ""
fi

# Check for .env file
if [ ! -f ".env" ]; then
    echo "⚠️  Warning: No .env file found."
    echo "💡 Create .env with:"
    echo "   ARBITRUM_RPC_URL=https://arb1.arbitrum.io/rpc"
    echo "   ETHEREUM_RPC_URL=https://rpc.ankr.com/eth"
    echo ""
fi

echo "🌐 Starting API server..."
echo "📱 Web interface will be available at: http://localhost:3001"
echo ""
echo "🎯 Features you can test:"
echo "   • Intent-based bridging (breakthrough feature)"
echo "   • Stargate V2 multi-chain integration"
echo "   • Advanced security features"
echo "   • All 18+ production-ready tools"
echo ""
echo "🛑 Press Ctrl+C to stop the server"
echo ""

# Start the API server
node api-server.js
