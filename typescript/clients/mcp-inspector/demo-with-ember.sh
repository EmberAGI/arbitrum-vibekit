#!/bin/bash

# Demo script to run MCP Inspector with Ember MCP server (no auth)
# Usage: ./demo-with-ember.sh

set -e

echo "🚀 Starting MCP Inspector Demo with Ember..."
echo "🔒 Authentication: DISABLED for demo purposes"
echo ""

# Set environment variables to disable authentication
export DANGEROUSLY_OMIT_AUTH=true
export MCP_AUTO_OPEN_ENABLED=true

# Get the directory where this script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"
REPO_ROOT="$SCRIPT_DIR/../../.."

echo "📁 Repository root: $REPO_ROOT"
echo ""

# Function to cleanup background processes
cleanup() {
    echo ""
    echo "🛑 Shutting down services..."
    if [ ! -z "$EMBER_PID" ]; then
        kill $EMBER_PID 2>/dev/null || true
    fi
    if [ ! -z "$INSPECTOR_PID" ]; then
        kill $INSPECTOR_PID 2>/dev/null || true
    fi
    exit 0
}

# Set up signal handlers
trap cleanup SIGINT SIGTERM

# Start Ember MCP Server in background
echo "🔥 Starting Ember MCP Server..."
cd "$REPO_ROOT/typescript/lib/mcp-tools/emberai-mcp"
pnpm start &
EMBER_PID=$!
echo "   Ember MCP Server PID: $EMBER_PID"

# Wait a bit for Ember server to start
echo "⏳ Waiting for Ember MCP server to initialize..."
sleep 3

# Start MCP Inspector
echo "🔍 Starting MCP Inspector (no auth)..."
cd "$SCRIPT_DIR"
npm run start &
INSPECTOR_PID=$!
echo "   Inspector PID: $INSPECTOR_PID"

echo ""
echo "✅ Both services are starting up!"
echo ""
echo "📋 Demo Instructions:"
echo "   1. Browser should open automatically at http://localhost:6274"
echo "   2. Click 'Connect to Server'"
echo "   3. Enter server details:"
echo "      - Transport: stdio"
echo "      - Command: node"
echo "      - Args: $REPO_ROOT/typescript/lib/mcp-tools/emberai-mcp/dist/index.js"
echo "   4. Click 'Connect' to start using Ember's MCP tools"
echo ""
echo "🔗 Manual URLs:"
echo "   Inspector:   http://localhost:6274"
echo "   Ember Server: Running on stdio (background process)"
echo ""
echo "Press Ctrl+C to stop all services"

# Wait for background processes
wait $INSPECTOR_PID 