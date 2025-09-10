#!/bin/bash

# Post-installation configuration script

echo "🚀 Setting up Trendmoon MCP Server..."

# Copy .env.example to .env if .env doesn't exist
if [[ ! -f ".env" ]]; then
    cp .env.example .env
    echo "✅ .env file created from .env.example"
    echo "⚠️  Don't forget to configure your environment variables in .env"
else
    echo "ℹ️  .env file already exists"
fi

# Install dependencies
echo "📦 Installing dependencies..."
pnpm install

# Build the project
echo "🔨 Building project..."
pnpm build

echo "✅ Setup complete!"
echo ""
echo "To test the server:"
echo "  - Stdio mode: pnpm start"
echo "  - HTTP mode: TRENDMOON_HTTP_MODE=true pnpm dev"
echo "  - Docker: pnpm docker:compose:up"
