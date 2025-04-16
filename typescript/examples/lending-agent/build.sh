#!/bin/bash
set -e

# Get the directory of this script
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Navigate to the repo root (assuming the script is in typescript/examples/lending-agent)
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"

# Create the directory for emberai-mcp if it doesn't exist
mkdir -p "$SCRIPT_DIR/mcp-tools/emberai-mcp"

# Copy emberai-mcp from the source location to lending-agent directory
echo "Copying emberai-mcp from $REPO_ROOT/typescript/mcp-tools/emberai-mcp to $SCRIPT_DIR/mcp-tools/emberai-mcp"
cp -r "$REPO_ROOT/typescript/mcp-tools/emberai-mcp/"* "$SCRIPT_DIR/mcp-tools/emberai-mcp/"

# Run docker compose to build and start the container
echo "Running docker compose up --build"
docker compose up --build

# Cleanup the copied files when done
# Uncomment the following line if you want to automatically clean up after build
# rm -rf "$SCRIPT_DIR/mcp-tools" 